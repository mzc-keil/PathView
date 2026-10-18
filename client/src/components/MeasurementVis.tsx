import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';

export interface MeasurementVisProps {
  a: [number, number, number];
  b: [number, number, number];
  /** 用于虚线间隔，跟场景尺度绑定 */
  scaleFactor: number;
  label?: string;
}

/** 两点测距的 3D 呈现：白色虚线 + 距离数值标签 */
export function MeasurementVis({ a, b, scaleFactor, label }: MeasurementVisProps) {
  const distance = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const mid: [number, number, number] = [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ];

  return (
    <group>
      <Line
        points={[a, b]}
        color="#ffffff"
        lineWidth={2}
        dashed
        dashSize={Math.max(scaleFactor * 2, 1e-3)}
        gapSize={Math.max(scaleFactor, 1e-3)}
        frustumCulled={false}
      />
      <Html position={mid} center zIndexRange={[500, 0]} style={{ pointerEvents: 'none' }}>
        <div className="measure-label">{label ?? distance.toFixed(2)}</div>
      </Html>
    </group>
  );
}

/** 当前点在坐标轴上的投影辅助线（新增）：帮助判断某个方向上的偏差来源 */
export function ProjectionGuide({ point, scaleFactor }: { point: THREE.Vector3; scaleFactor: number }) {
  const thin = Math.max(scaleFactor * 0.02, 0.4);
  const common = { color: '#64748b', lineWidth: 1, transparent: true, opacity: 0.55, frustumCulled: false } as const;
  return (
    <group>
      <Line points={[[point.x, point.y, point.z], [point.x, point.y, 0]]} {...common} />
      <Line points={[[point.x, point.y, 0], [point.x, 0, 0]]} {...common} />
      <Line points={[[point.x, point.y, 0], [0, 0, 0]]} {...common} />
      <Line points={[[0, 0, 0], [0, 0, thin]]} color="#3b82f6" lineWidth={1} frustumCulled={false} />
    </group>
  );
}
