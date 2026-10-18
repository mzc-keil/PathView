import { Icon } from './Icon';

export interface MeasurementResult {
  aLabel: string;
  bLabel: string;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  dx: number;
  dy: number;
  dz: number;
  distance: number;
}

export interface MeasurementPanelProps {
  result: MeasurementResult | null;
  anchorCount: number;
  onSwap: () => void;
  onClear: () => void;
}

/** 两点测距结果：ΔXYZ + 直线距离 + A→B 单位向量 */
export function MeasurementPanel({ result, anchorCount, onSwap, onClear }: MeasurementPanelProps) {
  if (!result) {
    return (
      <section className="panel">
        <div className="panel-label">两点测距</div>
        <div className="panel-sublabel">
          {anchorCount === 1
            ? '已选 1 个锚点，按住 Shift 再点一个点完成测距'
            : '按住 Shift 点击两个点，测量空间距离与 ΔXYZ'}
        </div>
      </section>
    );
  }

  const showUnit = result.distance > 1e-9;
  const ux = showUnit ? result.dx / result.distance : 0;
  const uy = showUnit ? result.dy / result.distance : 0;
  const uz = showUnit ? result.dz / result.distance : 0;
  const f = (v: number) => v.toFixed(4);

  return (
    <section className="panel">
      <div className="panel-label">
        两点测距
        <span className="panel-label-spacer" />
        <button type="button" className="mini-btn" onClick={onSwap} title="交换 A / B 两点">
          <Icon name="refresh" size={13} />
        </button>
        <button type="button" className="mini-btn" onClick={onClear} title="清除测距 (Esc)">
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="measure-anchors">
        <div className="measure-anchor">
          <span className="measure-anchor-tag">A</span>
          <span className="measure-anchor-name" title={result.aLabel}>
            {result.aLabel}
          </span>
        </div>
        <div className="measure-anchor">
          <span className="measure-anchor-tag">B</span>
          <span className="measure-anchor-name" title={result.bLabel}>
            {result.bLabel}
          </span>
        </div>
      </div>

      <div className="coord-rows">
        <div className="coord-row">
          <span className="coord-row-label axis-x">ΔX</span>
          <span className="coord-row-value mono">{f(result.dx)}</span>
        </div>
        <div className="coord-row">
          <span className="coord-row-label axis-y">ΔY</span>
          <span className="coord-row-value mono">{f(result.dy)}</span>
        </div>
        <div className="coord-row">
          <span className="coord-row-label axis-z">ΔZ</span>
          <span className="coord-row-value mono">{f(result.dz)}</span>
        </div>
        <div className="coord-row is-highlight">
          <span className="coord-row-label">Distance</span>
          <span className="coord-row-value mono">{f(result.distance)}</span>
        </div>
        {showUnit && (
          <div className="coord-row">
            <span className="coord-row-label">A→B 单位向量</span>
            <span className="coord-row-value mono">
              ({f(ux)}, {f(uy)}, {f(uz)})
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
