import * as THREE from 'three';
import type {
  AttitudeReport,
  DiffReport,
  PathPoint,
  PathStats,
  SlopeClass,
  SlopeReport,
  SpacingReport,
} from '../types';
import { deviationColor, quaternionFromPoint } from './geometry';

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function segmentDistances(points: PathPoint[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    out.push(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 1. 点间距分析（新增）
 * ------------------------------------------------------------------ */

/**
 * 相邻点间距统计。焊接轨迹里两类异常都很有价值：
 *  - 间距突然变大 → 中间漏点，机器人会以直线冲过去，可能撞件
 *  - 间距接近 0   → 重合点，机器人原地停顿，容易烧穿/堆焊
 */
export function analyzeSpacing(points: PathPoint[], anomalyFactor = 3): SpacingReport {
  const distances = segmentDistances(points);
  if (distances.length === 0) {
    return { distances, min: 0, max: 0, mean: 0, median: 0, anomalies: [], duplicates: [], total: 0 };
  }

  const sorted = [...distances].sort((a, b) => a - b);
  const med = median(sorted);
  const mean = distances.reduce((s, d) => s + d, 0) / distances.length;
  const max = sorted[sorted.length - 1];
  const min = sorted[0];

  // 中位数为 0（存在大量重合点）时退化为用最大值的一半做阈值
  const threshold = med > 1e-9 ? med * anomalyFactor : Math.max(max * 0.5, 1e-9);

  const anomalies: number[] = [];
  const duplicates: number[] = [];
  distances.forEach((d, i) => {
    if (d <= 1e-9) duplicates.push(i);
    else if (d > threshold) anomalies.push(i);
  });

  return { distances, min, max, mean, median: med, anomalies, duplicates, total: distances.length };
}

/* ------------------------------------------------------------------ *
 * 2. 姿态连续性检查（新增）
 * ------------------------------------------------------------------ */

/**
 * 相邻点姿态夹角突变检测。
 *
 * 用四元数夹角而不是逐轴欧拉角差值 —— 欧拉角在 ±180° 处会跳变（例如 179° → -179°
 * 实际只转了 2°，逐轴相减却是 358°），会产生大量假告警。四元数夹角用
 * 2·acos(|dot|) 得到真实最短旋转量。
 */
export function analyzeAttitude(points: PathPoint[], thresholdDeg = 25): AttitudeReport {
  const jumps: number[] = [];
  const anomalies: number[] = [];
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();

  for (let i = 0; i < points.length - 1; i += 1) {
    const hasA = quaternionFromPoint(points[i], qa) !== null;
    const hasB = quaternionFromPoint(points[i + 1], qb) !== null;
    // 任一点没有姿态数据就跳过这一对，否则会被当成 0° 掩盖真实跳变
    if (!hasA || !hasB) continue;

    const dot = Math.min(Math.abs(qa.dot(qb)), 1);
    const deg = THREE.MathUtils.radToDeg(2 * Math.acos(dot));
    jumps.push(deg);
    if (deg > thresholdDeg) anomalies.push(i);
  }

  const max = jumps.length > 0 ? Math.max(...jumps) : 0;
  const mean = jumps.length > 0 ? jumps.reduce((s, d) => s + d, 0) / jumps.length : 0;

  return { jumps, max, mean, anomalies, threshold: thresholdDeg };
}

/* ------------------------------------------------------------------ *
 * 3. 坡向分段（新增，对应弧焊上下坡工艺）
 * ------------------------------------------------------------------ */

/**
 * 按每段的爬升角分类上坡/下坡/平焊。
 * 弧焊里上下坡段需要调 arcWeldOffset 补偿熔池，所以先把它们标出来很有用。
 */
export function analyzeSlopes(points: PathPoint[], flatDeg = 5): SlopeReport {
  const classes: SlopeClass[] = [];
  const angles: number[] = [];
  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);

    const deg = len <= 1e-9 ? 0 : THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, dz / len))));
    angles.push(deg);

    let cls: SlopeClass;
    if (deg > flatDeg) cls = 'up';
    else if (deg < -flatDeg) cls = 'down';
    else cls = 'flat';

    classes.push(cls);
    if (cls === 'up') upCount += 1;
    else if (cls === 'down') downCount += 1;
    else flatCount += 1;
  }

  return { classes, angles, upCount, downCount, flatCount };
}

/** 坡向着色的三档颜色（上坡红 / 下坡绿 / 平焊蓝），与 A 股涨跌一致的直觉 */
export const SLOPE_COLORS: Record<SlopeClass, string> = {
  up: '#ef4444',
  down: '#10b981',
  flat: '#3b82f6',
};

/** 把坡向报告转成逐段颜色，供 PathLine 的 segmentColors 使用 */
export function slopeSegmentColors(report: SlopeReport): string[] {
  return report.classes.map((c) => SLOPE_COLORS[c]);
}

