import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CalendarDays,
    CheckCircle2,
    CircleHelp,
    Clock3,
    Edit2,
    Hammer,
    ListPlus,
    Palette,
    Plus,
    RefreshCw,
    Sparkles,
    Star,
    Trash2,
    X,
} from 'lucide-react';

const steps = [
    {
        icon: Sparkles,
        demo: 'welcome',
        eyebrow: '开始',
        title: '欢迎来到 PlanTrace',
        body: '这里不是只放待办清单，而是把任务、投入、日记和时间轨迹放在同一个本地工作台里。',
        accent: 'var(--color-accent)',
    },
    {
        icon: ListPlus,
        demo: 'addTask',
        eyebrow: '添加任务',
        title: '从顶部输入框写下今天要推进的事',
        body: '在主界面左上方输入任务名，点击右侧加号即可添加。以后也可以用“Plan Future”把任务放到未来日期。',
        accent: 'var(--color-blue-dot)',
    },
    {
        icon: Edit2,
        demo: 'taskRow',
        eyebrow: '任务行',
        title: '这三个位置最容易混淆',
        body: '左侧铅笔点一下是完成今日任务；任务文字双击可以改名；右侧 Hammer 用来记录投入，编辑和删除按钮会在悬浮时出现。',
        accent: 'var(--color-accent)',
    },
    {
        icon: Clock3,
        demo: 'timer',
        eyebrow: '投入记录',
        title: 'Hammer 和原子时钟记录真实投入',
        body: 'Hammer 绑定具体任务，适合记录“我推进了这个任务”；原子时钟记录一段专注时间，适合沉浸式工作。',
        accent: 'var(--color-amber)',
    },
    {
        icon: CalendarDays,
        demo: 'dateDots',
        eyebrow: '日期状态',
        title: '侧边栏光点会告诉你每天的状态',
        body: '绿点代表当日全部完成，蓝点代表仍有待办，灰点代表历史未完成。扫一眼就能看到进度分布。',
        accent: 'var(--color-green-dot)',
    },
    {
        icon: CircleHelp,
        demo: 'topbar',
        eyebrow: '右上角工具',
        title: '常用功能都在右上角',
        body: '问号可重新打开新手指引，更新、日记、周视图、TraceStar 和主题按钮都在同一排，不需要到处找。',
        accent: 'var(--color-green)',
    },
    {
        icon: Palette,
        demo: 'localData',
        eyebrow: '本地优先',
        title: '数据留在你的电脑里',
        body: '任务和主题保存在本机浏览器数据中，日记保存在你选择的文件夹里。后续更新不会覆盖个人数据。',
        accent: 'var(--color-accent)',
    },
];

const MotionDiv = motion.div;
const MotionSpan = motion.span;

function MiniPenIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
        </svg>
    );
}

function DemoLabel({ children, className = '' }) {
    return <span className={`onb-demo-label ${className}`}>{children}</span>;
}

function DemoTaskRow() {
    return (
        <div className="onb-demo-panel onb-task-demo">
            <div className="onb-mini-task-row">
                <div className="onb-mini-task-complete">
                    <MiniPenIcon />
                </div>
                <div className="onb-mini-task-content">
                    <strong>整理论文第三章</strong>
                    <span>双击任务名可以改名</span>
                </div>
                <div className="onb-mini-task-actions">
                    <Hammer size={15} />
                    <Edit2 size={14} />
                    <Trash2 size={14} />
                </div>
            </div>
            <DemoLabel className="onb-label-complete">点左侧铅笔 = 完成</DemoLabel>
            <DemoLabel className="onb-label-title">双击文字 = 改名</DemoLabel>
            <DemoLabel className="onb-label-hammer">Hammer = 记录投入</DemoLabel>
        </div>
    );
}

