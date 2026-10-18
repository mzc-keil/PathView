import { useMemo } from 'react';
import type { AttitudeReport, PathWithPoints, SlopeReport, SpacingReport } from '../types';
import { SLOPE_COLORS } from '../three/analysis';
import { Icon } from './Icon';

/** 极简柱状图：用来一眼看出跳变/间距的分布形态，异常柱染红 */
function MiniBars({
  values,
  anomalyIndices,
  color,
  anomalyColor = '#ef4444',
  height = 44,
}: {
  values: number[];
  anomalyIndices: number[];
  color: string;
  anomalyColor?: string;
  height?: number;
}) {
  const anomalySet = useMemo(() => new Set(anomalyIndices), [anomalyIndices]);
  const max = values.length > 0 ? Math.max(...values) : 0;

  if (values.length === 0) {
    return <div className="mini-bars-empty">无数据</div>;
  }

  return (
    <div className="mini-bars" style={{ height }}>
      {values.map((v, i) => {
        const h = max > 0 ? Math.max((v / max) * 100, 2) : 2;
        return (
          <span
            key={i}
            className="mini-bar"
            style={{ height: `${h}%`, background: anomalySet.has(i) ? anomalyColor : color }}
            title={`#${i + 1} · ${v.toFixed(4)}`}
          />
        );
      })}
    </div>
  );
}

export interface AnalysisPanelProps {
  path: PathWithPoints | null;
  attitude: AttitudeReport | null;
  attitudeThreshold: number;
  onAttitudeThreshold: (v: number) => void;
  spacing: SpacingReport | null;
  slope: SlopeReport | null;
  markAlerts: boolean;
  onMarkAlerts: (v: boolean) => void;
  slopeColoring: boolean;
  onSlopeColoring: (v: boolean) => void;
  onJumpTo: (index: number) => void;
  onExportReport: () => void;
}

