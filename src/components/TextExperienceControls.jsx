import { TEXT_SURFACES } from './textExperience.js';

export default function TextExperienceControls({
    fontSize,
    lineHeight,
    surface,
    onFontSize,
    onLineHeight,
    onSurface,
    dense = false,
}) {
    return (
        <div className={`text-exp-controls ${dense ? 'dense' : ''}`}>
            <label className="text-exp-field">
                <span>字号</span>
                <input
                    type="range"
                    min="12"
                    max="28"
                    step="1"
                    value={fontSize}
                    onChange={(event) => onFontSize(Number(event.target.value))}
                />
                <strong>{fontSize}px</strong>
            </label>
            <label className="text-exp-field">
                <span>行距</span>
                <input
                    type="range"
                    min="1.3"
                    max="2.2"
                    step="0.05"
                    value={lineHeight}
                    onChange={(event) => onLineHeight(Number(event.target.value))}
                />
                <strong>{Number(lineHeight).toFixed(2)}</strong>
            </label>
            <div className="text-exp-surfaces">
                {TEXT_SURFACES.map((item) => (
                    <button
                        key={item.id}
                        className={`text-exp-surface ${surface === item.id ? 'active' : ''}`}
                        onClick={() => onSurface(item.id)}
                        title={item.label}
                    >
                        <span style={{ background: item.background, color: item.color }}>A</span>
                        {dense ? null : item.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
