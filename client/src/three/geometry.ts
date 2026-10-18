import * as THREE from 'three';
import type { AxesFilter, PathPoint } from '../types';

/** 全项目统一的三轴颜色约定 */
export const AXIS_COLORS = {
  x: '#ef4444',
  y: '#10b981',
  z: '#3b82f6',
} as const;

export const AXIS_LIST: Array<keyof AxesFilter> = ['x', 'y', 'z'];

export interface Bounds {
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
  diagonal: number;
  /** 贯穿全场景的尺度基准 = 对角线 × 1%。点大小 / 轴长 / 虚线间隔全部按它缩放 */
  scaleFactor: number;
}

const EMPTY_BOUNDS = (): Bounds => ({
  min: new THREE.Vector3(0, 0, 0),
  max: new THREE.Vector3(0, 0, 0),
  center: new THREE.Vector3(0, 0, 0),
  diagonal: 1,
  scaleFactor: 0.01,
});

/**
 * 自动包围盒取景基准。
 * 注意：调用方传进来的应该是**过滤掉隐藏点之后**的点集，所以隐藏一个点会让包围盒收紧、
 * 相机自动重新取景 —— 这是刻意设计，不是副作用。
 */
export function computeBounds(points: PathPoint[]): Bounds {
  if (points.length === 0) return EMPTY_BOUNDS();

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const p of points) {
    if (p.x < min.x) min.x = p.x;
    if (p.y < min.y) min.y = p.y;
    if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x;
    if (p.y > max.y) max.y = p.y;
    if (p.z > max.z) max.z = p.z;
  }

  const center = min.clone().add(max).multiplyScalar(0.5);
  // 单点或共点轨迹对角线为 0，给一个兜底尺度，避免 scaleFactor 归零导致什么都看不见
  const diagonal = Math.max(min.distanceTo(max), 1e-3);

  return { min, max, center, diagonal, scaleFactor: diagonal * 0.01 };
}

/** 轨迹折线 BufferGeometry（手写，不用 drei Line，因为要精确控制 positions） */
export function buildLineGeometry(points: PathPoint[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i += 1) {
    positions[i * 3] = points[i].x;
    positions[i * 3 + 1] = points[i].y;
    positions[i * 3 + 2] = points[i].z;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function pointToVector(p: PathPoint, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(p.x, p.y, p.z);
}

export function hasOrientation(p: PathPoint): boolean {
  return p.rx != null || p.ry != null || p.rz != null;
}

/**
 * 把点的欧拉角转成四元数。顺序必须是 'ZYX'（机器人学 yaw-pitch-roll），
 * three.js 默认是 XYZ —— 顺序错了姿态会「看起来差不多但全错」，极难排查。
 * 角度单位是「度」，必须先 degToRad。
 */
export function quaternionFromPoint(p: PathPoint, target = new THREE.Quaternion()): THREE.Quaternion | null {
  if (!hasOrientation(p)) return null;
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(p.rx ?? 0),
    THREE.MathUtils.degToRad(p.ry ?? 0),
    THREE.MathUtils.degToRad(p.rz ?? 0),
    'ZYX'
  );
  return target.setFromEuler(euler);
}

/** 单点三轴：返回当前点旋转后的 3 个轴向量 */
export function axesDirections(quaternion: THREE.Quaternion): Record<keyof AxesFilter, THREE.Vector3> {
  return {
    x: new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion),
    y: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
    z: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
  };
}

/** 供 AllOrientationAxes 用：两点（origin → end）的 BufferGeometry */
export function makeSegmentGeometry(
  origin: [number, number, number],
  end: THREE.Vector3
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([...origin, end.x, end.y, end.z], 3)
  );
  return g;
}

/** 偏差 → 颜色（蓝→青→黄→红），用 HSL 保证过渡连续 */
export function deviationColor(value: number, max: number): string {
  if (max <= 0) return '#3b82f6';
  const t = Math.min(Math.max(value / max, 0), 1);
  // 色相 210°(蓝) → 0°(红)，亮度略降到 55% 让深色底上更扎实
  const hue = (1 - t) * 210;
  const color = new THREE.Color();
  color.setHSL(hue / 360, 0.85, 0.55);
  return `#${color.getHexString()}`;
}

/** 把角度规范化到 [-180, 180)，用于计算最短姿态差 */
export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式 / 配额满，忽略 */
  }
}