export function AnalysisPanel({
  path,
  attitude,
  attitudeThreshold,
  onAttitudeThreshold,
  spacing,
  slope,
  markAlerts,
  onMarkAlerts,
  slopeColoring,
  onSlopeColoring,
  onJumpTo,
  onExportReport,
}: AnalysisPanelProps) {
  if (!path) {
    return (
      <section className="panel">
        <div className="panel-label">轨迹分析</div>
        <div className="empty-state">先选中一条轨迹</div>
      </section>
    );
  }

  const worstJumps = useMemo(() => {
    if (!attitude) return [];
    return attitude.jumps
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 8);
  }, [attitude]);

  const worstSpacing = useMemo(() => {
    if (!spacing) return [];
    return spacing.distances
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 6);
  }, [spacing]);

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-label">
          姿态连续性
          <span className="panel-label-spacer" />
          <button type="button" className="mini-btn" onClick={onExportReport} title="导出分析报告 CSV">
            <Icon name="download" size={13} />
          </button>
        </div>
        <div className="panel-sublabel">
          用四元数夹角衡量相邻两点的真实旋转量（欧拉角逐轴相减在 ±180° 处会假告警）
        </div>

        {attitude ? (
          <>
            <div className="stat-grid">
              <div className="stat-cell">
                <span className="stat-label">最大跳变</span>
                <span className={`stat-value mono${attitude.max > attitudeThreshold ? ' is-alert' : ''}`}>
                  {attitude.max.toFixed(2)}°
                </span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">平均</span>
                <span className="stat-value mono">{attitude.mean.toFixed(2)}°</span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">超阈值</span>
                <span className={`stat-value mono${attitude.anomalies.length > 0 ? ' is-alert' : ''}`}>
                  {attitude.anomalies.length} 处
                </span>
              </div>
            </div>

            <MiniBars values={attitude.jumps} anomalyIndices={attitude.anomalies} color="#3b82f6" />

            <div className="slider-row">
              <span className="slider-label">阈值</span>
              <input
                type="range"
                min={1}
                max={90}
                step={1}
                value={attitudeThreshold}
                onChange={(e) => onAttitudeThreshold(Number(e.target.value))}
              />
              <span className="mono slider-value">{attitudeThreshold}°</span>
            </div>

            <label className="toggle">
              <input type="checkbox" checked={markAlerts} onChange={(e) => onMarkAlerts(e.target.checked)} />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span className="toggle-label">在 3D 里标红告警点</span>
            </label>

            {worstJumps.length > 0 && (
              <div className="alert-list">
                <div className="panel-sublabel">跳变最大的位置（点击跳转）</div>
                {worstJumps.map(({ v, i }) => (
                  <button
                    key={i}
                    type="button"
                    className={`alert-item${v > attitudeThreshold ? ' is-alert' : ''}`}
                    onClick={() => onJumpTo(i + 1)}
                  >
                    <span className="alert-item-idx">#{i + 1}→{i + 2}</span>
                    <span className="alert-item-val mono">{v.toFixed(2)}°</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">该轨迹没有姿态数据，无法做连续性检查</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-label">点间距分析</div>
        <div className="panel-sublabel">间距骤增＝中间漏点（机器人会直线冲过去）；间距≈0＝重合点（原地停顿易烧穿）</div>

        {spacing ? (
          <>
            <div className="stat-grid">
              <div className="stat-cell">
                <span className="stat-label">中位数</span>
                <span className="stat-value mono">{spacing.median.toFixed(4)}</span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">最大</span>
                <span className={`stat-value mono${spacing.anomalies.length > 0 ? ' is-alert' : ''}`}>
                  {spacing.max.toFixed(4)}
                </span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">异常段</span>
                <span className={`stat-value mono${spacing.anomalies.length > 0 ? ' is-alert' : ''}`}>
                  {spacing.anomalies.length}
                </span>
              </div>
            </div>

            <MiniBars values={spacing.distances} anomalyIndices={spacing.anomalies} color="#10b981" height={36} />

            <div className="stat-grid">
              <div className="stat-cell">
                <span className="stat-label">重合点段</span>
                <span className={`stat-value mono${spacing.duplicates.length > 0 ? ' is-alert' : ''}`}>
                  {spacing.duplicates.length}
                </span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">最小间距</span>
                <span className="stat-value mono">{spacing.min.toFixed(4)}</span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">段数</span>
                <span className="stat-value mono">{spacing.total}</span>
              </div>
            </div>

            {worstSpacing.length > 0 && (
              <div className="alert-list">
                <div className="panel-sublabel">间距最大的位置</div>
                {worstSpacing.map(({ v, i }) => (
                  <button
                    key={i}
                    type="button"
                    className={`alert-item${spacing.anomalies.includes(i) ? ' is-alert' : ''}`}
                    onClick={() => onJumpTo(i + 1)}
                  >
                    <span className="alert-item-idx">#{i + 1}→{i + 2}</span>
                    <span className="alert-item-val mono">{v.toFixed(4)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">无数据</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-label">坡向分段</div>
        <div className="panel-sublabel">
          按每段爬升角分类，对应弧焊的上下坡工艺段（上下坡需要补偿 arcWeldOffset）
        </div>

        {slope ? (
          <>
            <div className="slope-bar">
              {slope.classes.map((c, i) => (
                <span
                  key={i}
                  className="slope-seg"
                  style={{ background: SLOPE_COLORS[c] }}
                  title={`#${i + 1}→${i + 2} · ${c} · ${slope.angles[i].toFixed(2)}°`}
                />
              ))}
            </div>
            <div className="legend-row">
              <span className="legend-item">
                <span className="legend-dot" style={{ background: SLOPE_COLORS.up }} />
                上坡 {slope.upCount}
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: SLOPE_COLORS.flat }} />
                平焊 {slope.flatCount}
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: SLOPE_COLORS.down }} />
                下坡 {slope.downCount}
              </span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={slopeColoring}
                onChange={(e) => onSlopeColoring(e.target.checked)}
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span className="toggle-label">轨迹线按坡向着色</span>
            </label>
          </>
        ) : (
          <div className="empty-state">无数据</div>
        )}
      </section>
    </div>
  );
}
