import type { AxesFilter } from '../types';
import { Icon } from './Icon';

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle${disabled ? ' is-disabled' : ''}`} title={hint}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}

export interface DisplayControlsProps {
  showLine: boolean;
  showPoints: boolean;
  showGrid: boolean;
  showAxes: boolean;
  showAllAxes: boolean;
  axesFilter: AxesFilter;
  pointSize: number;
  syncPlayback: boolean;
  boxSelectMode: boolean;
  hiddenCount: number;
  onShowLine: (v: boolean) => void;
  onShowPoints: (v: boolean) => void;
  onShowGrid: (v: boolean) => void;
  onShowAxes: (v: boolean) => void;
  onShowAllAxes: (v: boolean) => void;
  onAxesFilter: (v: AxesFilter) => void;
  onPointSize: (v: number) => void;
  onSyncPlayback: (v: boolean) => void;
  onToggleBoxSelect: () => void;
  onClearHidden: () => void;
}

const AXIS_LABEL: Array<{ key: keyof AxesFilter; label: string; cls: string }> = [
  { key: 'x', label: 'X', cls: 'axis-x' },
  { key: 'y', label: 'Y', cls: 'axis-y' },
  { key: 'z', label: 'Z', cls: 'axis-z' },
];

export function DisplayControls(props: DisplayControlsProps) {
  const {
    showLine,
    showPoints,
    showGrid,
    showAxes,
    showAllAxes,
    axesFilter,
    pointSize,
    syncPlayback,
    boxSelectMode,
    hiddenCount,
    onShowLine,
    onShowPoints,
    onShowGrid,
    onShowAxes,
    onShowAllAxes,
    onAxesFilter,
    onPointSize,
    onSyncPlayback,
    onToggleBoxSelect,
    onClearHidden,
  } = props;

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-label">显示</div>
        <div className="toggle-list">
          <Toggle label="轨迹线" checked={showLine} onChange={onShowLine} hint="用 Line2 渲染，线宽真实生效" />
          <Toggle label="轨迹点" checked={showPoints} onChange={onShowPoints} />
          <Toggle label="参考网格" checked={showGrid} onChange={onShowGrid} hint="地面网格 + 原点三轴，提供空间参照" />
          <Toggle label="当前点三轴" checked={showAxes} onChange={onShowAxes} hint="长度 3×尺度基准、不透明" />
          <Toggle
            label="全部点三轴"
            checked={showAllAxes}
            onChange={onShowAllAxes}
            hint="长度 2×尺度基准、40% 透明；开启后当前点三轴自动隐藏"
          />
          <Toggle
            label="多轨迹同步回放"
            checked={syncPlayback}
            onChange={onSyncPlayback}
            hint="按归一化进度让所有选中轨迹同时前进，方便两条工艺版本对位比较"
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-label">姿态轴过滤</div>
        <div className="panel-sublabel">只看某一轴的翻转，其余隐藏</div>
        <div className="axis-chips">
          {AXIS_LABEL.map(({ key, label, cls }) => (
            <button
              key={key}
              type="button"
              className={`axis-chip ${cls}${axesFilter[key] ? ' is-on' : ''}`}
              onClick={() => onAxesFilter({ ...axesFilter, [key]: !axesFilter[key] })}
            >
              <span className="axis-chip-dot" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-label">点大小</div>
        <div className="slider-row">
          <input
            type="range"
            min={0.3}
            max={3}
            step={0.1}
            value={pointSize}
            onChange={(e) => onPointSize(Number(e.target.value))}
          />
          <span className="mono slider-value">{pointSize.toFixed(1)}×</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-label">坏点剔除</div>
        <div className="panel-sublabel">
          {hiddenCount > 0 ? `已隐藏 ${hiddenCount} 个点` : '拖拽框选即可隐藏异常点'}
        </div>
        <div className="btn-row">
          <button
            type="button"
            className={`btn${boxSelectMode ? ' btn-primary' : ''}`}
            onClick={onToggleBoxSelect}
            title="进入框选模式后拖拽出矩形，框内的点会被隐藏 (B)"
          >
            <Icon name="box" size={14} />
            {boxSelectMode ? '退出框选' : '框选隐藏'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={onClearHidden}
            disabled={hiddenCount === 0}
            title="恢复所有被隐藏的点"
          >
            <Icon name="refresh" size={14} />
            清除隐藏
          </button>
        </div>
      </section>
    </div>
  );
}