function renderDemo(step) {
    if (step.demo === 'addTask') {
        return (
            <div className="onb-demo-panel onb-add-demo">
                <div className="onb-mini-toolbar">
                    <span>Sep 19, 2026</span>
                    <div>
                        <span>写下今天要推进的任务</span>
                        <button><Plus size={15} /></button>
                    </div>
                </div>
                <DemoLabel className="onb-label-input">输入任务名</DemoLabel>
                <DemoLabel className="onb-label-plus">点加号添加</DemoLabel>
            </div>
        );
    }

    if (step.demo === 'taskRow') return <DemoTaskRow />;

    if (step.demo === 'timer') {
        return (
            <div className="onb-demo-panel onb-timer-demo">
                <DemoTaskRow />
                <div className="onb-mini-atomic">
                    <Clock3 size={16} />
                    <div>
                        <strong>Atomic Timer</strong>
                        <span>25:00</span>
                    </div>
                </div>
            </div>
        );
    }

    if (step.demo === 'dateDots') {
        return (
            <div className="onb-demo-panel onb-dots-demo">
                <div className="onb-mini-date-card">
                    <span className="onb-dot dot-green" />
                    <strong>17</strong>
                    <small>Thu</small>
                </div>
                <div className="onb-mini-date-card is-active">
                    <span className="onb-dot dot-blue" />
                    <strong>19</strong>
                    <small>Today</small>
                </div>
                <div className="onb-mini-date-card">
                    <span className="onb-dot dot-grey" />
                    <strong>18</strong>
                    <small>Fri</small>
                </div>
                <div className="onb-dot-legend">
                    <span><i className="dot-green" /> 全部完成</span>
                    <span><i className="dot-blue" /> 有待办</span>
                    <span><i className="dot-grey" /> 历史未完成</span>
                </div>
            </div>
        );
    }

    if (step.demo === 'topbar') {
        return (
            <div className="onb-demo-panel onb-topbar-demo">
                <div className="onb-mini-topbar">
                    <CircleHelp size={17} />
                    <RefreshCw size={17} />
                    <BookOpen size={17} />
                    <CalendarDays size={17} />
                    <Star size={17} />
                    <Palette size={17} />
                </div>
                <DemoLabel className="onb-label-guide">问号 = 新手指引</DemoLabel>
                <DemoLabel className="onb-label-views">日记 / 周视图 / 星图</DemoLabel>
            </div>
        );
    }

    if (step.demo === 'localData') {
        return (
            <div className="onb-demo-panel onb-local-demo">
                <div className="onb-local-row"><span>Tasks</span><strong>Browser LocalStorage</strong></div>
                <div className="onb-local-row"><span>Diary</span><strong>Your folder</strong></div>
                <div className="onb-local-row"><span>Updates</span><strong>Keep user data</strong></div>
            </div>
        );
    }

    const Icon = step.icon;
    return (
        <div className="onb-icon-shell" style={{ '--onb-accent': step.accent }}>
            <Icon size={32} />
        </div>
    );
}

export default function OnboardingModal({ onClose }) {
    const [index, setIndex] = useState(0);
    const step = steps[index];
    const isFirst = index === 0;
    const isLast = index === steps.length - 1;

    const particles = useMemo(
        () => Array.from({ length: 18 }, (_, i) => ({
            id: i,
            x: 12 + ((i * 37) % 76),
            y: 18 + ((i * 23) % 58),
            size: 3 + (i % 3),
            delay: i * 0.08,
        })),
        []
    );

    const goPrev = () => setIndex((value) => Math.max(0, value - 1));
    const goNext = () => {
        if (isLast) onClose();
        else setIndex((value) => Math.min(steps.length - 1, value + 1));
    };

    return (
        <MotionDiv
            className="onb-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <MotionDiv
                className="onb-card"
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            >
                <button className="onb-close" onClick={onClose} title="关闭新手指引" aria-label="关闭新手指引">
                    <X size={16} />
                </button>

                <div className="onb-visual" aria-hidden="true">
                    {particles.map((particle) => (
                        <MotionSpan
                            key={particle.id}
                            className="onb-particle"
                            style={{
                                left: `${particle.x}%`,
                                top: `${particle.y}%`,
                                width: particle.size,
                                height: particle.size,
                            }}
                            animate={{ opacity: [0.25, 0.9, 0.25], scale: [1, 1.65, 1] }}
                            transition={{ duration: 2.6, delay: particle.delay, repeat: Infinity, ease: 'easeInOut' }}
                        />
                    ))}
                    <MotionDiv
                        className="onb-orbit"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                    />
                    <AnimatePresence mode="wait">
                        <MotionDiv
                            key={step.title}
                            className="onb-demo-wrap"
                            style={{ '--onb-accent': step.accent }}
                            initial={{ opacity: 0, y: 10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.96 }}
                            transition={{ duration: 0.22 }}
                        >
                            {renderDemo(step)}
                        </MotionDiv>
                    </AnimatePresence>
                </div>

                <div className="onb-body">
                    <AnimatePresence mode="wait">
                        <MotionDiv
                            key={step.title}
                            initial={{ opacity: 0, x: 18 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -18 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="onb-eyebrow">{step.eyebrow}</div>
                            <h2>{step.title}</h2>
                            <p>{step.body}</p>
                        </MotionDiv>
                    </AnimatePresence>

                    <div className="onb-progress" aria-label={`新手指引 ${index + 1} / ${steps.length}`}>
                        {steps.map((item, i) => (
                            <button
                                key={item.title}
                                className={i === index ? 'is-active' : ''}
                                onClick={() => setIndex(i)}
                                title={item.title}
                                aria-label={item.title}
                            />
                        ))}
                    </div>
                </div>

                <div className="onb-actions">
                    <button
                        className="onb-btn onb-btn-ghost"
                        onClick={goPrev}
                        disabled={isFirst}
                    >
                        <ArrowLeft size={14} />
                        上一步
                    </button>
                    <button className="onb-btn onb-btn-primary" onClick={goNext}>
                        {isLast ? (
                            <>
                                <CheckCircle2 size={15} />
                                开始使用
                            </>
                        ) : (
                            <>
                                下一步
                                <ArrowRight size={14} />
                            </>
                        )}
                    </button>
                </div>
            </MotionDiv>
        </MotionDiv>
    );
}
