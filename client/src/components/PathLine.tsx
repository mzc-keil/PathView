import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { PathPoint } from '../types';

export interface PathLineProps {
  points: PathPoint[];
  color: string;
  visible: boolean;
  lineWidth?: number;
  /**
   * 逐段颜色（长度 = points.length - 1）。提供时改用 lineSegments + vertexColors 渲染，
   * 用于「上下坡分段着色」和「轨迹 Diff 偏差热力图」。
   */
  segmentColors?: string[] | null;
  opacity?: number;
}

/**
 * 轨迹折线。
 *
 * 默认走 drei 的 <Line>（Line2 + LineMaterial）而不是原生 lineBasicMaterial ——
 * 原生 linewidth 在 WebGL 里是被忽略的（恒为 1px），原项目写的 linewidth={2} 其实是无效代码。
 * 需要逐段颜色时退化为 lineSegments + vertexColors，1 个 draw call 拿到硬边分段着色。
 */
export function PathLine({
  points,
  color,
  visible,
  lineWidth = 2,
  segmentColors = null,
  opacity = 1,
}: PathLineProps) {
  const flat = useMemo(
    () => points.map((p) => [p.x, p.y, p.z] as [number, number, number]),
    [points]
  );

  const segGeometry = useMemo(() => {
    if (!segmentColors || segmentColors.length === 0 || points.length < 2) return null;
    const segCount = points.length - 1;
    const positions = new Float32Array(segCount * 6);
    const colors = new Float32Array(segCount * 6);
    const c = new THREE.Color();

    for (let i = 0; i < segCount; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      positions[i * 6] = a.x;
      positions[i * 6 + 1] = a.y;
      positions[i * 6 + 2] = a.z;
      positions[i * 6 + 3] = b.x;
      positions[i * 6 + 4] = b.y;
      positions[i * 6 + 5] = b.z;

      c.set(segmentColors[Math.min(i, segmentColors.length - 1)]);
      colors[i * 6] = c.r;
      colors[i * 6 + 1] = c.g;
      colors[i * 6 + 2] = c.b;
      colors[i * 6 + 3] = c.r;
      colors[i * 6 + 4] = c.g;
      colors[i * 6 + 5] = c.b;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeBoundingSphere();
    return g;
  }, [points, segmentColors]);

  useEffect(
    () => () => {
      segGeometry?.dispose();
    },
    [segGeometry]
  );

  if (!visible || points.length < 2) return null;

  if (segGeometry) {
    return (
      <lineSegments geometry={segGeometry} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent={opacity < 1} opacity={opacity} />
      </lineSegments>
    );
  }

  return (
    <Line
      points={flat}
      color={color}
      lineWidth={lineWidth}
      transparent={opacity < 1}
      opacity={opacity}
      // frustumCulled=false 必需：line 类型的包围球在 three.js 里不可靠，
      // 不关掉会被错误剔除，表现为「轨迹时隐时现」
      frustumCulled={false}
    />
  );
}
