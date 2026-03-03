import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html, Sphere } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { getActiveTasks, hammerTask } from '../../store/taskStore';
import { isPast, isToday, getTodayBJ } from '../../store/dateUtils';
import { exportAllLogs } from '../../store/actionLogStore';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Hammer } from 'lucide-react';

// --- 1. Utilities and Colors ---
function getStarColorAndStatus(task) {
    if (task.status === 'completed') return { color: '#4ade80', statusText: 'Completed' }; // Green
    const len = task.active_dates.length;
    const lastActiveDate = task.active_dates[len > 0 ? len - 1 : 0];
    if (lastActiveDate && isPast(lastActiveDate) && !isToday(lastActiveDate)) return { color: '#f59e0b', statusText: 'Overdue' }; // Orange
    return { color: '#60a5fa', statusText: 'Active' }; // Blue
}

// --- 2. Camera Rig (Right-Click Focus & Spacebar Reset) ---
function CameraRig({ focusTarget, resetTrigger, onResetComplete, controlsRef }) {
    const { camera } = useThree();

    // Store regular target and initial camera pos
    const initialPos = useMemo(() => new THREE.Vector3(0, 0, 40), []);
    const initialTarget = useMemo(() => new THREE.Vector3(0, 0, 0), []);

    useFrame((state, delta) => {
        if (!controlsRef.current) return;

        if (resetTrigger) {
            // Animate back to global origin
            controlsRef.current.target.lerp(initialTarget, 0.05);
            camera.position.lerp(initialPos, 0.05);

            // If close enough, complete reset
            if (camera.position.distanceTo(initialPos) < 1 && controlsRef.current.target.distanceTo(initialTarget) < 1) {
                onResetComplete();
            }
        } else if (focusTarget) {
            // Animate to focus target
            controlsRef.current.target.lerp(focusTarget, 0.05);
            const desiredCameraPos = new THREE.Vector3().copy(focusTarget).add(new THREE.Vector3(0, 1, 12));
            camera.position.lerp(desiredCameraPos, 0.05);
        }
    });
    return null;
}

// --- 3. Global Flash Manager ---
function GlobalFlashManager({ globalFlashTime }) {
    const { gl } = useThree();
    const originalExposure = useMemo(() => gl.toneMappingExposure || 1, [gl]);

    useFrame((state, delta) => {
        const timeSinceFlash = Date.now() - globalFlashTime;
        if (timeSinceFlash < 1000) {
            // Spike exposure up to 3x, then decay back to normal exponentially
            const intensity = Math.max(0, 1 - (timeSinceFlash / 1000));
            gl.toneMappingExposure = originalExposure + (intensity * 2.5);

            // Also animate ambient light of the scene if possible, but toneMapping is cleaner
        } else {
            gl.toneMappingExposure = THREE.MathUtils.lerp(gl.toneMappingExposure, originalExposure, 0.1);
        }
    });
    return null;
}

// --- 4. Hammer Orbital Energy Rings ---
function HammerRayRing({ index, total, baseColor, isDimmed }) {
    const ref = useRef();

    // Deterministic angles to create a beautiful spherical astrolabe/gyroscope
    const rx = Math.PI * (index / total) + (index * 1.37);
    const ry = Math.PI * 0.5 * (index / total) + (index * 0.73);
    const radius = 1.9 + (index * 0.04);

    // Rotation speeds
    const speedX = 0.5 * (index % 2 === 0 ? 1 : -1) + (index * 0.1);
    const speedY = 0.3 * (index % 3 === 0 ? 1 : -1) + (index * 0.05);

    useFrame((state, delta) => {
        if (!ref.current) return;
        // The rings orbit silently in the background
        ref.current.rotation.x += delta * speedX * (isDimmed ? 0.2 : 0.6);
        ref.current.rotation.y += delta * speedY * (isDimmed ? 0.2 : 0.6);
    });

    // Intense multiplying so the rings bloom naturally
    const ringColor = useMemo(() => new THREE.Color(baseColor).multiplyScalar(isDimmed ? 0.8 : 3.0), [baseColor, isDimmed]);

    return (
        <mesh ref={ref} rotation={[rx, ry, Math.PI / 4]}>
            <torusGeometry args={[radius, isDimmed ? 0.005 : 0.015, 4, 64]} />
            <meshBasicMaterial
                color={ringColor}
                transparent
                opacity={isDimmed ? 0.3 : 0.8}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
            />
        </mesh>
    );
}

