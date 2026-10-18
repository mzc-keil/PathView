/** 轨迹（列表项，不含 points） */
export interface Path {
  id: number;
  name: string;
  source_file: string | null;
  has_orientation: boolean;
  point_count: number;
  color: string;
  /** ISO 8601 带时区（服务端改进项，原实现是无时区标记的 UTC 字符串） */
  created_at: string;
}

/** 单个焊接点 */
export interface PathPoint {
  id: number;
  path_id: number;
  seq: number;
  x: number;
  y: number;
  z: number;
  /** 欧拉角，单位「度」，可为 null */
  rx: number | null;
  ry: number | null;
  rz: number | null;
  /** CSV 里未被映射的剩余列 */
  extra: Record<string, unknown> | null;
}

export interface PathWithPoints extends Path {
  points: PathPoint[];
}

export interface ColumnMapping {
  x: string;
  y: string;
  z: string;
  rx?: string;
  ry?: string;
  rz?: string;
}

export interface CsvUploadResult {
  fileId: string;
  fileName: string;
  columns: string[];
  rows: Record<string, string>[];
  rowCount: number;
  mapping: Partial<ColumnMapping>;
  hasHeader: boolean;
  /** 当前使用的表头行索引，-1 表示无表头 */
  headerRow: number;
  /** 服务端自动探测推荐的表头行（-1 表示探测结果为「无表头」） */
  detectedHeaderRow: number;
  /** 服务端实际使用的解码方式，用于排查乱码问题 */
  encoding: string;
  rawPreview: string[][];
  totalColumns: number;
}

export type PlaybackMode = 'point' | 'smooth' | 'loop';

export type ViewPreset = 'front' | 'top' | 'side' | 'iso' | 'reset';

export type OrbitTarget = 'center' | 'current';

export interface MeasureAnchor {
  pathId: number;
  pointIndex: number;
}

export interface AnchorHit {
  pathId: number;
  pointId: number;
}

export interface BoxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface AxesFilter {
  x: boolean;
  y: boolean;
  z: boolean;
}

/** 右栏页签 */
export type RightTab = 'display' | 'analysis' | 'diff' | 'stats' | 'gun';

/** 轨迹分析：相邻点间距 */
export interface SpacingReport {
  distances: number[];
  min: number;
  max: number;
  mean: number;
  median: number;
  /** 间距异常大的相邻段索引（可能是漏点/跳点） */
  anomalies: number[];
  /** 间距近似为 0 的相邻段索引（重合点，机器人会在原地停顿） */
  duplicates: number[];
  total: number;
}

/** 坡向分类：上坡 / 下坡 / 平焊 —— 对应弧焊的上下坡工艺段 */
export type SlopeClass = 'up' | 'down' | 'flat';

export interface SlopeReport {
  /** 与相邻段一一对应 */
  classes: SlopeClass[];
  /** 每段与水平面的夹角（度），正数表示上升 */
  angles: number[];
  upCount: number;
  downCount: number;
  flatCount: number;
}

/** 轨迹分析：姿态连续性 */
export interface AttitudeReport {
  /** 相邻两点的姿态夹角变化（度） */
  jumps: number[];
  max: number;
  mean: number;
  /** 跳变超过阈值的位置索引（第 i 个值对应 i → i+1 这段） */
  anomalies: number[];
  threshold: number;
}

/** 轨迹分析：几何统计 */
export interface PathStats {
  length: number;
  segments: number;
  /** 相邻点最大间距 */
  maxSegment: number;
  minSegment: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  diagonal: number;
  /** 按给定焊接速度估算的节拍（秒） */
  estSeconds: number;
  /** 转角小于阈值的点数（尖角）/ 平均转角 */
  sharpCorners: number[];
  meanTurnDeg: number;
}

/** 两条轨迹按弧长重采样后的逐点偏差 */
export interface DiffPoint {
  t: number;
  a: [number, number, number];
  b: [number, number, number];
  deviation: number;
}

export interface DiffReport {
  points: DiffPoint[];
  max: number;
  mean: number;
  rms: number;
  /** 最大偏差出现处的弧长比例 */
  maxAt: number;
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warn' | 'error';
  message: string;
}
