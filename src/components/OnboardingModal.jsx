import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    ArrowRight,
    BookOpenText,
    CalendarDays,
    CheckCircle2,
    CircleHelp,
    Clock3,
    DatabaseBackup,
    Edit2,
    FileText,
    Hammer,
    ListPlus,
    MonitorSmartphone,
    NotebookPen,
    Palette,
    Plus,
    RefreshCw,
    Settings2,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';

const steps = [
    {
        icon: Sparkles,
        demo: 'welcome',
        eyebrow: '开始',
        title: '欢迎来到星轨记忆 PlanTrace',
        body: '它不是普通待办清单，而是一个本地个人工作台：任务、投入时间、日记、阅读摘录、主题和数据备份都放在同一套清晰结构里。',
        accent: 'var(--color-accent)',
    },
    {
        icon: ListPlus,
        demo: 'addTask',
        eyebrow: '任务',
        title: '从顶部输入框写下今天要推进的事',
        body: '在主界面左上方输入任务名，点击右侧加号即可添加。需要提前规划时，可以用 Plan Future 把任务放到未来日期。',
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
        eyebrow: '投入',
        title: 'Hammer 和原子时钟记录真实投入',
        body: 'Hammer 绑定具体任务，适合记录“我推进了这个任务”；原子时钟记录一段专注时间，适合沉浸式工作。跨天计时会自动拆分到对应日期。',
        accent: 'var(--color-amber)',
    },
    {
        icon: CalendarDays,
        demo: 'week',
        eyebrow: '周视图',
        title: '用周日程看见时间到底花在哪里',
        body: '周视图会把 Hammer 记录和原子时间铺成时间块，适合复盘一周的真实节奏。侧边栏日期光点也会提示每天是否完成、有待办或历史未完成。',
        accent: 'var(--color-green-dot)',
    },
    {
        icon: NotebookPen,
        demo: 'diary',
        eyebrow: '日记',
        title: '日记用于沉淀当天发生的事和碎碎念',
        body: '日记支持主日记和碎碎念，放大后可以看到月历、富文本样式和写作控制。阅读器摘录也能一键导入当天碎碎念。',
        accent: 'var(--color-amber)',
    },
    {
        icon: BookOpenText,
        demo: 'reader',
        eyebrow: '阅读器',
        title: '本地 EPUB 阅读器可以做书架、标注和摘录',
        body: '导入本地 EPUB 后，书籍会保存到 data/epub。一本书可以属于多个书架，阅读位置、标色、下划线、笔记都会保留，也可以把选中文本加入碎碎念。',
        accent: '#7c3aed',
    },
    {
        icon: Settings2,
        demo: 'topbar',
        eyebrow: '右上角工具',
        title: '常用工具集中在右上角',
        body: '问号可重新打开新手指引；更新、日记、阅读器、周视图、设置和主题入口都在同一排。设置里可以管理时区、历史版本、桌面快捷方式等。',
        accent: 'var(--color-green)',
    },
    {
        icon: DatabaseBackup,
        demo: 'localData',
        eyebrow: '本地优先',
        title: '数据留在你的电脑里',
        body: '任务、投入记录、日记、阅读器书库和备份都围绕项目 data 文件夹管理。软件更新只替换程序文件，不覆盖个人数据。',
        accent: 'var(--color-accent)',
    },
    {
        icon: Palette,
        demo: 'theme',
        eyebrow: '个性化',
        title: '主题可以切换，也可以自己 DIY',
        body: 'PlanTrace 支持多套精选主题和 DIY 主题。背景、面板、文字、主色和状态色都可以调整，自定义主题会保存在本机数据里。',
        accent: '#d946ef',
    },
    {
        icon: MonitorSmartphone,
        demo: 'wechat',
        eyebrow: '移动端',
        title: '微信小程序「星轨记忆」正在筹备上线',
        body: '手机端会围绕任务、日记和未来的星轨体验重新设计。当前正在筹备上线，敬请期待！',
        accent: 'var(--color-blue-dot)',
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

    if (step.demo === 'week') {
        return (
            <div className="onb-demo-panel onb-week-demo">
                <div className="onb-week-head">
                    <CalendarDays size={15} />
                    <span>Week View</span>
                    <strong>投入轨迹</strong>
                </div>
                <div className="onb-week-grid">
                    {['一', '二', '三', '四', '五'].map((day, i) => (
                        <div className="onb-week-day" key={day}>
                            <span>{day}</span>
                            <i style={{ height: `${38 + i * 9}px` }} />
                            <b style={{ height: `${22 + (4 - i) * 8}px` }} />
                        </div>
                    ))}
                </div>
                <div className="onb-dot-legend">
                    <span><i className="dot-green" /> 已完成</span>
                    <span><i className="dot-blue" /> 有待办</span>
                    <span><i className="dot-grey" /> 历史未完成</span>
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

    if (step.demo === 'diary') {
        return (
            <div className="onb-demo-panel onb-diary-demo">
                <div className="onb-diary-head">
                    <NotebookPen size={15} />
                    <strong>9月22日 · 周二</strong>
                    <span />
                </div>
                <div className="onb-diary-calendar">
                    {[18, 19, 20, 21, 22].map((day) => (
                        <span key={day} className={day === 22 ? 'active' : day === 21 ? 'has-note' : ''}>
                            {day}
                            {day === 21 && <b>2</b>}
                        </span>
                    ))}
                </div>
                <div className="onb-diary-editor">
                    <strong>主日记</strong>
                    <p>今天想思考一个真正重要的问题...</p>
                </div>
                <div className="onb-diary-note">碎碎念 · 2</div>
            </div>
        );
    }

    if (step.demo === 'reader') {
        return (
            <div className="onb-demo-panel onb-reader-demo">
                <div className="onb-reader-sidebar">
                    <div className="onb-reader-import">导入 EPUB</div>
                    <span className="active">默认书架</span>
                    <span>心理学</span>
                </div>
                <div className="onb-reader-page">
                    <div className="onb-reader-title">
                        <BookOpenText size={15} />
                        <strong>本地阅读器</strong>
                    </div>
                    <p>选中文本后可以标色、下划线、写评论，也可以导入今天的碎碎念。</p>
                    <div className="onb-reader-mark">
                        <span />
                        <span />
                        <span />
                        <button>+ 碎碎念</button>
                    </div>
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
                    <NotebookPen size={17} />
                    <BookOpenText size={17} />
                    <CalendarDays size={17} />
                    <Settings2 size={17} />
                    <Palette size={17} />
                </div>
                <DemoLabel className="onb-label-guide">问号 = 新手指引</DemoLabel>
                <DemoLabel className="onb-label-views">日记 / 阅读 / 周视图 / 设置</DemoLabel>
            </div>
        );
    }

    if (step.demo === 'localData') {
        return (
            <div className="onb-demo-panel onb-local-demo">
                <div className="onb-local-row"><span><DatabaseBackup size={13} /> Tasks</span><strong>data/plantrace-data.json</strong></div>
                <div className="onb-local-row"><span><FileText size={13} /> Diary</span><strong>data/diary/</strong></div>
                <div className="onb-local-row"><span><BookOpenText size={13} /> EPUB</span><strong>data/epub/</strong></div>
                <div className="onb-local-row"><span><RefreshCw size={13} /> Updates</span><strong>保留个人数据</strong></div>
            </div>
        );
    }

    if (step.demo === 'theme') {
        return (
            <div className="onb-demo-panel onb-theme-demo">
                <div className="onb-theme-window">
                    <span style={{ background: '#f7f3ea' }} />
                    <span style={{ background: '#111827' }} />
                    <span style={{ background: '#dbeafe' }} />
                    <span style={{ background: '#e7f4df' }} />
                </div>
                <div className="onb-theme-sliders">
                    <i />
                    <i />
                    <i />
                </div>
                <DemoLabel className="onb-label-theme">精选主题 + DIY</DemoLabel>
            </div>
        );
    }

    if (step.demo === 'wechat') {
        return (
            <div className="onb-demo-panel onb-wechat-demo">
                <div className="onb-phone">
                    <div className="onb-phone-head">星轨记忆</div>
                    <div className="onb-phone-orbits">
                        <span />
                        <span />
                        <span />
                    </div>
                    <div className="onb-phone-tabs">
                        <i />
                        <i />
                        <i />
                    </div>
                </div>
                <div className="onb-wechat-badge">微信小程序筹备中</div>
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
