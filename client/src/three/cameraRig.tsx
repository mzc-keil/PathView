import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitTarget, ViewPreset } from '../types';
import type { Bounds } from './geometry';

/** 只用得到 OrbitControls 的这几个成员，用结构化类型避免依赖 three-stdlib 的类型导出 */
export interface OrbitControlsLike {
  target: THREE.Vector3;
  enabled: boolean;
  update: () => void;
  addEventListener: (type: string, listener: (event?: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event?: unknown) => void) => void;
}

export function presetCameraPosition(
  preset: Exclude<ViewPreset, 'reset'>,
  target: THREE.Vector3,
  dist: number
): THREE.Vector3 {
  switch (preset) {
    case 'front':
      return target.clone().add(new THREE.Vector3(0, -dist, 0)); // 沿 -Y 看 XZ 面
    case 'top':
      return target.clone().add(new THREE.Vector3(0, 0, dist)); // 沿 -Z 看 XY 面
    case 'side':
      return target.clone().add(new THREE.Vector3(-dist, 0, 0)); // 沿 -X 看 YZ 面
    case 'iso':
    default:
      return target.clone().add(new THREE.Vector3(dist * 0.7, -dist * 0.7, dist * 0.5));
  }
}

/** 重新取景时，包围盒对角线的变化超过这个比例才认为「值得重新取景」 */
const REFRAME_RATIO_HIGH = 1.15;
const REFRAME_RATIO_LOW = 1 / REFRAME_RATIO_HIGH;

interface Animation {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  progress: number;
}

export interface CameraRigProps {
  bounds: Bounds;
  /** 主轨迹 / 手动取景的变化标识，变化即强制重新取景 */
  frameKey: string;
  preset: ViewPreset | null;
  onPresetHandled: () => void;
  orbitTarget: OrbitTarget;
  currentPointPos: THREE.Vector3 | null;
  isPlaying: boolean;
  controlsRef: React.RefObject<OrbitControlsLike | null>;
  /** 关掉后包围盒变化只跟随中心，不再整体重新取景 */
  autoFit: boolean;
}

/**
 * 相机装配：Z-up 约定 + 自动包围盒取景 + 视角预设动画 + orbit target 同步。
 *
 * 这里集中了原项目踩过的三个坑：
 *  1. camera.up 必须是 (0,0,1) —— 焊接机器人 Z-up，用默认 Y-up 视角会整体俯仰错乱
 *  2. orbit target 必须**按值比较**，按引用比较会把用户平移过的 controls.target 抹回包围盒中心
 *  3. 播放中不跟随当前点，否则相机会被轨迹拖着走
 */
