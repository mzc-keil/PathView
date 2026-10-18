import { useMemo } from 'react';
import type { DiffReport, Path } from '../types';
import { Icon } from './Icon';

/** 偏差沿焊接进度的折线图 */
function DeviationChart({ values, max }: { values: number[]; max: number }) {
  const path = useMemo(() => {
    if (values.length < 2) return '';
    const w = 100;
    const h = 100;
    const peak = max > 0 ? max : 1;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - (v / peak) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [values, max]);

  if (!path) return <div className="mini-bars-empty">无数据</div>;

  return (
    <div className="deviation-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="72">
        <line x1="0" y1="100" x2="100" y2="100" stroke="#334155" strokeWidth="0.6" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="#334155" strokeWidth="0.4" strokeDasharray="2 2" />
        <path d={`${path} L100,100 L0,100 Z`} fill="#3b82f6" fillOpacity="0.14" stroke="none" />
        <path d={path} fill="none" stroke="#60a5fa" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="deviation-axis">
        <span>起点</span>
        <span>0.5</span>
        <span>终点</span>
      </div>
    </div>
  );
}

export interface DiffPanelProps {
  paths: Path[];
  aId: number | null;
  bId: number | null;
  sampleCount: number;
  reverseB: boolean;
  showHeat: boolean;
  report: DiffReport | null;
  disabled: boolean;
  onA: (id: number | null) => void;
  onB: (id: number | null) => void;
  onSampleCount: (n: number) => void;
  onReverseB: (v: boolean) => void;
  onShowHeat: (v: boolean) => void;
  onExport: () => void;
}

export function DiffPanel({
  paths,
  aId,
  bId,
  sampleCount,
  reverseB,
  showHeat,
  report,
  disabled,
  onA,
  onB,
  onSampleCount,
  onReverseB,
  onShowHeat,
  onExport,
}: DiffPanelProps) {
  const options = paths;

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-label">轨迹对比</div>
        <div className="panel-sublabel">
          按弧长均匀重采样后逐点求偏差 —— 两条轨迹点数几乎必然不同，按索引对齐没有意义
        </div>

        <div className="field-row">
          <span className="field-label">基准 A</span>
          <select
            className="select"
            value={aId ?? ''}
            onChange={(e) => onA(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— 请选择 —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.point_count})
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <span className="field-label">对比 B</span>
          <select
            className="select"
            value={bId ?? ''}
            onChange={(e) => onB(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— 请选择 —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.point_count})
              </option>
            ))}
          </select>
        </div>

        <div className="slider-row">
          <span className="slider-label">采样点</span>
          <input
            type="range"
            min={50}
            max={500}
            step={10}
            value={sampleCount}
            onChange={(e) => onSampleCount(Number(e.target.value))}
          />
          <span className="mono slider-value">{sampleCount}</span>
        </div>

        <label className="toggle">
          <input type="checkbox" checked={reverseB} onChange={(e) => onReverseB(e.target.checked)} />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">反向对齐 B（焊接方向相反时用）</span>
        </label>

        <label className="toggle">
          <input type="checkbox" checked={showHeat} onChange={(e) => onShowHeat(e.target.checked)} />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">轨迹线按偏差热力着色</span>
        </label>
      </section>

      <section className="panel">
        <div className="panel-label">
          偏差结果
          <span className="panel-label-spacer" />
          <button type="button" className="mini-btn" onClick={onExport} disabled={!report} title="导出偏差数据 CSV">
            <Icon name="download" size={13} />
          </button>
        </div>

        {disabled ? (
          <div className="empty-state">请选择两条不同的轨迹</div>
        ) : report ? (
          <>
            <div className="stat-grid">
              <div className="stat-cell">
                <span className="stat-label">最大偏差</span>
                <span className="stat-value mono is-alert">{report.max.toFixed(4)}</span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">平均偏差</span>
                <span className="stat-value mono">{report.mean.toFixed(4)}</span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">RMS</span>
                <span className="stat-value mono">{report.rms.toFixed(4)}</span>
              </div>
            </div>

            <DeviationChart values={report.points.map((p) => p.deviation)} max={report.max} />

            <div className="coord-row">
              <span className="coord-row-label">最大偏差位置</span>
              <span className="coord-row-value mono">{(report.maxAt * 100).toFixed(1)}% 处</span>
            </div>

            <div className="legend-row">
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#3b82f6' }} />
                偏差小
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#ef4444' }} />
                偏差大
              </span>
            </div>
          </>
        ) : (
          <div className="empty-state">无数据</div>
        )}
      </section>
    </div>
  );
}
