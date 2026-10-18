import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import type {
  AnchorHit,
  AxesFilter,
  BoxRect,
  MeasureAnchor,
  OrbitTarget,
  PathWithPoints,
  PlaybackMode,
  ViewPreset,
} from '../types';
import type { WeldGunParams } from '../types/weldGun';
import { CameraRig, type OrbitControlsLike } from '../three/cameraRig';
import { computeBounds, quaternionFromPoint, AXIS_COLORS } from '../three/geometry';
import { useBoxSelect, type ProjectablePath } from '../three/boxSelect';
import { PathLine } from './PathLine';
import { PathPoints } from './PathPoints';
import { AllOrientationAxes, CurrentOrientationAxes } from './OrientationAxes';
import { WeldGun } from './WeldGun';
import { MeasurementVis } from './MeasurementVis';
import { Icon } from './Icon';

/** 把 Canvas 内部的 camera / size 暴露给外层的框选逻辑 */
function SceneBridge({
  cameraRef,
  sizeRef,
}: {
  cameraRef: React.RefObject<THREE.Camera | null>;
  sizeRef: React.RefObject<{ width: number; height: number }>;
}) {
  const { camera, size } = useThree();
  cameraRef.current = camera;
  sizeRef.current = { width: size.width, height: size.height };
  return null;
}

/** 参考工作台：地面网格 + 原点三轴，给空间一个参照系 */
function WorkbenchGrid({ bounds, visible }: { bounds: ReturnType<typeof computeBounds>; visible: boolean }) {
  const size = Math.max(bounds.diagonal * 2.4, 1);
  const cell = Math.max(size / 24, 1e-3);
  const axisLen = Math.max(bounds.diagonal * 0.6, 1e-3);

  const lines = useMemo(() => {
    const z = bounds.min.z;
    return {
      z,
      list: [
        { axis: 'x' as const, points: [[-axisLen / 2, 0, z], [axisLen / 2, 0, z]] as [number, number, number][] },
        { axis: 'y' as const, points: [[0, -axisLen / 2, z], [0, axisLen / 2, z]] as [number, number, number][] },
        { axis: 'z' as const, points: [[0, 0, z], [0, 0, z + axisLen]] as [number, number, number][] },
      ],
    };
  }, [bounds, axisLen]);

  if (!visible) return null;

  return (
    <group>
      <Grid
        position={[bounds.center.x, bounds.center.y, lines.z]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[size, size]}
        cellSize={cell}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={cell * 5}
        sectionThickness={0.9}
        sectionColor="#475569"
        fadeDistance={size * 2.2}
        fadeStrength={1.2}
        side={THREE.DoubleSide}
      />
      {lines.list.map((l) => (
        <Line key={l.axis} points={l.points} color={AXIS_COLORS[l.axis]} lineWidth={1.5} frustumCulled={false} />
      ))}
    </group>
  );
}

export interface Scene3DProps {
  paths: PathWithPoints[];
  mainId: number | null;
  mainPath: PathWithPoints | null;
  currentIndex: number;
  frac: number;
  isPlaying: boolean;
  mode: PlaybackMode;
  frameKey: string;
  viewPreset: ViewPreset | null;
  onPresetHandled: () => void;
  orbitTarget: OrbitTarget;
  autoFit: boolean;
  showLine: boolean;
  showPoints: boolean;
  showGrid: boolean;
  pointSize: number;
  showAxes: boolean;
  showAllAxes: boolean;
  axesFilter: AxesFilter;
  lineColors: Map<number, string[] | null> | null;
  /** 多轨迹同步回放：pathId → 该轨迹应对齐到的索引 */
  syncIndex: Map<number, number> | null;
  alertPointIds: number[];
  measureAnchors: MeasureAnchor[];
  weldGunParams: WeldGunParams | null;
  boxSelectMode: boolean;
  onBoxHits: (hits: AnchorHit[]) => void;
  onPointClick: (pathId: number, index: number, shiftKey: boolean) => void;
}

