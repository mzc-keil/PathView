import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { AxesFilter, PathPoint } from '../types';
import { AXIS_COLORS, AXIS_LIST, axesDirections, quaternionFromPoint } from '../three/geometry';

export interface CurrentAxesProps {
  position: THREE.Vector3 | null;
  quaternion: THREE.Quaternion | null;
  scaleFactor: number;
  filter: AxesFilter;
  visible: boolean;
  colorOverride?: string;
}

/** 当前点三轴：长度 scaleFactor × 3，线宽 3，不透明 */
export function CurrentOrientationAxes({
  position,
  quaternion,
  scaleFactor,
  filter,
  visible,
  colorOverride,
}: CurrentAxesProps) {
  const geometry = useMemo(() => {
    if (!position || !quaternion) return null;
    const dirs = axesDirections(quaternion);
    const len = scaleFactor * 3;
    return AXIS_LIST.map((axis) => {
      const end = position.clone().add(dirs[axis].multiplyScalar(len));
      return { axis, points: [[position.x, position.y, position.z] as [number, number, number], [end.x, end.y, end.z] as [number, number, number]] };
    });
  }, [position, quaternion, scaleFactor]);

  if (!visible || !geometry) return null;

  return (
    <group>
      {geometry
        .filter((g) => filter[g.axis])
        .map((g) => (
          <Line
            key={g.axis}
            points={g.points}
            color={colorOverride ?? AXIS_COLORS[g.axis]}
            lineWidth={3}
            frustumCulled={false}
          />
        ))}
    </group>
  );
}

export interface AllAxesProps {
  points: PathPoint[];
  scaleFactor: number;
  filter: AxesFilter;
  visible: boolean;
  /** 只画这些点 id 的三轴（用于只显示告警点姿态）；为空则全部画 */
  onlyPointIds?: number[];
}

/**
 * 全部点的三轴：长度 scaleFactor × 2，线宽 1，透明度 0.4。
 * 每个轴一个 BufferGeometry（里面含所有点的该轴线段），所以只有 3 个 draw call，
 * 而不是每点 3 个。
 */
export function AllOrientationAxes({ points, scaleFactor, filter, visible, onlyPointIds }: AllAxesProps) {
  const geometries = useMemo(() => {
    if (!visible || points.length === 0) return null;
    const only = onlyPointIds && onlyPointIds.length > 0 ? new Set(onlyPointIds) : null;
    const len = scaleFactor * 2;

    const buckets: Record<string, number[]> = { x: [], y: [], z: [] };
    const q = new THREE.Quaternion();

    for (const p of points) {
      if (only && !only.has(p.id)) continue;
      if (quaternionFromPoint(p, q) === null) continue;
      const dirs = axesDirections(q);
      for (const axis of AXIS_LIST) {
        const d = dirs[axis];
        buckets[axis].push(p.x, p.y, p.z, p.x + d.x * len, p.y + d.y * len, p.z + d.z * len);
      }
    }

    const out: Array<{ axis: keyof AxesFilter; geometry: THREE.BufferGeometry }> = [];
    for (const axis of AXIS_LIST) {
      const arr = buckets[axis];
      if (arr.length === 0) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeBoundingSphere();
      out.push({ axis, geometry: g });
    }
    return out;
  }, [points, scaleFactor, visible, onlyPointIds]);

  useEffect(
    () => () => {
      geometries?.forEach((g) => g.geometry.dispose());
    },
    [geometries]
  );

  if (!geometries) return null;

  return (
    <group>
      {geometries
        .filter((g) => filter[g.axis])
        .map((g) => (
          // frustumCulled=false：line 的包围球计算不可靠，不关会时隐时现
          <lineSegments key={g.axis} geometry={g.geometry} frustumCulled={false}>
            <lineBasicMaterial color={AXIS_COLORS[g.axis]} transparent opacity={0.4} />
          </lineSegments>
        ))}
    </group>
  );
}
