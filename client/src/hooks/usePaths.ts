import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  changeColor as apiChangeColor,
  deletePath as apiDeletePath,
  getPath,
  listPaths,
  renamePath as apiRenamePath,
} from '../api/paths';
import type { Path, PathWithPoints } from '../types';

/**
 * 轨迹列表 + 详情缓存的唯一数据源。
 *
 * 设计要点：
 *  - 详情懒加载并缓存在 pathDetails: Map，避免列表接口把几百条轨迹的点全传回来
 *  - mainId 永远是「最后点选的那条」，多选对比时它扮演主角（谁播放 / 谁挂焊枪 / 谁显示读数）
 *  - 删除用 allSettled，部分失败也更新已成功的，保持前后端一致
 */
export function usePaths() {
  const [paths, setPaths] = useState<Path[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pathDetails, setPathDetails] = useState<Map<number, PathWithPoints>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 用 ref 镜像最新值，避免 useCallback 依赖抖动导致子组件反复重渲染
  const pathsRef = useRef(paths);
  const selectedIdsRef = useRef(selectedIds);
  const detailsRef = useRef(pathDetails);
  const inflightRef = useRef(new Map<number, Promise<PathWithPoints>>());

  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  useEffect(() => {
    detailsRef.current = pathDetails;
  }, [pathDetails]);

  const fetchDetail = useCallback((id: number, force = false): Promise<PathWithPoints> => {
    if (!force && detailsRef.current.has(id)) {
      return Promise.resolve(detailsRef.current.get(id) as PathWithPoints);
    }
    const existing = inflightRef.current.get(id);
    if (existing) return existing;

    const promise = getPath(id)
      .then((detail) => {
        setPathDetails((prev) => new Map(prev).set(id, detail));
        return detail;
      })
      .finally(() => {
        inflightRef.current.delete(id);
      });

    inflightRef.current.set(id, promise);
    return promise;
  }, []);

  const loadPaths = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listPaths();
      setPaths(list);

      // 清掉已不存在轨迹的详情缓存，防止 hiddenPoints / pathDetails 泄漏
      const alive = new Set(list.map((p) => p.id));
      setPathDetails((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const id of next.keys()) {
          if (!alive.has(id)) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      const kept = selectedIdsRef.current.filter((id) => alive.has(id));
      if (kept.length === 0) {
        const first = list.length > 0 ? [list[0].id] : [];
        setSelectedIds(first);
        if (first.length > 0) await fetchDetail(first[0]);
      } else if (kept.length !== selectedIdsRef.current.length) {
        setSelectedIds(kept);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载轨迹列表失败');
    } finally {
      setLoading(false);
    }
  }, [fetchDetail]);

  useEffect(() => {
    void loadPaths();
  }, [loadPaths]);

  const selectPath = useCallback(
    async (id: number, additive = false) => {
      const prev = selectedIdsRef.current;
      let nextIds: number[];
      if (additive) {
        nextIds = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        // 不允许把选中集清空，否则「主轨迹」概念失效
        if (nextIds.length === 0) return;
      } else {
        nextIds = [id];
      }
      setSelectedIds(nextIds);
      try {
        await Promise.all(nextIds.filter((x) => !detailsRef.current.has(x)).map((x) => fetchDetail(x)));
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载轨迹详情失败');
      }
    },
    [fetchDetail]
  );

  const changeColor = useCallback(async (id: number, color: string) => {
    const before = pathsRef.current;
    setPaths((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)));
    setPathDetails((prev) => {
      const hit = prev.get(id);
      if (!hit) return prev;
      return new Map(prev).set(id, { ...hit, color });
    });
    try {
      await apiChangeColor(id, color);
    } catch (err) {
      setPaths(before);
      setError(err instanceof Error ? err.message : '改色失败');
    }
  }, []);

  const renamePath = useCallback(async (id: number, name: string) => {
    const before = pathsRef.current;
    setPaths((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    setPathDetails((prev) => {
      const hit = prev.get(id);
      if (!hit) return prev;
      return new Map(prev).set(id, { ...hit, name });
    });
    try {
      await apiRenamePath(id, name);
    } catch (err) {
      setPaths(before);
      setError(err instanceof Error ? err.message : '改名失败');
    }
  }, []);

  const deletePaths = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => apiDeletePath(id)));
    const deletedIds = ids.filter((_, i) => results[i].status === 'fulfilled');

    if (deletedIds.length === 0) {
      setError('删除失败');
      return;
    }

    const dead = new Set(deletedIds);
    const remaining = pathsRef.current.filter((p) => !dead.has(p.id));
    setPaths(remaining);
    setPathDetails((prev) => {
      const next = new Map(prev);
      for (const id of deletedIds) next.delete(id);
      return next;
    });

    // 删除后选中集可能空了，自动接管到剩下的第一条，避免界面进入无主轨迹状态
    const nextSelected = selectedIdsRef.current.filter((id) => !dead.has(id));
    const finalSelected = nextSelected.length > 0 ? nextSelected : remaining.length > 0 ? [remaining[0].id] : [];
    setSelectedIds(finalSelected);
    if (nextSelected.length === 0 && finalSelected.length > 0) {
      try {
        await fetchDetail(finalSelected[0]);
      } catch {
        /* 详情加载失败不影响删除结果 */
      }
    }

    if (deletedIds.length < ids.length) setError('部分轨迹删除失败');
  }, [fetchDetail]);

  /** 重新拉取指定轨迹的点位（例如导入后需要强刷） */
  const refreshDetail = useCallback(
    async (id: number) => {
      try {
        await fetchDetail(id, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : '刷新轨迹详情失败');
      }
    },
    [fetchDetail]
  );

  const mainId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;

  const selectedPaths = useMemo(() => {
    const out: PathWithPoints[] = [];
    for (const id of selectedIds) {
      const detail = pathDetails.get(id);
      if (detail) out.push(detail);
    }
    return out;
  }, [selectedIds, pathDetails]);

  const mainPath = useMemo(
    () => (mainId == null ? null : selectedPaths.find((p) => p.id === mainId) ?? null),
    [mainId, selectedPaths]
  );

  return {
    paths,
    pathDetails,
    selectedIds,
    selectedPaths,
    mainId,
    mainPath,
    loading,
    error,
    setError,
    loadPaths,
    selectPath,
    removePath: (id: number) => deletePaths([id]),
    deletePaths,
    changeColor,
    renamePath,
    refreshDetail,
    /** 确保某条轨迹的点位已加载（用于轨迹对比里选中的两条） */
    ensureDetail: fetchDetail,
  };
}

export type UsePathsReturn = ReturnType<typeof usePaths>;
