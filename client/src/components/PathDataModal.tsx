import { useMemo, useState } from 'react';
import type { AttitudeReport, PathWithPoints, SpacingReport } from '../types';
import { Icon } from './Icon';

const RENDER_CAP = 4000;

export interface PathDataModalProps {
  path: PathWithPoints;
  hiddenIds: Set<number>;
  alertPointIds: number[];
  attitude: AttitudeReport | null;
  spacing: SpacingReport | null;
  onToggleHidden: (pointId: number) => void;
  onClearHidden: () => void;
  onJumpTo: (index: number) => void;
  onClose: () => void;
}

/** 点位数据表：全量数值 + 逐点隐藏 + 分析列 */
export function PathDataModal({
  path,
  hiddenIds,
  alertPointIds,
  attitude,
  spacing,
  onToggleHidden,
  onClearHidden,
  onJumpTo,
  onClose,
}: PathDataModalProps) {
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const points = path.points;

  const extraKeys = useMemo(() => {
    const first = points.find((p) => p.extra);
    return first?.extra ? Object.keys(first.extra) : [];
  }, [points]);

  const alertSet = useMemo(() => new Set(alertPointIds), [alertPointIds]);

  const rows = useMemo(() => {
    const list = points.map((p, i) => ({ p, i }));
    if (!onlyAlerts) return list;
    return list.filter(({ i, p }) => alertSet.has(p.id) || (i > 0 && attitude?.anomalies.includes(i - 1)));
  }, [points, onlyAlerts, alertSet, attitude]);

  const capped = rows.slice(0, RENDER_CAP);
  const hiddenCount = points.filter((p) => hiddenIds.has(p.id)).length;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal data-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="panel-label">
            <Icon name="layers" size={14} />
            点位数据
          </div>
          <div className="modal-header-meta">
            <span className="color-dot" style={{ background: path.color }} />
            <span className="modal-title-text" title={path.name}>
              {path.name}
            </span>
            {path.has_orientation && <span className="badge badge-orientation">Orientation</span>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="关闭">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="data-toolbar">
          <span className="chip">
            {points.length - hiddenCount} / {points.length} 点可见
          </span>
          {hiddenCount > 0 && (
            <button type="button" className="btn btn-sm" onClick={onClearHidden}>
              <Icon name="refresh" size={13} />
              清除全部隐藏
            </button>
          )}
          {attitude && (
            <label className="toggle toggle-inline">
              <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span className="toggle-label">只看告警点</span>
            </label>
          )}
          {rows.length > RENDER_CAP && (
            <span className="footer-hint is-warn">
              行数过多，仅渲染前 {RENDER_CAP} 行（共 {rows.length} 行）
            </span>
          )}
        </div>

        <div className="modal-body data-body">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th className="col-axis-x">X</th>
                <th className="col-axis-y">Y</th>
                <th className="col-axis-z">Z</th>
                {path.has_orientation && (
                  <>
                    <th>RX</th>
                    <th>RY</th>
                    <th>RZ</th>
                    <th>姿态跳变</th>
                  </>
                )}
                <th>间距</th>
                {extraKeys.map((k) => (
                  <th key={k}>{k}</th>
                ))}
                <th className="col-action">隐藏</th>
              </tr>
            </thead>
            <tbody>
              {capped.map(({ p, i }) => {
                const isHidden = hiddenIds.has(p.id);
                const jump = i > 0 ? attitude?.jumps[i - 1] : undefined;
                const isJump = i > 0 && attitude ? attitude.anomalies.includes(i - 1) : false;
                const segLen = i > 0 ? spacing?.distances[i - 1] : undefined;
                const isGap = i > 0 && spacing ? spacing.anomalies.includes(i - 1) : false;

                return (
                  <tr key={p.id} className={isHidden ? 'row-hidden' : ''}>
                    <td className="col-idx">
                      <button type="button" className="row-jump" onClick={() => onJumpTo(i)} title="跳到该点">
                        {i + 1}
                      </button>
                    </td>
                    <td className="mono">{p.x.toFixed(4)}</td>
                    <td className="mono">{p.y.toFixed(4)}</td>
                    <td className="mono">{p.z.toFixed(4)}</td>
                    {path.has_orientation && (
                      <>
                        <td className="mono">{p.rx != null ? p.rx.toFixed(4) : '—'}</td>
                        <td className="mono">{p.ry != null ? p.ry.toFixed(4) : '—'}</td>
                        <td className="mono">{p.rz != null ? p.rz.toFixed(4) : '—'}</td>
                        <td className={`mono${isJump ? ' is-alert' : ''}`}>
                          {jump != null ? `${jump.toFixed(2)}°` : '—'}
                        </td>
                      </>
                    )}
                    <td className={`mono${isGap ? ' is-alert' : ''}`}>
                      {segLen != null ? segLen.toFixed(4) : '—'}
                    </td>
                    {extraKeys.map((k) => (
                      <td key={k}>{p.extra ? String(p.extra[k] ?? '') : ''}</td>
                    ))}
                    <td className="col-action">
                      <input
                        type="checkbox"
                        checked={isHidden}
                        onChange={() => onToggleHidden(p.id)}
                        title={isHidden ? '恢复该点' : '隐藏该点'}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {capped.length === 0 && <div className="empty-state">没有符合条件的行</div>}
        </div>
      </div>
    </div>
  );
}