export function Scene3D(props: Scene3DProps) {
  const {
    paths,
    mainId,
    mainPath,
    currentIndex,
    frac,
    isPlaying,
    mode,
    frameKey,
    viewPreset,
    onPresetHandled,
    orbitTarget,
    autoFit,
    showLine,
    showPoints,
    showGrid,
    pointSize,
    showAxes,
    showAllAxes,
    axesFilter,
    lineColors,
    syncIndex,
    alertPointIds,
    measureAnchors,
    weldGunParams,
    boxSelectMode,
    onBoxHits,
    onPointClick,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const sizeRef = useRef<{ width: number; height: number }>({ width: 1, height: 1 });
  const controlsRef = useRef<OrbitControlsLike | null>(null);
  const [boxRect, setBoxRect] = useState<BoxRect | null>(null);

  // 包围盒基于过滤掉隐藏点之后的点集 → 隐藏点会让包围盒收紧并触发自动重新取景
  const bounds = useMemo(() => {
    const all = paths.flatMap((p) => p.points);
    return computeBounds(all);
  }, [paths]);

  const projectable = useMemo<ProjectablePath[]>(
    () => paths.map((p) => ({ id: p.id, points: p.points })),
    [paths]
  );
  const projectableRef = useRef<ProjectablePath[]>(projectable);
  projectableRef.current = projectable;

  useBoxSelect({
    enabled: boxSelectMode,
    containerRef,
    cameraRef,
    sizeRef,
    pathsRef: projectableRef,
    onRectChange: setBoxRect,
    onHits: onBoxHits,
  });

  /** main 路径的当前点：smooth 模式下在两点之间做位置 lerp + 姿态 slerp */
  const current = useMemo(() => {
    if (!mainPath || mainPath.points.length === 0) return null;
    const pts = mainPath.points;
    const i = Math.min(Math.max(currentIndex, 0), pts.length - 1);
    const cur = pts[i];
    const pos = new THREE.Vector3(cur.x, cur.y, cur.z);
    let quat = quaternionFromPoint(cur, new THREE.Quaternion());

    if (mode === 'smooth' && frac > 0 && i < pts.length - 1) {
      const nxt = pts[i + 1];
      pos.lerp(new THREE.Vector3(nxt.x, nxt.y, nxt.z), frac);
      const q2 = quaternionFromPoint(nxt, new THREE.Quaternion());
      if (quat && q2) {
        quat = quat.clone().slerp(q2, frac);
      }
    }
    return { pos, quat, index: i, point: cur };
  }, [mainPath, currentIndex, frac, mode]);

  const anchorIdsByPath = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const a of measureAnchors) {
      const path = paths.find((p) => p.id === a.pathId);
      const pt = path?.points[a.pointIndex];
      if (!pt) continue;
      const list = map.get(a.pathId) ?? [];
      list.push(pt.id);
      map.set(a.pathId, list);
    }
    return map;
  }, [measureAnchors, paths]);

  const measurePoints = useMemo(() => {
    if (measureAnchors.length !== 2) return null;
    const find = (a: MeasureAnchor) => paths.find((p) => p.id === a.pathId)?.points[a.pointIndex] ?? null;
    const a = find(measureAnchors[0]);
    const b = find(measureAnchors[1]);
    if (!a || !b) return null;
    return {
      a: [a.x, a.y, a.z] as [number, number, number],
      b: [b.x, b.y, b.z] as [number, number, number],
    };
  }, [measureAnchors, paths]);

  const handleControlsReady = useCallback((controls: unknown) => {
    controlsRef.current = controls as OrbitControlsLike;
  }, []);

  return (
    <div className={`scene-container${boxSelectMode ? ' box-select-active' : ''}`} ref={containerRef}>
      <Canvas
        gl={{ logarithmicDepthBuffer: true, antialias: true }}
        camera={{ position: [1, -1, 0.7], up: [0, 0, 1], near: 0.001, far: 1000, fov: 50 }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0b1220']} />
        <hemisphereLight intensity={1.05} groundColor="#1e293b" />
        <directionalLight position={[1, -1, 1]} intensity={1.1} />
        <directionalLight position={[-1, 1, 0.6]} intensity={0.45} />
        <ambientLight intensity={0.35} />

        <SceneBridge cameraRef={cameraRef} sizeRef={sizeRef} />

        <WorkbenchGrid bounds={bounds} visible={showGrid} />

        <Suspense fallback={null}>
          {paths.map((path) => {
            const isMain = path.id === mainId;
            return (
              <group key={path.id}>
                <PathLine
                  points={path.points}
                  color={path.color}
                  visible={showLine}
                  segmentColors={lineColors?.get(path.id) ?? null}
                />
                <PathPoints
                  points={path.points}
                  color={path.color}
                  scaleFactor={bounds.scaleFactor}
                  pointSize={pointSize}
                  visible={showPoints}
                  currentIndex={isMain ? current?.index ?? null : syncIndex?.get(path.id) ?? null}
                  anchorPointIds={anchorIdsByPath.get(path.id) ?? []}
                  alertPointIds={isMain ? alertPointIds : []}
                  onPointClick={(index, shiftKey) => onPointClick(path.id, index, shiftKey)}
                />
              </group>
            );
          })}

          {mainPath && (
            <AllOrientationAxes
              points={mainPath.points}
              scaleFactor={bounds.scaleFactor}
              filter={axesFilter}
              visible={showAllAxes}
            />
          )}

          <CurrentOrientationAxes
            position={current?.pos ?? null}
            quaternion={current?.quat ?? null}
            scaleFactor={bounds.scaleFactor}
            filter={axesFilter}
            visible={showAxes && !showAllAxes}
          />

          {weldGunParams?.visible && current?.quat && current.pos && (
            <group position={current.pos} quaternion={current.quat}>
              <WeldGun params={weldGunParams} />
            </group>
          )}

          {measurePoints && (
            <MeasurementVis
              a={measurePoints.a}
              b={measurePoints.b}
              scaleFactor={bounds.scaleFactor}
            />
          )}
        </Suspense>

        <OrbitControls
          // 框选模式下必须禁用，否则拖拽会同时旋转相机
          enabled={!boxSelectMode}
          ref={handleControlsReady as never}
          enableDamping
          dampingFactor={0.12}
          makeDefault
        />

        <CameraRig
          bounds={bounds}
          frameKey={frameKey}
          preset={viewPreset}
          onPresetHandled={onPresetHandled}
          orbitTarget={orbitTarget}
          currentPointPos={current?.pos ?? null}
          isPlaying={isPlaying}
          controlsRef={controlsRef}
          autoFit={autoFit}
        />
      </Canvas>

      {/* 框选矩形：绝对定位在容器内，所以走的是 DOM 而不是 3D 场景 */}
      {boxRect && (
        <div
          className="box-select-rect"
          style={{
            left: `${boxRect.x0}px`,
            top: `${boxRect.y0}px`,
            width: `${boxRect.x1 - boxRect.x0}px`,
            height: `${boxRect.y1 - boxRect.y0}px`,
          }}
        />
      )}

      {boxSelectMode && (
        <div className="box-mode-hint">
          <Icon name="box" size={14} />
          拖拽框选隐藏点 · Esc 退出
        </div>
      )}
    </div>
  );
}