export function CameraRig({
  bounds,
  frameKey,
  preset,
  onPresetHandled,
  orbitTarget,
  currentPointPos,
  isPlaying,
  controlsRef,
  autoFit,
}: CameraRigProps) {
  const { camera } = useThree();
  const animRef = useRef<Animation | null>(null);
  const appliedFrameKey = useRef<string | null>(null);
  const boundsSig = useRef<string>('');
  const lastDiagonal = useRef<number>(bounds.diagonal);
  const stableTarget = useRef(new THREE.Vector3());
  const userInteracted = useRef(false);
  const initialized = useRef(false);

  // Z-up 必须在任何相机运算之前生效
  useLayoutEffect(() => {
    camera.up.set(0, 0, 1);
  }, [camera]);

  const startAnim = useCallback(
    (toPos: THREE.Vector3, toTarget: THREE.Vector3) => {
      const controls = controlsRef.current;
      animRef.current = {
        fromPos: camera.position.clone(),
        toPos: toPos.clone(),
        fromTarget: controls ? controls.target.clone() : bounds.center.clone(),
        toTarget: toTarget.clone(),
        progress: 0,
      };
    },
    [camera, controlsRef, bounds.center]
  );

  /** 完整重新取景：相机位置 + orbit 中心都对齐到包围盒 */
  const reframe = useCallback(
    (animate: boolean) => {
      const dist = Math.max(bounds.diagonal * 1.5, 1e-3);
      const toPos = presetCameraPosition('iso', bounds.center, dist);
      const toTarget = bounds.center.clone();
      stableTarget.current.copy(toTarget);
      if (animate && initialized.current) {
        startAnim(toPos, toTarget);
      } else {
        camera.position.copy(toPos);
        const controls = controlsRef.current;
        if (controls) {
          controls.target.copy(toTarget);
          controls.update();
        }
        initialized.current = true;
      }
    },
    [bounds, camera, controlsRef, startAnim]
  );

  /** 只移动 orbit 中心，保留用户当前的旋转与缩放 */
  const syncTarget = useCallback(
    (toTarget: THREE.Vector3, animate: boolean) => {
      const controls = controlsRef.current;
      stableTarget.current.copy(toTarget);
      if (!controls) return;
      if (animate && animRef.current === null && initialized.current) {
        // 只动中心时，相机位置沿同方向平移相同位移，视觉上不会突然缩放
        const shift = toTarget.clone().sub(controls.target);
        startAnim(camera.position.clone().add(shift), toTarget);
      } else {
        controls.target.copy(toTarget);
        controls.update();
      }
    },
    [camera, controlsRef, startAnim]
  );

  // 用户一旦操作过相机（旋转/缩放/平移）就记录下来
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return undefined;
    const onStart = () => {
      userInteracted.current = true;
    };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [controlsRef]);

  // near / far 收紧比值，最大化对数深度缓冲的精度
  useEffect(() => {
    const near = Math.max(bounds.diagonal * 0.001, 0.001);
    const far = Math.max(bounds.diagonal * 100, 100);
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }, [bounds.diagonal, camera]);

  // 主轨迹切换 → 强制重新取景
  useEffect(() => {
    if (appliedFrameKey.current !== frameKey) {
      appliedFrameKey.current = frameKey;
      userInteracted.current = false;
      boundsSig.current = '';
      reframe(false);
    }
  }, [frameKey, reframe]);

  // 包围盒变化 → 决定「整体重新取景」还是「只跟随中心」
  useEffect(() => {
    const sig = `${bounds.min.x},${bounds.min.y},${bounds.min.z}|${bounds.max.x},${bounds.max.y},${bounds.max.z}`;
    if (sig === boundsSig.current) return;
    boundsSig.current = sig;

    const prev = lastDiagonal.current;
    lastDiagonal.current = bounds.diagonal;
    const ratio = prev > 1e-9 ? bounds.diagonal / prev : 1;
    const bigChange = ratio > REFRAME_RATIO_HIGH || ratio < REFRAME_RATIO_LOW;

    if (autoFit && bigChange && !isPlaying) {
      // 包围盒显著变化（比如框选剔掉一大段坏点）→ 整体重新取景
      reframe(true);
      return;
    }

    const controls = controlsRef.current;
    if (!controls) return;
    // 用户手动平移过 → 尊重其视角；否则包围盒中心变了就跟随
    const userPanned = controls.target.distanceTo(stableTarget.current) > 1e-6;
    if (!userPanned && controls.target.distanceTo(bounds.center) > 1e-6) {
      syncTarget(bounds.center, !isPlaying);
    }
  }, [bounds, autoFit, isPlaying, reframe, syncTarget, controlsRef]);

  // orbitTarget = 'current'：相机中心跟随当前焊接点；播放中不跟随，否则相机被轨迹拖走
  useEffect(() => {
    if (orbitTarget !== 'current') return;
    if (isPlaying || !currentPointPos) return;
    const controls = controlsRef.current;
    if (!controls) return;
    if (controls.target.distanceTo(currentPointPos) <= 1e-6) return;
    syncTarget(currentPointPos.clone(), true);
  }, [orbitTarget, currentPointPos, isPlaying, syncTarget, controlsRef]);

  // 视角预设
  useEffect(() => {
    if (!preset) return;
    if (preset === 'reset') {
      userInteracted.current = false;
      reframe(true);
      onPresetHandled();
      return;
    }
    const controls = controlsRef.current;
    const target = controls ? controls.target.clone() : bounds.center.clone();
    const dist = Math.max(bounds.diagonal * 1.5, 1e-3);
    startAnim(presetCameraPosition(preset, target, dist), target);
    stableTarget.current.copy(target);
    // 用户主动选了视角，后续包围盒变化只跟随中心，不再强行重置视角
    userInteracted.current = true;
    onPresetHandled();
  }, [preset, bounds, reframe, startAnim, onPresetHandled, controlsRef]);

  useFrame((_, delta) => {
    const anim = animRef.current;
    if (!anim) return;

    anim.progress += delta * 3;
    if (anim.progress >= 1) anim.progress = 1;

    const t = 1 - Math.pow(1 - anim.progress, 3); // ease out cubic
    camera.position.lerpVectors(anim.fromPos, anim.toPos, t);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerpVectors(anim.fromTarget, anim.toTarget, t);
      controls.update();
    }

    if (anim.progress >= 1) {
      animRef.current = null;
      initialized.current = true;
    }
  });

  return null;
}
