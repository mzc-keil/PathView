import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AnchorHit, BoxRect, PathPoint } from '../types';

/** 框选判定阈值：宽高都超过 3px 才算框选，否则视为误触点击 */
const MIN_DRAG_PX = 3;

export interface ProjectablePath {
  id: number;
  points: PathPoint[];
}

/**
 * 屏幕投影命中检测：把每个点投影到 NDC，再换算回屏幕像素与选框求交。
 *
 * NDC → 像素的换算（最容易写错的地方）：
 *   sx = ( v.x * 0.5 + 0.5) * width
 *   sy = (-v.y * 0.5 + 0.5) * height     ← Y 必须取反，屏幕 Y 向下
 */
export function projectRectHits(
  camera: THREE.Camera,
  width: number,
  height: number,
  paths: ProjectablePath[],
  rect: BoxRect
): AnchorHit[] {
  const v = new THREE.Vector3();
  const hits: AnchorHit[] = [];

  for (const path of paths) {
    for (const pt of path.points) {
      v.set(pt.x, pt.y, pt.z).project(camera);
      // 相机背后的点投影会翻转，必须排除
      if (v.z < -1 || v.z > 1) continue;

      const sx = (v.x * 0.5 + 0.5) * width;
      const sy = (-v.y * 0.5 + 0.5) * height;

      if (sx >= rect.x0 && sx <= rect.x1 && sy >= rect.y0 && sy <= rect.y1) {
        hits.push({ pathId: path.id, pointId: pt.id });
      }
    }
  }

  return hits;
}

export interface BoxSelectOptions {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  cameraRef: React.RefObject<THREE.Camera | null>;
  sizeRef: React.RefObject<{ width: number; height: number }>;
  pathsRef: React.RefObject<ProjectablePath[]>;
  onRectChange: (rect: BoxRect | null) => void;
  onHits: (hits: AnchorHit[]) => void;
}

/**
 * 框选交互。监听的是原生 canvas DOM 指针事件而不是 r3f 事件系统 ——
 * 因为需要屏幕坐标来画那个矩形，r3f 的事件对象里没有可用的屏幕空间信息。
 */
export function useBoxSelect(options: BoxSelectOptions): void {
  const { enabled, containerRef } = options;
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef(options);
  // 每次渲染同步最新值，避免把回调全部塞进 effect 依赖导致反复解绑重绑
  latest.current = options;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    if (!enabled) {
      dragStart.current = null;
      latest.current.onRectChange(null);
      return undefined;
    }

    const getPos = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // 只响应左键，右键留给 OrbitControls 的平移
      const p = getPos(e);
      dragStart.current = p;
      latest.current.onRectChange({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      // 关键：捕获指针，否则拖出 canvas 边界后事件就丢了，选框会中断
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 某些环境不支持，退化也能用 */
      }
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      const s = dragStart.current;
      if (!s) return;
      const p = getPos(e);
      latest.current.onRectChange({
        x0: Math.min(s.x, p.x),
        y0: Math.min(s.y, p.y),
        x1: Math.max(s.x, p.x),
        y1: Math.max(s.y, p.y),
      });
    };

    const onUp = (e: PointerEvent) => {
      const s = dragStart.current;
      dragStart.current = null;
      latest.current.onRectChange(null);
      if (!s) return;

      const p = getPos(e);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      // 过滤误触：拖拽距离太短当作点击
      if (Math.abs(p.x - s.x) <= MIN_DRAG_PX || Math.abs(p.y - s.y) <= MIN_DRAG_PX) return;

      const camera = latest.current.cameraRef.current;
      const size = latest.current.sizeRef.current;
      if (!camera || !size) return;

      const rect: BoxRect = {
        x0: Math.min(s.x, p.x),
        y0: Math.min(s.y, p.y),
        x1: Math.max(s.x, p.x),
        y1: Math.max(s.y, p.y),
      };

      const hits = projectRectHits(camera, size.width, size.height, latest.current.pathsRef.current ?? [], rect);
      if (hits.length > 0) latest.current.onHits(hits);
    };

    const onCancel = () => {
      dragStart.current = null;
      latest.current.onRectChange(null);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [enabled, containerRef]);
}
