import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PathPoint, PlaybackMode } from '../types';

export const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

const BASE_HZ = 10;
/** smooth 模式下每个点区间拆成几个子步（保持总速度与 point 模式一致，但位移连续） */
const SMOOTH_SUBSTEPS = 4;

export interface PlaybackApi {
  isPlaying: boolean;
  mode: PlaybackMode;
  speed: number;
  /** 浮点索引位置，0..points.length-1 */
  t: number;
  /** 当前整点索引 */
  currentIndex: number;
  /** 当前区间内的插值比例 0..1（smooth 模式才有意义） */
  frac: number;
  /** 归一化进度 0..1 */
  progress: number;
  total: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
  reset: () => void;
  goToStart: () => void;
  goToEnd: () => void;
  stepBy: (delta: number) => void;
  seekProgress: (p: number) => void;
  setSpeed: (s: number) => void;
  setMode: (m: PlaybackMode) => void;
}

/**
 * 播放状态机：索引步进 + 相机跟随，不是 3D 动画。
 *
 * 相比原实现补上了 smooth 模式的真实插值 —— 原版 UI 给了这个选项但底层和 point 模式
 * 完全一样（没有插值）。这里把位置 t 变成浮点数，smooth 模式按 4 个子步推进同一段，
 * 于是总通过速度不变、但位移连续，配合下游的 lerp/slerp 才有意义。
 */
export function usePlayback(points: PathPoint[], mainId: number | null): PlaybackApi {
  const total = points.length;
  const max = Math.max(total - 1, 0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<PlaybackMode>('point');
  const [speed, setSpeed] = useState(1);
  const [t, setT] = useState(0);

  // 切主轨迹时自动停止并归零
  const lastMainId = useRef<number | null>(mainId);
  useEffect(() => {
    if (lastMainId.current !== mainId) {
      lastMainId.current = mainId;
      setIsPlaying(false);
      setT(0);
    }
  }, [mainId]);

  // 点数变少时要夹住当前位置
  useEffect(() => {
    setT((prev) => (prev > max ? max : prev));
  }, [max]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    if (max <= 0) {
      setIsPlaying(false);
      return undefined;
    }

    const smooth = mode === 'smooth';
    const stepPerTick = smooth ? 1 / SMOOTH_SUBSTEPS : 1;
    const interval = 1000 / (BASE_HZ * speed) / (smooth ? SMOOTH_SUBSTEPS : 1);

    const id = window.setInterval(() => {
      setT((prev) => {
        const next = prev + stepPerTick;
        if (next >= max) {
          return mode === 'loop' ? next % max : max;
        }
        return next;
      });
    }, interval);

    return () => window.clearInterval(id);
  }, [isPlaying, mode, speed, max]);

  // 非循环模式走到末尾就停
  useEffect(() => {
    if (isPlaying && mode !== 'loop' && max > 0 && t >= max) setIsPlaying(false);
  }, [isPlaying, mode, t, max]);

  const currentIndex = useMemo(() => {
    if (total === 0) return 0;
    const idx = Math.floor(t);
    return Math.min(Math.max(idx, 0), max);
  }, [t, total, max]);

  const frac = useMemo(() => {
    if (total <= 1) return 0;
    const f = t - currentIndex;
    return f < 0 ? 0 : f > 1 ? 1 : f;
  }, [t, currentIndex, total]);

  const progress = useMemo(() => (max > 0 ? Math.min(t / max, 1) : 0), [t, max]);

  const play = useCallback(() => {
    setIsPlaying(() => {
      setT((prev) => {
        if (prev >= max && max > 0) return 0;
        return prev;
      });
      return true;
    });
  }, [max]);

  const pause = useCallback(() => setIsPlaying(false), []);
  const toggle = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev) {
        setT((cur) => (cur >= max && max > 0 ? 0 : cur));
      }
      return !prev;
    });
  }, [max]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    setT(0);
  }, []);

  const reset = stop;
  const goToStart = useCallback(() => {
    setIsPlaying(false);
    setT(0);
  }, []);
  const goToEnd = useCallback(() => {
    setIsPlaying(false);
    setT(max);
  }, [max]);

  const stepBy = useCallback(
    (delta: number) => {
      setIsPlaying(false);
      setT((prev) => {
        const base = Math.round(prev);
        const next = base + delta;
        if (next < 0) return 0;
        if (next > max) return max;
        return next;
      });
    },
    [max]
  );

  const seekProgress = useCallback(
    (p: number) => {
      const clamped = Math.min(Math.max(p, 0), 1);
      setT(clamped * max);
    },
    [max]
  );

  return {
    isPlaying,
    mode,
    speed,
    t,
    currentIndex,
    frac,
    progress,
    total,
    play,
    pause,
    toggle,
    stop,
    reset,
    goToStart,
    goToEnd,
    stepBy,
    seekProgress,
    setSpeed,
    setMode,
  };
}

export type UsePlaybackReturn = ReturnType<typeof usePlayback>;
