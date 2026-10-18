import type { PathPoint, SlopeClass } from '../types';
import { Icon } from './Icon';

const SLOPE_LABEL: Record<SlopeClass, string> = {
  up: '上坡',
  down: '下坡',
  flat: '平焊',
};

export interface PointDetailProps {
  pathName: string | null;
  pathColor: string | null;
  point: PathPoint | null;
  index: number;
  total: number;
  hasOrientation: boolean;
  /** 该点相对前一点的间距（新增） */
  spacing?: number | null;
  /** 该点相对前一点的姿态夹角变化（新增） */
  attitudeJump?: number | null;
  /** 该点所在段的坡向（新增） */
  slope?: SlopeClass | null;
  /** 该点是否被判定为告警点 */
  isAlert?: boolean;
  onFocus?: () => void;
}

export function PointDetail({
  pathName,
  pathColor,
  point,
  index,
  total,
  hasOrientation,
  spacing,
  attitudeJump,
  slope,
  isAlert,
  onFocus,
}: PointDetailProps) {
  if (!point) {
    return (
      <section className="panel point-detail">
        <div className="panel-label">当前点</div>
        <div className="empty-state">选中一条轨迹后点击任意点查看数值</div>
      </section>
    );
  }

  return (
    <section className="panel point-detail">
      <div className="panel-label">
        当前点
        <span className="panel-label-spacer" />
        <span className="index-badge">
          {index + 1} / {total}
        </span>
      </div>

      <div className="point-path-name">
        <span className="color-dot" style={{ background: pathColor ?? '#64748b' }} />
        <span className="point-path-text" title={pathName ?? ''}>
          {pathName ?? '—'}
        </span>
        {onFocus && (
          <button type="button" className="mini-btn" onClick={onFocus} title="把相机对准这个点">
            <Icon name="focus" size={13} />
          </button>
        )}
      </div>

      <div className="coord-grid">
        <div className="coord-cell">
          <span className="coord-cell-label axis-x">X</span>
          <span className="coord-cell-value">{point.x.toFixed(4)}</span>
        </div>
        <div className="coord-cell">
          <span className="coord-cell-label axis-y">Y</span>
          <span className="coord-cell-value">{point.y.toFixed(4)}</span>
        </div>
        <div className="coord-cell">
          <span className="coord-cell-label axis-z">Z</span>
          <span className="coord-cell-value">{point.z.toFixed(4)}</span>
        </div>
      </div>

      {hasOrientation ? (
        <div className="coord-rows">
          <div className="coord-row">
            <span className="coord-row-label">RX</span>
            <span className="coord-row-value mono">{point.rx != null ? point.rx.toFixed(4) : '—'}</span>
          </div>
          <div className="coord-row">
            <span className="coord-row-label">RY</span>
            <span className="coord-row-value mono">{point.ry != null ? point.ry.toFixed(4) : '—'}</span>
          </div>
          <div className="coord-row">
            <span className="coord-row-label">RZ</span>
            <span className="coord-row-value mono">{point.rz != null ? point.rz.toFixed(4) : '—'}</span>
          </div>
        </div>
      ) : (
        <div className="panel-sublabel">该轨迹没有姿态数据（has_orientation = false）</div>
      )}

      {(spacing != null || attitudeJump != null || slope != null) && (
        <>
          <div className="panel-label panel-label-sub">工艺校验</div>
          <div className="coord-rows">
            {spacing != null && (
              <div className="coord-row">
                <span className="coord-row-label">到前点距离</span>
                <span className="coord-row-value mono">{spacing.toFixed(4)}</span>
              </div>
            )}
            {attitudeJump != null && (
              <div className={`coord-row${isAlert ? ' is-alert' : ''}`}>
                <span className="coord-row-label">姿态跳变</span>
                <span className="coord-row-value mono">
                  {attitudeJump.toFixed(2)}°
                  {isAlert && <Icon name="warn" size={12} style={{ display: 'inline', verticalAlign: '-2px', marginLeft: 4 }} />}
                </span>
              </div>
            )}
            {slope != null && (
              <div className="coord-row">
                <span className="coord-row-label">坡向</span>
                <span className={`coord-row-value slope-tag slope-${slope}`}>{SLOPE_LABEL[slope]}</span>
              </div>
            )}
          </div>
        </>
      )}

      {point.extra && Object.keys(point.extra).length > 0 && (
        <>
          <div className="panel-label panel-label-sub">附加列</div>
          <div className="coord-rows">
            {Object.entries(point.extra).map(([k, v]) => (
              <div className="coord-row" key={k}>
                <span className="coord-row-label" title={k}>
                  {k}
                </span>
                <span className="coord-row-value">{String(v)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
