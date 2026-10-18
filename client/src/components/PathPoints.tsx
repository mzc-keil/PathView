import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PathPoint } from '../types';

export interface PathPointsProps {
  points: PathPoint[];
  color: string;
  /** 包围盒对角线 × 1% 的尺度基准，保证不同尺寸轨迹的视觉密度一致 */
  scaleFactor: number;
  pointSize: number;
  visible: boolean;
  /** 当前播放点索引（仅主轨迹传入） */
  currentIndex?: number | null;
  /** 测距锚点（点 id） */
  anchorPointIds?: number[];
  /** 告警点（姿态跳变 / 间距异常，点 id） */
  alertPointIds?: number[];
  alertColor?: string;
  onPointClick?: (index: number, shiftKey: boolean) => void;
}

const CURRENT_COLOR = '#ef4444';
const ANCHOR_COLOR = '#ffffff';
const HOVER_COLOR = '#f59e0b';

/**
 * 点云渲染。
 *
 * 相比原实现（每个点一个 <mesh>，679 点 = 679 draw call）改为分层 InstancedMesh：
 *  - 绝大多数普通点：1 个 InstancedMesh，材质统一用轨迹色
 *  - 告警点：1 个 InstancedMesh，材质统一用告警色
 *  - 当前点 / 测距锚点 / 悬停点：数量极少，直接用独立 mesh 各带自己的材质
 * 总 draw call 恒定为 3~6，且完全绕开 instanceColor 与 vertexColors 的着色器开关问题。
 */
export function PathPoints({
  points,
  color,
  scaleFactor,
  pointSize,
  visible,
  currentIndex = null,
  anchorPointIds = [],
  alertPointIds = [],
  alertColor = '#facc15',
  onPointClick,
}: PathPointsProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const hoveredRef = useRef<number | null>(null);
  const baseRef = useRef<THREE.InstancedMesh>(null);
  const alertRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const anchorSet = useMemo(() => new Set(anchorPointIds), [anchorPointIds]);
  const alertSet = useMemo(() => new Set(alertPointIds), [alertPointIds]);

  // 需要高亮的点从基础层里摘出去，避免同一位置出现两个球互相闪烁
  const baseIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (i === currentIndex) continue;
      if (anchorSet.has(p.id)) continue;
      if (alertSet.has(p.id)) continue;
      if (i === hovered) continue;
      out.push(i);
    }
    return out;
  }, [points, currentIndex, anchorSet, alertSet, hovered]);

  const alertIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (i === currentIndex || anchorSet.has(p.id) || i === hovered) continue;
      if (alertSet.has(p.id)) out.push(i);
    }
    return out;
  }, [points, currentIndex, anchorSet, alertSet, hovered]);

  const baseSize = scaleFactor * 0.5 * pointSize;

  useLayoutEffect(() => {
    const mesh = baseRef.current;
    if (!mesh) return;
    baseIndices.forEach((pi, i) => {
      const p = points[pi];
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(baseSize);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [baseIndices, points, dummy, baseSize]);

  useLayoutEffect(() => {
    const mesh = alertRef.current;
    if (!mesh) return;
    alertIndices.forEach((pi, i) => {
      const p = points[pi];
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(baseSize * 1.15);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [alertIndices, points, dummy, baseSize]);

  // 离开时清掉悬停态，避免球一直高亮
  useLayoutEffect(() => {
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  if (!visible || points.length === 0) return null;

  const handleHover = (index: number | null) => {
    if (hoveredRef.current === index) return;
    hoveredRef.current = index;
    setHovered(index);
    document.body.style.cursor = index == null ? '' : 'pointer';
  };

  const hitOf = (indices: number[], instanceId: number | undefined): number | null => {
    if (instanceId == null) return null;
    return indices[instanceId] ?? null;
  };

  /** 共用的事件：r3f 的 raycaster 按距离从近到远投递，stopPropagation 保证只选中最近的球 */
  const makeHandlers = (indices: number[]) => ({
    onPointerMove: (e: { stopPropagation: () => void; instanceId?: number }) => {
      e.stopPropagation();
      handleHover(hitOf(indices, e.instanceId));
    },
    onPointerOut: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      handleHover(null);
    },
    onClick: (e: { stopPropagation: () => void; instanceId?: number; shiftKey: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
      e.stopPropagation();
      const idx = hitOf(indices, e.instanceId);
      // 测距锚点用 Shift / Ctrl / Cmd 任一修饰键都可以
      if (idx != null && onPointClick) onPointClick(idx, !!(e.shiftKey || e.ctrlKey || e.metaKey));
    },
  });

  // 特殊点：当前点 / 锚点 / 悬停点，逐个独立渲染（数量恒定很小）
  const specials: Array<{ key: string; p: PathPoint; scale: number; color: string; emissive: string; intensity: number }> = [];
  if (currentIndex != null && points[currentIndex]) {
    specials.push({
      key: `cur-${points[currentIndex].id}`,
      p: points[currentIndex],
      scale: baseSize * 1.5,
      color: CURRENT_COLOR,
      emissive: CURRENT_COLOR,
      intensity: 0.6,
    });
  }
  for (const id of anchorPointIds) {
    const p = points.find((pt) => pt.id === id);
    if (p) {
      specials.push({ key: `anc-${id}`, p, scale: baseSize * 1.4, color: ANCHOR_COLOR, emissive: ANCHOR_COLOR, intensity: 0.5 });
    }
  }
  if (hovered != null && points[hovered]) {
    specials.push({
      key: `hov-${points[hovered].id}`,
      p: points[hovered],
      scale: baseSize * 1.2,
      color: HOVER_COLOR,
      emissive: HOVER_COLOR,
      intensity: 0.4,
    });
  }

  return (
    <group>
      {baseIndices.length > 0 && (
        <instancedMesh
          key={`base-${baseIndices.length}`}
          ref={baseRef}
          args={[undefined, undefined, baseIndices.length]}
          frustumCulled={false}
          {...makeHandlers(baseIndices)}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={color} metalness={0.15} roughness={0.5} />
        </instancedMesh>
      )}

      {alertIndices.length > 0 && (
        <instancedMesh
          key={`alert-${alertIndices.length}`}
          ref={alertRef}
          args={[undefined, undefined, alertIndices.length]}
          frustumCulled={false}
          {...makeHandlers(alertIndices)}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={alertColor} emissive={alertColor} emissiveIntensity={0.45} metalness={0.1} roughness={0.4} />
        </instancedMesh>
      )}

      {specials.map((s) => (
        <mesh
          key={s.key}
          position={[s.p.x, s.p.y, s.p.z]}
          scale={s.scale}
          onClick={(e) => {
            e.stopPropagation();
            const idx = points.indexOf(s.p);
            if (idx >= 0 && onPointClick) onPointClick(idx, !!(e.shiftKey || e.ctrlKey || e.metaKey));
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            handleHover(points.indexOf(s.p));
          }}
        >
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial
            color={s.color}
            emissive={s.emissive}
            emissiveIntensity={s.intensity}
            metalness={0.1}
            roughness={0.35}
          />
        </mesh>
      ))}
    </group>
  );
}
