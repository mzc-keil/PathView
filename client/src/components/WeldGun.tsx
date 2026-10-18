import { memo, useMemo } from 'react';
import * as THREE from 'three';
import type { WeldGunParams } from '../types/weldGun';

export interface WeldGunProps {
  params: WeldGunParams;
}

/**
 * 参数化焊枪模型：嘴尖固定在局部原点，各段沿 direction 方向依次叠加。
 *
 * 局部坐标系约定（很重要，改错会导致模型整体反向）：
 *  - 枪嘴 / 枪颈 / 枪体都是沿局部 Z 轴的圆柱（cylinderGeometry 默认沿 Y，所以转 90°）
 *  - 枪柄是从枪体末端沿同方向再延伸的 Box，绕 Y 轴旋转 bendAngle
 *  - 弯角方向恒定向 -X 侧：绕 Y 正角旋转 -Z 向量得到 -X，旋转 +Z 向量得到 +X，
 *    所以 z-（柄本地为 -Z）用 +bendRad，z+（柄本地为 +Z）用 -bendRad = -sign × bendRad
 */
function WeldGunImpl({ params }: WeldGunProps) {
  const sign = params.direction === 'z+' ? 1 : -1;

  const geometry = useMemo(() => {
    const nozzleZ = (sign * params.nozzleLength) / 2;
    const neckZ = sign * (params.nozzleLength + params.neckLength / 2);
    const bodyZ = sign * (params.nozzleLength + params.neckLength + params.bodyLength / 2);
    const bodyEndZ = sign * (params.nozzleLength + params.neckLength + params.bodyLength);

    const bendRad = THREE.MathUtils.degToRad(params.bendAngle);
    const handleCenterLocal = new THREE.Vector3(0, 0, (sign * params.handleLength) / 2);
    const handleQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -sign * bendRad
    );
    const handleCenter = handleCenterLocal
      .clone()
      .applyQuaternion(handleQuat)
      .add(new THREE.Vector3(0, 0, bodyEndZ));

    return { nozzleZ, neckZ, bodyZ, handleCenter, handleQuat };
  }, [sign, params]);

  const cylinderRotation: [number, number, number] = [Math.PI / 2, 0, 0];

  return (
    <group>
      {/* 枪嘴：金属感最强 */}
      <mesh position={[0, 0, geometry.nozzleZ]} rotation={cylinderRotation} castShadow={false}>
        <cylinderGeometry args={[params.nozzleRadius, params.nozzleRadius * 1.1, params.nozzleLength, 16]} />
        <meshStandardMaterial color={params.color} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* 枪颈（鹅颈） */}
      <mesh position={[0, 0, geometry.neckZ]} rotation={cylinderRotation}>
        <cylinderGeometry args={[params.neckRadius, params.neckRadius, params.neckLength, 16]} />
        <meshStandardMaterial color={params.color} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* 枪体 */}
      <mesh position={[0, 0, geometry.bodyZ]} rotation={cylinderRotation}>
        <cylinderGeometry args={[params.bodyRadius, params.bodyRadius, params.bodyLength, 20]} />
        <meshStandardMaterial color={params.color} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* 枪柄 */}
      <mesh position={geometry.handleCenter} quaternion={geometry.handleQuat}>
        <boxGeometry args={[params.handleWidth, params.handleDepth, params.handleLength]} />
        <meshStandardMaterial color={params.color} metalness={0.4} roughness={0.6} />
      </mesh>

      {/* 嘴尖标记：一个小锥体，方便判断 TCP 朝向 */}
      <mesh position={[0, 0, 0]} rotation={[sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]}>
        <coneGeometry args={[params.nozzleRadius * 1.2, params.nozzleRadius * 2.4, 12]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

export const WeldGun = memo(WeldGunImpl);