/** 生成逐顶点颜色数组：把每段的颜色复制到该段两端顶点，得到硬边分段着色 */
export function buildSlopeColorAttribute(points: PathPoint[], report: SlopeReport): THREE.Float32BufferAttribute {
  const colors = new Float32Array(points.length * 3);
  const c = new THREE.Color();
  for (let i = 0; i < points.length; i += 1) {
    // 顶点 i 取「进入它的段」的颜色，最后一个点沿用最后一段
    const segIdx = Math.min(i, report.classes.length - 1);
    c.set(SLOPE_COLORS[report.classes[segIdx] ?? 'flat']);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return new THREE.Float32BufferAttribute(colors, 3);
}

/* ------------------------------------------------------------------ *
 * 4. 几何统计与节拍估算（新增）
 * ------------------------------------------------------------------ */

export function analyzeStats(points: PathPoint[], weldSpeed = 10, sharpTurnDeg = 45): PathStats {
  const segments = segmentDistances(points);
  const length = segments.reduce((s, d) => s + d, 0);

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of points) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  if (points.length === 0) {
    min.set(0, 0, 0);
    max.set(0, 0, 0);
  }

  // 逐点转角：进入方向和离开方向的夹角
  const turns: number[] = [];
  const sharpCorners: number[] = [];
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  for (let i = 1; i < points.length - 1; i += 1) {
    v1.set(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
    v2.set(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y, points[i + 1].z - points[i].z);
    if (v1.lengthSq() <= 1e-18 || v2.lengthSq() <= 1e-18) continue;
    const deg = THREE.MathUtils.radToDeg(v1.angleTo(v2));
    turns.push(deg);
    if (deg > sharpTurnDeg) sharpCorners.push(i);
  }

  const diagonal = points.length > 0 ? min.distanceTo(max) : 0;
  const meanTurnDeg = turns.length > 0 ? turns.reduce((s, d) => s + d, 0) / turns.length : 0;

  return {
    length,
    segments: segments.length,
    maxSegment: segments.length > 0 ? Math.max(...segments) : 0,
    minSegment: segments.length > 0 ? Math.min(...segments) : 0,
    bbox: { min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] },
    diagonal,
    estSeconds: weldSpeed > 0 ? length / weldSpeed : 0,
    sharpCorners,
    meanTurnDeg,
  };
}

/* ------------------------------------------------------------------ *
 * 5. 轨迹对比 Diff（新增）
 * ------------------------------------------------------------------ */

/** 按弧长均匀重采样，得到与点数无关的等参数化表示 */
export function resampleUniform(points: PathPoint[], count: number): Array<[number, number, number]> {
  if (points.length === 0) return [];
  if (points.length === 1 || count <= 1) {
    return Array.from({ length: Math.max(count, 1) }, () => [points[0].x, points[0].y, points[0].z]);
  }

  const cum: number[] = [0];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const total = cum[cum.length - 1];

  if (total <= 1e-12) {
    return Array.from({ length: count }, () => [points[0].x, points[0].y, points[0].z]);
  }

  const out: Array<[number, number, number]> = [];
  let seg = 0;
  for (let k = 0; k < count; k += 1) {
    const target = (total * k) / (count - 1);
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg += 1;
    const segLen = cum[seg + 1] - cum[seg];
    const f = segLen <= 1e-12 ? 0 : (target - cum[seg]) / segLen;
    const a = points[seg];
    const b = points[seg + 1];
    out.push([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f]);
  }
  return out;
}

/**
 * 两条轨迹的逐点偏差。
 *
 * 关键点：不能按索引对齐 —— 两条轨迹点数几乎必然不同（比如 v3 有 58 点、v311 有 61 点）。
 * 先各自按弧长均匀重采样到相同数量，再逐点求欧氏距离，这样比的是「同一焊接进度处
 * 的几何差异」，才是用户真正关心的。
 */
export function diffPaths(
  a: PathPoint[],
  b: PathPoint[],
  sampleCount = 200,
  reverseB = false
): { points: Array<{ t: number; a: [number, number, number]; b: [number, number, number]; deviation: number }>; max: number; mean: number; rms: number; maxAt: number } {
  const bPoints = reverseB ? [...b].reverse() : b;
  const sa = resampleUniform(a, sampleCount);
  const sb = resampleUniform(bPoints, sampleCount);
  const n = Math.min(sa.length, sb.length);

  const points: Array<{ t: number; a: [number, number, number]; b: [number, number, number]; deviation: number }> = [];
  let max = 0;
  let maxAt = 0;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < n; i += 1) {
    const deviation = Math.hypot(sa[i][0] - sb[i][0], sa[i][1] - sb[i][1], sa[i][2] - sb[i][2]);
    sum += deviation;
    sumSq += deviation * deviation;
    if (deviation > max) {
      max = deviation;
      maxAt = n > 1 ? i / (n - 1) : 0;
    }
    points.push({ t: n > 1 ? i / (n - 1) : 0, a: sa[i], b: sb[i], deviation });
  }

  return {
    points,
    max,
    mean: n > 0 ? sum / n : 0,
    rms: n > 0 ? Math.sqrt(sumSq / n) : 0,
    maxAt,
  };
}

/* ------------------------------------------------------------------ *
 * 6. 把 Diff 偏差映射回原始折线的逐段颜色
 * ------------------------------------------------------------------ */

