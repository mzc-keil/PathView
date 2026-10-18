import type { PathStats, PathWithPoints } from '../types';
import { Icon } from './Icon';

export interface StatsPanelProps {
  path: PathWithPoints | null;
  stats: PathStats | null;
  visibleCount: number;
  hiddenCount: number;
  weldSpeed: number;
  onWeldSpeed: (v: number) => void;
  onJumpTo: (index: number) => void;
  onExportCleanCsv: () => void;
  onExportReport: () => void;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m} 分 ${s.toFixed(1)} 秒` : `${s.toFixed(1)} 秒`;
}

/** 焊道长度 / 节拍统计 + 导出闭环 */
export function StatsPanel({
  path,
  stats,
  visibleCount,
  hiddenCount,
  weldSpeed,
  onWeldSpeed,
  onJumpTo,
  onExportCleanCsv,
  onExportReport,
}: StatsPanelProps) {
  if (!path) {
    return (
      <section className="panel">
        <div className="panel-label">焊道统计</div>
        <div className="empty-state">先选中一条轨迹</div>
      </section>
    );
  }

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-label">焊道统计</div>
        <div className="panel-sublabel">
          基于当前可见点（已剔除隐藏点）计算 —— 隐藏坏点后这里的长度和节拍会同步变化
        </div>

        {stats ? (
          <>
            <div className="stat-grid">
              <div className="stat-cell">
                <span className="stat-label">焊道长度</span>
                <span className="stat-value mono">{stats.length.toFixed(3)}</span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">段数</span>
                <span className="stat-value mono">{stats.segments}</span>
              </div>
              <div className="stat-cell">
                <span className="stat-label">可见点</span>
                <span className="stat-value mono">
                  {visibleCount}
                  {hiddenCount > 0 && <span className="stat-sub">/{visibleCount + hiddenCount}</span>}
                </span>
              </div>
            </div>

            <div className="slider-row">
              <span className="slider-label">焊接速度</span>
              <input
                type="range"
                min={1}
                max={60}
                step={1}
                value={weldSpeed}
                onChange={(e) => onWeldSpeed(Number(e.target.value))}
              />
              <span className="mono slider-value">{weldSpeed}</span>
            </div>

            <div className="stat-grid">
              <div className="stat-cell is-wide">
                <span className="stat-label">预估节拍</span>
                <span className="stat-value mono is-highlight">{formatDuration(stats.estSeconds)}</span>
              </div>
            </div>

            <div className="coord-rows">
              <div className="coord-row">
                <span className="coord-row-label">最长段</span>
                <span className="coord-row-value mono">{stats.maxSegment.toFixed(4)}</span>
              </div>
              <div className="coord-row">
                <span className="coord-row-label">最短段</span>
                <span className="coord-row-value mono">{stats.minSegment.toFixed(4)}</span>
              </div>
              <div className="coord-row">
                <span className="coord-row-label">包围盒对角线</span>
                <span className="coord-row-value mono">{stats.diagonal.toFixed(3)}</span>
              </div>
              <div className="coord-row">
                <span className="coord-row-label">包围盒 X</span>
                <span className="coord-row-value mono">
                  {stats.bbox.min[0].toFixed(2)} → {stats.bbox.max[0].toFixed(2)}
                </span>
              </div>
              <div className="coord-row">
                <span className="coord-row-label">包围盒 Y</span>
                <span className="coord-row-value mono">
                  {stats.bbox.min[1].toFixed(2)} → {stats.bbox.max[1].toFixed(2)}
                </span>
              </div>
              <div className="coord-row">
                <span className="coord-row-label">包围盒 Z</span>
                <span className="coord-row-value mono">
                  {stats.bbox.min[2].toFixed(2)} → {stats.bbox.max[2].toFixed(2)}
                </span>
              </div>
              <div className="coord-row">
                <span className="coord-row-label">平均转角</span>
                <span className="coord-row-value mono">{stats.meanTurnDeg.toFixed(2)}°</span>
              </div>
              <div className={`coord-row${stats.sharpCorners.length > 0 ? ' is-alert' : ''}`}>
                <span className="coord-row-label">尖角 (&gt;45°)</span>
                <span className="coord-row-value mono">{stats.sharpCorners.length} 处</span>
              </div>
            </div>

            {stats.sharpCorners.length > 0 && (
              <div className="alert-list">
                <div className="panel-sublabel">尖角位置（点击跳转）</div>
                {stats.sharpCorners.slice(0, 12).map((i) => (
                  <button key={i} type="button" className="alert-item is-alert" onClick={() => onJumpTo(i)}>
                    <span className="alert-item-idx">#{i + 1}</span>
                    <span className="alert-item-val mono">
                      {(stats.meanTurnDeg + 0).toFixed(0)}°+
                    </span>
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
        <div className="panel-label">导出</div>
        <div className="panel-sublabel">
          把 3D 里筛好的干净轨迹导出，回灌给离线编程软件 —— 可视化 → 修正 → 下发闭环的最后一步
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={onExportCleanCsv}>
            <Icon name="download" size={14} />
            导出清洗后 CSV
          </button>
          <button type="button" className="btn" onClick={onExportReport}>
            <Icon name="chart" size={14} />
            导出分析报告
          </button>
        </div>
      </section>
    </div>
  );
}
