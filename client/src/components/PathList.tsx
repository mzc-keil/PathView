import { useMemo, useRef, useState } from 'react';
import type { Path } from '../types';
import { Icon } from './Icon';

/** 7 色相 × 5 明度 = 35 色板（照抄原项目的取色方案） */
export const COLOR_PALETTE: Array<{ name: string; shades: string[] }> = [
  { name: 'Red', shades: ['#fecaca', '#f87171', '#ef4444', '#dc2626', '#991b1b'] },
  { name: 'Orange', shades: ['#fed7aa', '#fb923c', '#f97316', '#ea580c', '#c2410c'] },
  { name: 'Yellow', shades: ['#fef08a', '#facc15', '#eab308', '#ca8a04', '#a16207'] },
  { name: 'Green', shades: ['#bbf7d0', '#4ade80', '#22c55e', '#16a34a', '#15803d'] },
  { name: 'Blue', shades: ['#bfdbfe', '#60a5fa', '#3b82f6', '#2563eb', '#1e40af'] },
  { name: 'Purple', shades: ['#e9d5ff', '#c084fc', '#a855f7', '#9333ea', '#7e22ce'] },
  { name: 'Cyan', shades: ['#a5f3fc', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490'] },
];

/**
 * 服务端现在返回带 Z 的 ISO 时间，但这里同时兼容原实现的无时区 UTC 字符串 ——
 * 不补 T/Z 会被当成本地时间解析，东八区晚上导入的轨迹会被归到次日。
 */
export function dateKeyOf(createdAt: string): string {
  const iso = createdAt.includes('T') ? createdAt : `${createdAt.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return createdAt;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateLabelOf(key: string): string {
  if (key === dateKeyOf(new Date().toISOString())) return '今天';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dateKeyOf(yesterday.toISOString())) return '昨天';
  return key;
}

function timeOf(createdAt: string): string {
  const iso = createdAt.includes('T') ? createdAt : `${createdAt.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface PathListProps {
  paths: Path[];
  selectedIds: number[];
  mainId: number | null;
  hiddenCounts: Map<number, number>;
  query: string;
  loading: boolean;
  onQuery: (q: string) => void;
  onSelect: (id: number, additive: boolean) => void;
  onDelete: (id: number) => void;
  onDeleteMany: (ids: number[]) => void;
  onChangeColor: (id: number, color: string) => void;
  onRename: (id: number, name: string) => void;
  onImportClick: () => void;
  onOpenData: (id: number) => void;
  onClearSelection: () => void;
}

export function PathList({
  paths,
  selectedIds,
  mainId,
  hiddenCounts,
  query,
  loading,
  onQuery,
  onSelect,
  onDelete,
  onDeleteMany,
  onChangeColor,
  onRename,
  onImportClick,
  onOpenData,
  onClearSelection,
}: PathListProps) {
  // null = 用户尚未手动折叠过，按默认规则（只展开今天）；一旦操作就固化为显式集合
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
  const [paletteFor, setPaletteFor] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return paths;
    return paths.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.source_file ?? '').toLowerCase().includes(q)
    );
  }, [paths, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Path[]>();
    for (const path of filtered) {
      const key = dateKeyOf(path.created_at);
      const bucket = map.get(key);
      if (bucket) bucket.push(path);
      else map.set(key, [path]);
    }
    return map;
  }, [filtered]);

  const todayKey = dateKeyOf(new Date().toISOString());
  const collapsedKeys = collapsed ?? new Set([...groups.keys()].filter((k) => k !== todayKey));

  const toggleGroup = (key: string) => {
    const next = new Set(collapsedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  const startRename = (path: Path) => {
    setRenamingId(path.id);
    setDraftName(path.name);
    window.setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (renamingId == null) return;
    const name = draftName.trim();
    if (name) onRename(renamingId, name);
    setRenamingId(null);
  };

  const multiSelected = selectedIds.length > 1;

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <div className="panel-label">轨迹列表</div>
        <span className="sidebar-count">{paths.length}</span>
      </div>

      <div className="sidebar-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={onImportClick}>
          <Icon name="upload" size={14} />
          导入 CSV
        </button>
      </div>

      <div className="search-box">
        <Icon name="search" size={14} />
        <input
          className="search-input"
          placeholder="搜索轨迹名 / 源文件"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="mini-btn" onClick={() => onQuery('')} title="清空">
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      {multiSelected && (
        <div className="batch-bar">
          <span className="batch-count">已选 {selectedIds.length} 条</span>
          <button type="button" className="btn btn-sm" onClick={onClearSelection}>
            仅留主轨迹
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => onDeleteMany(selectedIds)}
          >
            <Icon name="trash" size={13} />
            批量删除
          </button>
        </div>
      )}

      <div className="path-list-items">
        {loading && paths.length === 0 && <div className="empty-state">加载中…</div>}
        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            {paths.length === 0 ? (
              <>
                还没有轨迹
                <br />
                把 CSV 拖进窗口任意位置即可导入
              </>
            ) : (
              '没有匹配的轨迹'
            )}
          </div>
        )}

        {[...groups.entries()].map(([key, items]) => {
          const isCollapsed = collapsedKeys.has(key);
          return (
            <div className="path-group" key={key}>
              <button type="button" className="path-group-header" onClick={() => toggleGroup(key)}>
                <Icon
                  name="chevron"
                  size={13}
                  style={{ transform: isCollapsed ? 'none' : 'rotate(90deg)', transition: 'transform .15s' }}
                />
                <span className="path-group-title">{dateLabelOf(key)}</span>
                <span className="path-group-count">{items.length}</span>
              </button>

              {!isCollapsed &&
                items.map((path) => {
                  const selected = selectedIds.includes(path.id);
                  const isMain = path.id === mainId;
                  const hidden = hiddenCounts.get(path.id) ?? 0;
                  return (
                    <div
                      key={path.id}
                      className={`path-item${selected ? ' is-selected' : ''}${isMain ? ' is-main' : ''}`}
                      onClick={(e) => onSelect(path.id, e.ctrlKey || e.metaKey)}
                      onDoubleClick={() => onOpenData(path.id)}
                      title="单击选中 · Ctrl/Cmd 单击多选 · 双击查看点位数据"
                    >
                      <button
                        type="button"
                        className="color-dot-btn"
                        title="改颜色"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaletteFor(paletteFor === path.id ? null : path.id);
                        }}
                      >
                        <span className="color-dot" style={{ background: path.color }} />
                      </button>

                      <div className="path-item-main">
                        {renamingId === path.id ? (
                          <input
                            ref={inputRef}
                            className="rename-input"
                            value={draftName}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDraftName(e.target.value)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onBlur={commitRename}
                          />
                        ) : (
                          <span className="path-item-name" onDoubleClick={(e) => { e.stopPropagation(); startRename(path); }}>
                            {path.name}
                          </span>
                        )}

                        <div className="path-item-meta">
                          <span className="mono">
                            {path.point_count - hidden}/{path.point_count} points
                          </span>
                          <span className="meta-dot" />
                          <span>{timeOf(path.created_at)}</span>
                          {path.has_orientation && (
                            <>
                              <span className="meta-dot" />
                              <span className="badge badge-orientation">Orientation</span>
                            </>
                          )}
                          {hidden > 0 && (
                            <>
                              <span className="meta-dot" />
                              <span className="badge badge-hidden">已隐藏 {hidden}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="mini-btn danger"
                        title="删除该轨迹"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(path.id);
                        }}
                      >
                        <Icon name="trash" size={13} />
                      </button>

                      {paletteFor === path.id && (
                        <div className="palette-popover" onClick={(e) => e.stopPropagation()}>
                          {COLOR_PALETTE.map((row) => (
                            <div className="palette-row" key={row.name}>
                              {row.shades.map((shade) => (
                                <button
                                  key={shade}
                                  type="button"
                                  className={`palette-swatch${path.color === shade ? ' is-active' : ''}`}
                                  style={{ background: shade }}
                                  title={`${row.name} ${shade}`}
                                  onClick={() => {
                                    onChangeColor(path.id, shade);
                                    setPaletteFor(null);
                                  }}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <span className="sublabel-mini">
          单击选中 · Ctrl 多选 · 双击看数据 · 双击名字改名
        </span>
      </div>
    </aside>
  );
}