// --- 5. Single Cinematic Star Component ---
function TaskStar({ task, position, logsCount, isDimmed, onHammer, onRightClick }) {
    const groupRef = useRef();
    const coreMaterialRef = useRef();

    const [hovered, setHovered] = useState(false);

    // Animation states
    const [hammerTime, setHammerTime] = useState(0);

    const { color, statusText } = getStarColorAndStatus(task);
    const lifespan = Math.max(1, task.active_dates.length);
    const targetScale = 0.8 + (lifespan * 0.2); // Base size increased to compensate for lost envelope

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        // Base idle animation: slow non-synchronous pulsing and rotation
        const time = state.clock.getElapsedTime();
        const randomOffset = position[0] * position[1]; // deterministic random
        const pulseSine = Math.sin(time * 0.5 + randomOffset);

        groupRef.current.rotation.y += delta * 0.2;
        groupRef.current.rotation.x += delta * 0.1;

        const timeSinceHammer = Date.now() - hammerTime;
        const isHammering = timeSinceHammer < 800; // Faster 0.8 sec animation

        // --- Core & Halo Logic ---
        if (isHammering) {
            // KINETIC IMPACT: Flash white, rapid expansion, then fade
            const intensity = Math.max(0, 1 - (timeSinceHammer / 500)); // 0 to 1, very fast
            const currentScale = targetScale * (1 + (intensity * 1.5)); // Expand up to 2.5x

            groupRef.current.scale.lerp(new THREE.Vector3(currentScale, currentScale, currentScale), 0.2);

            if (coreMaterialRef.current) {
                // Flash pure white at the start, interpolating back to original color
                const flashColor = new THREE.Color(0xffffff).lerp(new THREE.Color(color), 1 - intensity);
                coreMaterialRef.current.color.copy(flashColor);
                coreMaterialRef.current.emissive.copy(flashColor);
                // Extreme luminance threshold for Bloom
                coreMaterialRef.current.emissiveIntensity = 10 + (intensity * 30);
            }
        } else {
            // IDLE: Return to normal state with subtle fluctuation
            groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.05);

            if (coreMaterialRef.current) {
                coreMaterialRef.current.color.set(color);
                coreMaterialRef.current.emissive.set(color);

                // User Request:
                // 1. Toned down idle big halo from 12.0 to 5.0 so it isn't overly flashy or fatiguing.
                // 2. Hover maintains strong presence (12.0). 
                const baseIntensity = isDimmed ? 1.0 : (hovered ? 12.0 : 5.0);
                const fluctuation = isDimmed ? 0.0 : (pulseSine * 1.5); // Smoother breathing
                coreMaterialRef.current.emissiveIntensity = baseIntensity + fluctuation;
            }
        }
    });

    const isHammerable = task.status === 'pending' && task.active_dates.includes(getTodayBJ());

    const handleLeftClick = (e) => {
        e.stopPropagation();
        if (isHammerable) {
            setHammerTime(Date.now());
            onHammer(task.id);
        }
    };

    const handleRightClick = (e) => {
        e.stopPropagation();
        if (groupRef.current) {
            const worldPos = new THREE.Vector3();
            groupRef.current.getWorldPosition(worldPos);
            onRightClick(worldPos);
        }
    };

    return (
        <group
            key={task.id + "-v3"} // Forces a full remount to clear any cached HMR materials
            position={position}
            ref={groupRef}
        >
            {/* --- 1. Invisible Raycast Hitbox (Stabilizes Hover/Click) --- */}
            <mesh
                visible={false}
                onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(true);
                    document.body.style.cursor = isHammerable ? 'pointer' : 'default';
                }}
                onPointerOut={(e) => {
                    e.stopPropagation();
                    setHovered(false);
                    document.body.style.cursor = 'auto';
                }}
                onClick={handleLeftClick}
                onContextMenu={handleRightClick}
            >
                {/* A slightly larger sphere to make hovering incredibly forgiving and stable */}
                <sphereGeometry args={[1.6, 16, 16]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* --- 2. The Core (Intense Emissive Energy) --- */}
            {/* Base size 1.5, segment density reduced dramatically to 8x8 so the wireframe looks like a very sparse atomic coordinate mesh when dimmed. For active objects, Bloom overrides the low polygon count to keep them looking round. */}
            <Sphere args={[1.5, 6, 6]} raycast={() => null}>
                <meshStandardMaterial
                    ref={coreMaterialRef}
                    toneMapped={false} // Crucial to bypass tone mapping so Bloom picks up high intensity > 1
                    color={color}
                    emissive={color}
                    emissiveIntensity={3}
                    roughness={0.5}
                    wireframe={isDimmed} // User Option 1: Dimmed objects degrade into clean Sci-Fi holograms
                    transparent={isDimmed}
                    opacity={isDimmed ? 0.6 : 1.0}
                />
            </Sphere>

            {/* --- 3. Hammer Interaction Energy Rings --- */}
            {/* Renders up to 24 interlocking data rings, forming a Dyson sphere equivalent to effort spent */}
            {Array.from({ length: Math.min(logsCount, 24) }).map((_, i) => (
                <HammerRayRing key={i} index={i} total={Math.min(logsCount, 24)} baseColor={color} isDimmed={isDimmed} />
            ))}

            {/* --- 5. Tooltip --- */}
            {hovered && (
                <Html
                    position={[2, 1.5, 0]} // Offset strongly to the top-right of the star to avoid obscuring it
                    center={false} // Prevent automatic centering over the raw coordinate coordinates
                    zIndexRange={[100, 0]}
                    style={{ pointerEvents: 'none' }}
                >
                    <div className={`bg-surface/85 backdrop-blur-xl border ${isHammerable ? 'border-accent' : 'border-divider/50'} rounded-xl p-3 shadow-2xl w-56 animate-in fade-in zoom-in duration-200`}>
                        <p className="text-sm font-semibold text-text-primary line-clamp-2">{task.content}</p>
                        <div className="flex justify-between items-center mt-2 text-xs">
                            <span className="text-text-muted">{task.active_dates[task.active_dates.length - 1]}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${task.status === 'completed' ? 'border-green-500/20 text-green-400' : 'border-blue-500/20 text-blue-400'}`}>
                                {statusText}
                            </span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-divider flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 text-accent">
                                <Hammer size={12} className="opacity-80" />
                                <span className="font-medium">{logsCount} Hammers</span>
                            </div>
                            {!isHammerable && <span className="text-[9px] text-text-muted">Locked</span>}
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
}

// --- 5. Main Canvas Scene ---
export default function ThreeDTraceView() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState(getActiveTasks());
    const [allLogs, setAllLogs] = useState(exportAllLogs());

    // UI states
    const todayStr = getTodayBJ();
    const [selectedDateFilter, setSelectedDateFilter] = useState(todayStr);

    // Camera & Interaction states
    const [focusTarget, setFocusTarget] = useState(null);
    const [resetCamera, setResetCamera] = useState(false);
    const orbitControlsRef = useRef();

    // Global Flash / UI Shake states
    const [globalFlashTime, setGlobalFlashTime] = useState(0);
    const [uiShakeKey, setUiShakeKey] = useState(0);

    const handleHammerAction = (taskId) => {
        hammerTask(taskId);
        setAllLogs(exportAllLogs());
        // Trigger global effects
        setGlobalFlashTime(Date.now());
        setUiShakeKey(prev => prev + 1);
    };

    const handleRightClickFocus = (worldPos) => {
        setResetCamera(false);
        setFocusTarget(worldPos);
    };

    const handleCanvasPointerDown = (e) => {
        if (e.button === 0 && focusTarget) {
            setFocusTarget(null);
        }
    };

    // Global Spacebar listener for camera reset
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                setFocusTarget(null);
                setResetCamera(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // High-performance O(M) Hash Map for tracking interactions across millions of logs
    const hammerMap = useMemo(() => {
        const counts = {};
        for (let i = 0; i < allLogs.length; i++) {
            if (allLogs[i].action_type === 'HAMMER') {
                counts[allLogs[i].task_id] = (counts[allLogs[i].task_id] || 0) + 1;
            }
        }
        return counts;
    }, [allLogs]);

    // Layout algorithms O(N)
    const starData = useMemo(() => {
        return tasks.map((task, i) => {
            const phi = Math.acos(-1 + (2 * i) / tasks.length);
            const theta = Math.sqrt(tasks.length * Math.PI) * phi;

            const radius = 35; // Wider spread
            const x = radius * Math.cos(theta) * Math.sin(phi);
            const y = radius * Math.sin(theta) * Math.sin(phi);
            const z = radius * Math.cos(phi);

            // O(1) Instant Lookup instead of the previous O(N) array filtering
            const hammerCount = hammerMap[task.id] || 0;

            // Highlight based on target/active date
            const isDimmed = selectedDateFilter !== '' && !task.active_dates.includes(selectedDateFilter);

            return { task, position: [x, y, z], hammerCount, isDimmed };
        });
    }, [tasks, allLogs, selectedDateFilter]);

    const availableDates = useMemo(() => {
        const dates = new Set();
        tasks.forEach(t => t.active_dates.forEach(d => dates.add(d)));
        return Array.from(dates).sort((a, b) => b.localeCompare(a));
    }, [tasks]);

    return (
        <div className="w-full h-full bg-[#020205] relative overflow-hidden" onContextMenu={(e) => e.preventDefault()}>

            {/* Tactile UI Overlay */}
            <div className="absolute top-0 w-full h-full z-10 pointer-events-none">
                <div className="absolute top-0 w-full p-6 flex justify-between items-start">
                    <div className="space-y-2 pointer-events-auto">
                        <button
                            onClick={() => navigate('/')}
                            className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-surface/20 hover:bg-surface/50 border border-divider/10 hover:border-divider/30 backdrop-blur-md transition-all text-text-muted hover:text-text-primary"
                        >
                            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                            <span className="font-semibold tracking-wide">Return</span>
                        </button>
                        <div className="pl-2 pt-2">
                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-sm">
                                TraceStar
                            </h1>
                            <p className="text-xs text-text-muted tracking-widest uppercase mt-1">Constellation Engine</p>
                        </div>
                    </div>

                    <div className="pointer-events-auto bg-surface/40 backdrop-blur-xl border border-divider/50 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 min-w-[200px]">
                        <div className="flex items-center gap-2 text-text-secondary text-sm font-medium">
                            <Calendar size={16} className="text-accent" />
                            <span>Time Compass</span>
                        </div>
                        <select
                            value={selectedDateFilter}
                            onChange={(e) => {
                                setSelectedDateFilter(e.target.value);
                            }}
                            className="w-full bg-black/30 border border-divider/30 rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 transition-colors cursor-pointer appearance-none"
                        >
                            <option value="">All Time (Galaxy)</option>
                            {availableDates.map(date => (
                                <option key={date} value={date}>
                                    {date === todayStr ? `Today (${date})` : date}
                                </option>
                            ))}
                        </select>
                        <div className="pt-2 mt-1 border-t border-divider/30 text-[10px] text-text-muted flex flex-col gap-1">
                            <div className="flex justify-between"><span>L-Click:</span> <span className="text-text-secondary">Hammer</span></div>
                            <div className="flex justify-between"><span>R-Click:</span> <span className="text-text-secondary">Focus</span></div>
                            <div className="flex justify-between"><span>Space:</span> <span className="text-text-secondary">Reset View</span></div>
                            <div className="flex justify-between"><span>Scroll:</span> <span className="text-text-secondary">Zoom</span></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3D Viewport with Post-Processing Stack */}
            <div className="w-full h-full" onPointerDown={handleCanvasPointerDown} onWheel={() => setFocusTarget(null)}>
                {/* Enable flat and linear encoding if using post-processing to avoid dual tone-mapping, 
                    but R3F usually handles this ok. We will rely on EffectComposer. */}
                <Canvas camera={{ position: [0, 0, 40], fov: 60 }} gl={{ toneMappingExposure: 1 }}>
                    <ambientLight intensity={0.2} />
                    <pointLight position={[20, 20, 20]} intensity={1.5} color="#ffffff" />
                    <pointLight position={[-20, -20, -20]} intensity={0.5} color="#indigo" />

                    {/* Environment */}
                    <Stars radius={100} depth={50} count={7000} factor={4} saturation={1} fade speed={0.5} />

                    {/* Controls & Camera Automation */}
                    <OrbitControls
                        ref={orbitControlsRef}
                        makeDefault
                        enableDamping
                        dampingFactor={0.05}
                        minDistance={3}
                        maxDistance={100}
                    />

                    <CameraRig
                        focusTarget={focusTarget}
                        resetTrigger={resetCamera}
                        onResetComplete={() => setResetCamera(false)}
                        controlsRef={orbitControlsRef}
                    />

                    {/* Controls Global Post-Processing Exposure on Hammer */}
                    <GlobalFlashManager globalFlashTime={globalFlashTime} />

                    {/* Task Nodes */}
                    {starData.map((data) => (
                        <TaskStar
                            key={data.task.id}
                            task={data.task}
                            position={data.position}
                            logsCount={data.hammerCount}
                            isDimmed={data.isDimmed}
                            onHammer={handleHammerAction}
                            onRightClick={handleRightClickFocus}
                        />
                    ))}

                    {/* Professional Post-Processing Stack */}
                    <EffectComposer disableNormalPass>
                        <Bloom
                            luminanceThreshold={1.2} // Lowered threshold so glow triggers easier
                            mipmapBlur
                            intensity={2.5} // Increased widely to create a massive soft optical halo
                        />
                    </EffectComposer>
                </Canvas>
            </div>
        </div>
    );
}