/** 每个点在整条轨迹上的弧长比例 0..1 */
export function arcLengthFractions(points: PathPoint[]): number[] {
  if (points.length === 0) return [];
  const cum: number[] = [0];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const total = cum[cum.length - 1];
  if (total <= 1e-12) return points.map(() => 0);
  return cum.map((c) => c / total);
}

/**
 * Diff 报告是按弧长均匀采样的，要画回原始折线必须把每段映射到对应采样点。
 * 取段中点的弧长比例去查最接近的采样索引 —— 采样点数够多时误差可忽略。
 */
export function deviationSegmentColors(
  points: PathPoint[],
  report: DiffReport,
  reversed = false
): string[] {
  if (points.length < 2 || report.points.length === 0) return [];
  const fracs = arcLengthFractions(points);
  const n = report.points.length;
  const out: string[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const mid = (fracs[i] + fracs[i + 1]) / 2;
    const t = reversed ? 1 - mid : mid;
    const idx = Math.min(Math.max(Math.round(t * (n - 1)), 0), n - 1);
    out.push(deviationColor(report.points[idx].deviation, report.max));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 7. CSV 导出（应用隐藏点过滤之后）
 * ------------------------------------------------------------------ */

const CSV_HEADER = ['seq', 'x', 'y', 'z', 'rx', 'ry', 'rz'];

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 导出清洗后的轨迹（已剔除隐藏点）。
 * 这是「可视化 → 修正 → 下发」闭环的最后一步：把 3D 里筛出来的干净轨迹
 * 直接导出成 CSV 回灌给离线编程软件 / 机器人控制器。
 */
export function pathsToCsv(paths: Array<{ name: string; points: PathPoint[] }>): string {
  const extraKeys: string[] = [];
  for (const path of paths) {
    for (const p of path.points) {
      if (!p.extra) continue;
      for (const k of Object.keys(p.extra)) if (!extraKeys.includes(k)) extraKeys.push(k);
    }
  }

  const header = [...CSV_HEADER, ...(paths.length > 1 ? ['path'] : []), ...extraKeys];
  const lines: string[] = [header.join(',')];

  for (const path of paths) {
    path.points.forEach((p, i) => {
      const row: unknown[] = [
        i,
        p.x.toFixed(4),
        p.y.toFixed(4),
        p.z.toFixed(4),
        p.rx != null ? p.rx.toFixed(4) : '',
        p.ry != null ? p.ry.toFixed(4) : '',
        p.rz != null ? p.rz.toFixed(4) : '',
      ];
      if (paths.length > 1) row.push(path.name);
      for (const k of extraKeys) row.push(p.extra ? p.extra[k] ?? '' : '');
      lines.push(row.map(escapeCsv).join(','));
    });
  }

  // 带 BOM，否则 Excel 打开中文列名会乱码
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 导出分析报告（姿态跳变 / 间距异常清单） */
export function analysisToCsv(
  pathName: string,
  points: PathPoint[],
  attitude: AttitudeReport,
  spacing: SpacingReport,
  slopes: SlopeReport
): string {
  const lines: string[] = [];
  lines.push(`# PathView 分析报告`);
  lines.push(`# 轨迹,${escapeCsv(pathName)}`);
  lines.push(`# 点数,${points.length}`);
  lines.push(`# 姿态跳变阈值(度),${attitude.threshold}`);
  lines.push(`# 姿态跳变最大值(度),${attitude.max.toFixed(4)}`);
  lines.push(`# 姿态跳变均值(度),${attitude.mean.toFixed(4)}`);
  lines.push(`# 跳变超阈值处,${attitude.anomalies.length}`);
  lines.push(`# 间距中位数,${spacing.median.toFixed(4)}`);
  lines.push(`# 间距最大值,${spacing.max.toFixed(4)}`);
  lines.push(`# 间距异常段,${spacing.anomalies.length}`);
  lines.push(`# 重合点段,${spacing.duplicates.length}`);
  lines.push(`# 上坡段,${slopes.upCount}`);
  lines.push(`# 下坡段,${slopes.downCount}`);
  lines.push(`# 平焊段,${slopes.flatCount}`);
  lines.push('');
  lines.push('seq,x,y,z,rx,ry,rz,seg_length,attitude_jump_deg,slope_class,turn_flag,spacing_flag');
  points.forEach((p, i) => {
    const jump = i > 0 ? attitude.jumps[i - 1] : undefined;
    const segLen = i > 0 ? spacing.distances[i - 1] : undefined;
    const slope = i > 0 ? slopes.classes[i - 1] : undefined;
    const row = [
      i,
      p.x,
      p.y,
      p.z,
      p.rx ?? '',
      p.ry ?? '',
      p.rz ?? '',
      segLen !== undefined ? segLen.toFixed(5) : '',
      jump !== undefined ? jump.toFixed(4) : '',
      slope ?? '',
      jump !== undefined && attitude.anomalies.includes(i - 1) ? 'ATTITUDE_JUMP' : '',
      segLen !== undefined && spacing.anomalies.includes(i - 1) ? 'SPACING_OUTLIER' : '',
    ];
    lines.push(row.map(escapeCsv).join(','));
  });
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
