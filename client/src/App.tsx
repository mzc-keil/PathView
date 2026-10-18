import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createPath, isCsvFile, reparseCsv, uploadCsv } from './api/paths';
import { usePaths } from './hooks/usePaths';
import { usePlayback } from './hooks/usePlayback';
import { useWeldGun, BUILTIN_PRESETS } from './hooks/useWeldGun';
import { useHotkeys } from './hooks/useHotkeys';
import {
  analyzeAttitude,
  analyzeSlopes,
  analyzeSpacing,
  analyzeStats,
  analysisToCsv,
  diffPaths,
  deviationSegmentColors,
  pathsToCsv,
  slopeSegmentColors,
} from './three/analysis';
import { downloadText, safeFileStem, timestampSuffix } from './utils/file';

import type {
  AnchorHit,
  AxesFilter,
  CsvUploadResult,
  MeasureAnchor,
  OrbitTarget,
  PathPoint,
  RightTab,
  Toast,
  ViewPreset,
} from './types';

import { Scene3D } from './components/Scene3D';
import { PathList } from './components/PathList';
import { PlaybackBar } from './components/PlaybackBar';
import { DisplayControls } from './components/DisplayControls';
import { AnalysisPanel } from './components/AnalysisPanel';
import { DiffPanel } from './components/DiffPanel';
import { StatsPanel } from './components/StatsPanel';
import { WeldGunPanel } from './components/WeldGunPanel';
import { PointDetail } from './components/PointDetail';
import { MeasurementPanel } from './components/MeasurementPanel';
import { ViewTools } from './components/ViewTools';
import { ColumnMapper } from './components/ColumnMapper';
import { PathDataModal } from './components/PathDataModal';
import { HotkeyHelp } from './components/HotkeyHelp';
import { ToastStack } from './components/Toast';
import { Icon } from './components/Icon';

const EMPTY_POINTS: PathPoint[] = [];

const TABS: Array<{ key: RightTab; label: string }> = [
  { key: 'display', label: '显示' },
  { key: 'analysis', label: '分析' },
  { key: 'diff', label: '对比' },
  { key: 'stats', label: '统计' },
  { key: 'gun', label: '焊枪' },
];

/** 字符串 → 数字，非法值返回 null（不再用 parseFloat(x) || 0 把 NaN 和真实 0 混同） */
function toNumberOrNull(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

export default function App() {
  const {
    paths,
    pathDetails,
    selectedIds,
    selectedPaths,
    mainId,
    loading,
    error,
    setError,
    loadPaths,
    selectPath,
    removePath,
    deletePaths,
    changeColor,
    renamePath,
    ensureDetail,
  } = usePaths();

  /* ---------------- 本地 UI 状态 ---------------- */
  const [hiddenPoints, setHiddenPoints] = useState<Map<number, Set<number>>>(new Map());
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [measureAnchors, setMeasureAnchors] = useState<MeasureAnchor[]>([]);

  const [showLine, setShowLine] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showAllAxes, setShowAllAxes] = useState(false);
  const [pointSize, setPointSize] = useState(1);
  const [axesFilter, setAxesFilter] = useState<AxesFilter>({ x: true, y: true, z: true });
  const [syncPlayback, setSyncPlayback] = useState(false);

  const [viewPreset, setViewPreset] = useState<ViewPreset | null>(null);
  const [orbitTarget, setOrbitTarget] = useState<OrbitTarget>('center');
  const [autoFit, setAutoFit] = useState(true);

  const [rightTab, setRightTab] = useState<RightTab>('display');
  const [attitudeThreshold, setAttitudeThreshold] = useState(25);
  const [markAlerts, setMarkAlerts] = useState(true);
  const [slopeColoring, setSlopeColoring] = useState(false);
  const [weldSpeed, setWeldSpeed] = useState(10);

  const [diffA, setDiffA] = useState<number | null>(null);
  const [diffB, setDiffB] = useState<number | null>(null);
  const [diffSamples, setDiffSamples] = useState(200);
  const [diffReverse, setDiffReverse] = useState(false);
  const [diffHeat, setDiffHeat] = useState(false);

  const [query, setQuery] = useState('');
  const [uploadResult, setUploadResult] = useState<CsvUploadResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [dataModalId, setDataModalId] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const weldGun = useWeldGun();

  /* ---------------- toast ---------------- */
  const toastSeq = useRef(0);
  const addToast = useCallback((kind: Toast['kind'], message: string) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((prev) => [...prev.slice(-4), { id, kind, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!error) return;
    addToast('error', error);
    setError(null);
  }, [error, addToast, setError]);

  /* ---------------- 派生：隐藏点过滤 ---------------- */
  // 隐藏点不是「标记」而是直接从 points 里 filter 掉，于是播放范围、包围盒、
  // 测距、相机取景全部自动基于可见点集 —— 这是整个应用最关键的设计
  const visibleSelectedPaths = useMemo(() => {
    if (hiddenPoints.size === 0) return selectedPaths;
    return selectedPaths.map((p) => {
      const hidden = hiddenPoints.get(p.id);
      if (!hidden || hidden.size === 0) return p;
      return { ...p, points: p.points.filter((pt) => !hidden.has(pt.id)) };
    });
  }, [selectedPaths, hiddenPoints]);

  const mainVisiblePath = useMemo(
    () => (mainId == null ? null : visibleSelectedPaths.find((p) => p.id === mainId) ?? null),
    [mainId, visibleSelectedPaths]
  );

  const hiddenCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const [id, set] of hiddenPoints) m.set(id, set.size);
    return m;
  }, [hiddenPoints]);

  const hiddenPointsOfMain = useMemo(
    () => (mainId == null ? undefined : hiddenPoints.get(mainId)),
    [hiddenPoints, mainId]
  );

  /* ---------------- 播放 ---------------- */
  const playback = usePlayback(mainVisiblePath?.points ?? EMPTY_POINTS, mainId);

  const handlePresetHandled = useCallback(() => setViewPreset(null), []);

  /* ---------------- 分析 ---------------- */
  const attitude = useMemo(() => {
    if (!mainVisiblePath || !mainVisiblePath.has_orientation) return null;
    return analyzeAttitude(mainVisiblePath.points, attitudeThreshold);
  }, [mainVisiblePath, attitudeThreshold]);

  const spacing = useMemo(
    () => (mainVisiblePath ? analyzeSpacing(mainVisiblePath.points) : null),
    [mainVisiblePath]
  );

  const slope = useMemo(
    () => (mainVisiblePath ? analyzeSlopes(mainVisiblePath.points) : null),
    [mainVisiblePath]
  );

  const stats = useMemo(
    () => (mainVisiblePath ? analyzeStats(mainVisiblePath.points, weldSpeed) : null),
    [mainVisiblePath, weldSpeed]
  );

  const alertPointIds = useMemo(() => {
    if (!markAlerts || !mainVisiblePath) return [];
    const ids = new Set<number>();
    if (attitude) {
      for (const i of attitude.anomalies) {
        const a = mainVisiblePath.points[i];
        const b = mainVisiblePath.points[i + 1];
        if (a) ids.add(a.id);
        if (b) ids.add(b.id);
      }
    }
    if (spacing) {
      for (const i of spacing.anomalies) {
        const a = mainVisiblePath.points[i];
        const b = mainVisiblePath.points[i + 1];
        if (a) ids.add(a.id);
        if (b) ids.add(b.id);
      }
    }
    return [...ids];
  }, [markAlerts, mainVisiblePath, attitude, spacing]);

  /* ---------------- 测距 ---------------- */
  const measurement = useMemo(() => {
    if (measureAnchors.length !== 2) return null;
    const find = (a: MeasureAnchor) => {
      const path = visibleSelectedPaths.find((p) => p.id === a.pathId);
      if (!path) return null;
      const point = path.points[a.pointIndex] ?? null;
      return point ? { path, point } : null;
    };
    const A = find(measureAnchors[0]);
    const B = find(measureAnchors[1]);
    if (!A || !B) return null;

    const dx = B.point.x - A.point.x;
    const dy = B.point.y - A.point.y;
    const dz = B.point.z - A.point.z;
    return {
      aLabel: `${A.path.name} #${A.point.seq + 1}`,
      bLabel: `${B.path.name} #${B.point.seq + 1}`,
      ax: A.point.x,
      ay: A.point.y,
      az: A.point.z,
      bx: B.point.x,
      by: B.point.y,
      bz: B.point.z,
      dx,
      dy,
      dz,
      distance: Math.hypot(dx, dy, dz),
    };
  }, [measureAnchors, visibleSelectedPaths]);

  /* ---------------- 轨迹对比 ---------------- */
  useEffect(() => {
    if (diffA != null) void ensureDetail(diffA).catch(() => undefined);
    if (diffB != null) void ensureDetail(diffB).catch(() => undefined);
  }, [diffA, diffB, ensureDetail]);

  const diffEnabled = diffA != null && diffB != null && diffA !== diffB;

  const diffReport = useMemo(() => {
    if (!diffEnabled || diffA == null || diffB == null) return null;
    const pa = pathDetails.get(diffA);
    const pb = pathDetails.get(diffB);
    if (!pa || !pb) return null;
    return diffPaths(pa.points, pb.points, diffSamples, diffReverse);
  }, [diffEnabled, diffA, diffB, pathDetails, diffSamples, diffReverse]);

  /* ---------------- 轨迹线着色 ---------------- */
  const lineColors = useMemo(() => {
    if (diffHeat && diffReport && diffA != null && diffB != null) {
      const map = new Map<number, string[] | null>();
      const pa = pathDetails.get(diffA);
      const pb = pathDetails.get(diffB);
      if (pa) map.set(pa.id, deviationSegmentColors(pa.points, diffReport, false));
      if (pb) map.set(pb.id, deviationSegmentColors(pb.points, diffReport, diffReverse));
      return map;
    }
    if (slopeColoring && mainVisiblePath && slope) {
      return new Map<number, string[] | null>([[mainVisiblePath.id, slopeSegmentColors(slope)]]);
    }
    return null;
  }, [diffHeat, diffReport, diffA, diffB, pathDetails, diffReverse, slopeColoring, mainVisiblePath, slope]);

  /* ---------------- 同步回放：非主轨迹按归一化进度取索引 ---------------- */
  const syncIndexByPath = useMemo(() => {
    if (!syncPlayback) return null;
    const map = new Map<number, number>();
    for (const p of visibleSelectedPaths) {
      if (p.id === mainId) continue;
      const n = p.points.length;
      map.set(p.id, n <= 1 ? 0 : Math.round(playback.progress * (n - 1)));
    }
    return map;
  }, [syncPlayback, visibleSelectedPaths, mainId, playback.progress]);

  /* ---------------- 主轨迹当前点的分析读数 ---------------- */
  const currentPoint = useMemo(() => {
    const pts = mainVisiblePath?.points;
    if (!pts || pts.length === 0) return null;
    const i = Math.min(playback.currentIndex, pts.length - 1);
    return {
      index: i,
      point: pts[i],
      spacing: i > 0 ? spacing?.distances[i - 1] ?? null : null,
      attitudeJump: i > 0 && attitude ? attitude.jumps[i - 1] ?? null : null,
      slope: i > 0 ? slope?.classes[i - 1] ?? null : null,
      isAlert: alertPointIds.includes(pts[i].id),
    };
  }, [mainVisiblePath, playback.currentIndex, spacing, attitude, slope, alertPointIds]);

  /* ---------------- 跳转到指定点 ---------------- */
  const pendingJump = useRef<{ pathId: number; index: number } | null>(null);

  const seekIndex = useCallback(
    (index: number) => {
      const n = mainVisiblePath?.points.length ?? 0;
      if (n <= 1) return;
      playback.seekProgress(Math.min(Math.max(index, 0), n - 1) / (n - 1));
    },
    [mainVisiblePath, playback]
  );

  useEffect(() => {
    const pending = pendingJump.current;
    if (!pending || pending.pathId !== mainId) return;
    pendingJump.current = null;
    // 等这一帧渲染完再定位，确保 playback 已经拿到新主轨迹的点集
    const t = window.setTimeout(() => seekIndex(pending.index), 0);
    return () => window.clearTimeout(t);
  }, [mainId, seekIndex]);

  /* ---------------- 隐藏点操作 ---------------- */
  const handleBoxHits = useCallback(
    (hits: AnchorHit[]) => {
      setHiddenPoints((prev) => {
        const next = new Map(prev);
        for (const h of hits) {
          const set = new Set(next.get(h.pathId) ?? []);
          set.add(h.pointId);
          next.set(h.pathId, set);
        }
        return next;
      });
      addToast('info', `已隐藏 ${hits.length} 个点`);
    },
    [addToast]
  );

  const togglePointHidden = useCallback((pathId: number, pointId: number) => {
    setHiddenPoints((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(pathId) ?? []);
      if (set.has(pointId)) set.delete(pointId);
      else set.add(pointId);
      if (set.size === 0) next.delete(pathId);
      else next.set(pathId, set);
      return next;
    });
  }, []);

  const clearHidden = useCallback(() => {
    setHiddenPoints((prev) => {
      if (prev.size === 0) return prev;
      addToast('info', '已恢复全部隐藏点');
      return new Map();
    });
    setMeasureAnchors([]);
  }, [addToast]);

  /* ---------------- 三维点点击 ---------------- */
  const handleScenePointClick = useCallback(
    (pathId: number, index: number, additive: boolean) => {
      if (boxSelectMode) return;

      if (additive) {
        setMeasureAnchors((prev) => {
          if (prev.length === 2) return [{ pathId, pointIndex: index }];
          if (prev.length === 1 && prev[0].pathId === pathId && prev[0].pointIndex === index) return prev;
          return [...prev, { pathId, pointIndex: index }];
        });
        return;
      }

      if (pathId === mainId) {
        seekIndex(index);
        return;
      }
      // 点击非主轨迹上的点：把它切成主轨迹再定位过去
      pendingJump.current = { pathId, index };
      void selectPath(pathId, false);
    },
    [boxSelectMode, mainId, seekIndex, selectPath]
  );

  /* ---------------- CSV 导入 ---------------- */
  const handleImportFile = useCallback(
    async (file: File) => {
      setImportBusy(true);
      try {
        const result = await uploadCsv(file);
        setUploadResult(result);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'CSV 上传失败');
      } finally {
        setImportBusy(false);
      }
    },
    [addToast]
  );

  const handleHeaderRowChange = useCallback(
    async (headerRow: number) => {
      if (!uploadResult) return;
      setImportBusy(true);
      try {
        const next = await reparseCsv(uploadResult.fileId, headerRow);
        setUploadResult(next);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : '重新解析失败');
      } finally {
        setImportBusy(false);
      }
    },
    [uploadResult, addToast]
  );

  const handleMappingConfirm = useCallback(
    async (mapping: Record<string, string>, rows: Record<string, string>[]) => {
      if (!uploadResult) return;
      setImportBusy(true);
      try {
        const mapped = new Set(Object.values(mapping).filter(Boolean));
        const extraColumns = uploadResult.columns.filter((c) => !mapped.has(c));
        let invalidCoords = 0;

        const points = rows.map((row) => {
          // 用 mapping 的列名取值；服务端已经按当前表头行解析过 rows，键就是原始列名
          const x = toNumberOrNull(row[mapping.x]);
          const y = toNumberOrNull(row[mapping.y]);
          const z = toNumberOrNull(row[mapping.z]);
          if (x === null || y === null || z === null) invalidCoords += 1;

          const pt: Record<string, unknown> = { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
          for (const k of ['rx', 'ry', 'rz'] as const) {
            const col = mapping[k];
            if (!col) continue;
            const v = toNumberOrNull(row[col]);
            if (v !== null) pt[k] = v;
          }

          // 原实现的缺陷：extra 在这里被丢掉。这里把未映射列收进 extra，
          // 后端与数据表本来就支持，补上之后轨迹能带上电流/电压等工艺参数
          const extra: Record<string, string> = {};
          for (const c of extraColumns) {
            const v = row[c];
            if (v != null && v !== '') extra[c] = v;
          }
          if (Object.keys(extra).length > 0) pt.extra = extra;

          return pt;
        });

        if (points.length === 0) {
          addToast('warn', '没有可导入的数据行');
          return;
        }

        const { id, warnings } = await createPath({
          name: uploadResult.fileName,
          source_file: uploadResult.fileName,
          points,
        });

        setUploadResult(null);
        await loadPaths();
        await selectPath(id, false);

        addToast('success', `已导入 ${points.length} 个点`);
        if (invalidCoords > 0) addToast('warn', `${invalidCoords} 行的坐标无法解析，已按 0 处理`);
        if (warnings.length > 0) addToast('warn', warnings[0]);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : '导入失败');
      } finally {
        setImportBusy(false);
      }
    },
    [uploadResult, addToast, loadPaths, selectPath]
  );

  /* ---------------- 拖拽导入 ---------------- */
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const csv = files.find((f) => isCsvFile(f));
      if (csv) void handleImportFile(csv);
      else if (files.length > 0) addToast('warn', '只支持 .csv 文件');
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleImportFile, addToast]);

  /* ---------------- 导出 ---------------- */
  const exportCleanCsv = useCallback(() => {
    if (visibleSelectedPaths.length === 0) {
      addToast('warn', '没有可导出的选中轨迹');
      return;
    }
    const csv = pathsToCsv(visibleSelectedPaths.map((p) => ({ name: p.name, points: p.points })));
    const stem = visibleSelectedPaths.length === 1 ? safeFileStem(visibleSelectedPaths[0].name) : 'paths';
    downloadText(csv, `${stem}_clean_${timestampSuffix()}.csv`);
    addToast('success', '已导出清洗后的轨迹');
  }, [visibleSelectedPaths, addToast]);

  const exportAnalysisReport = useCallback(() => {
    if (!mainVisiblePath || !attitude || !spacing || !slope) {
      addToast('warn', '当前轨迹缺少可分析的数据');
      return;
    }
    const csv = analysisToCsv(mainVisiblePath.name, mainVisiblePath.points, attitude, spacing, slope);
    downloadText(csv, `${safeFileStem(mainVisiblePath.name)}_analysis_${timestampSuffix()}.csv`);
    addToast('success', '已导出分析报告');
  }, [mainVisiblePath, attitude, spacing, slope, addToast]);

  const exportDiffCsv = useCallback(() => {
    if (!diffReport || diffA == null || diffB == null) return;
    const nameA = paths.find((p) => p.id === diffA)?.name ?? `path_${diffA}`;
    const nameB = paths.find((p) => p.id === diffB)?.name ?? `path_${diffB}`;
    const lines = [
      `# 轨迹对比  A=${nameA}  B=${nameB}${diffReverse ? '  (B 已反向对齐)' : ''}`,
      `# 采样点,${diffReport.points.length}`,
      `# 最大偏差,${diffReport.max.toFixed(6)}`,
      `# 平均偏差,${diffReport.mean.toFixed(6)}`,
      `# RMS,${diffReport.rms.toFixed(6)}`,
      '',
      't,ax,ay,az,bx,by,bz,deviation',
      ...diffReport.points.map(
        (p) =>
          `${p.t.toFixed(6)},${p.a[0].toFixed(6)},${p.a[1].toFixed(6)},${p.a[2].toFixed(6)},${p.b[0].toFixed(6)},${p.b[1].toFixed(6)},${p.b[2].toFixed(6)},${p.deviation.toFixed(6)}`
      ),
    ];
    downloadText(`\uFEFF${lines.join('\r\n')}\r\n`, `diff_${safeFileStem(nameA)}_vs_${safeFileStem(nameB)}.csv`);
    addToast('success', '已导出偏差数据');
  }, [diffReport, diffA, diffB, paths, diffReverse, addToast]);

  /* ---------------- 快捷键 ---------------- */
  const closeOverlays = useCallback(() => {
    setHelpOpen(false);
    setUploadResult(null);
    setDataModalId(null);
    setBoxSelectMode(false);
    setMeasureAnchors([]);
  }, []);

  useHotkeys({
    togglePlay: playback.toggle,
    step: playback.stepBy,
    goToStart: playback.goToStart,
    goToEnd: playback.goToEnd,
    setSpeed: playback.setSpeed,
    viewPreset: setViewPreset,
    toggleBoxSelect: () => setBoxSelectMode((v) => !v),
    escape: closeOverlays,
    toggleLine: () => setShowLine((v) => !v),
    togglePoints: () => setShowPoints((v) => !v),
    toggleGun: weldGun.toggleVisible,
    toggleAxes: () => setShowAxes((v) => !v),
    toggleAllAxes: () => setShowAllAxes((v) => !v),
    clearHidden,
    toggleHelp: () => setHelpOpen((v) => !v),
  });

  /* ---------------- 渲染 ---------------- */
  const dataModalPath = dataModalId == null ? null : pathDetails.get(dataModalId) ?? null;
  const gunDisabled = !(currentPoint && currentPoint.point && currentPoint.point.rx != null);

  return (
    <div className={`app${dragOver ? ' drag-over' : ''}`}>
      <PathList
        paths={paths}
        selectedIds={selectedIds}
        mainId={mainId}
        hiddenCounts={hiddenCounts}
        query={query}
        loading={loading}
        onQuery={setQuery}
        onSelect={(id, additive) => void selectPath(id, additive)}
        onDelete={(id) => void removePath(id)}
        onDeleteMany={(ids) => void deletePaths(ids)}
        onChangeColor={(id, color) => void changeColor(id, color)}
        onRename={(id, name) => void renamePath(id, name)}
        onImportClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.csv,text/csv';
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) void handleImportFile(file);
            // 用完重置，否则同一个文件再选一次不会触发 change
            input.value = '';
          };
          input.click();
        }}
        onOpenData={setDataModalId}
        onClearSelection={() => {
          if (mainId != null) void selectPath(mainId, false);
        }}
      />

      <main className="app-main">
        <Scene3D
          paths={visibleSelectedPaths}
          mainId={mainId}
          mainPath={mainVisiblePath}
          currentIndex={playback.currentIndex}
          frac={playback.frac}
          isPlaying={playback.isPlaying}
          mode={playback.mode}
          frameKey={String(mainId ?? 'none')}
          viewPreset={viewPreset}
          onPresetHandled={handlePresetHandled}
          orbitTarget={orbitTarget}
          autoFit={autoFit}
          showLine={showLine}
          showPoints={showPoints}
          showGrid={showGrid}
          pointSize={pointSize}
          showAxes={showAxes}
          showAllAxes={showAllAxes}
          axesFilter={axesFilter}
          lineColors={lineColors}
          syncIndex={syncIndexByPath}
          alertPointIds={alertPointIds}
          measureAnchors={measureAnchors}
          weldGunParams={weldGun.params.visible ? weldGun.params : null}
          boxSelectMode={boxSelectMode}
          onBoxHits={handleBoxHits}
          onPointClick={handleScenePointClick}
        />

        <ViewTools
          active={viewPreset}
          onSelect={setViewPreset}
          autoFit={autoFit}
          onToggleAutoFit={setAutoFit}
          orbitTarget={orbitTarget}
          onToggleOrbitTarget={setOrbitTarget}
        />

        <button
          type="button"
          className="help-fab"
          onClick={() => setHelpOpen(true)}
          title="键盘快捷键 (?)"
        >
          <Icon name="help" size={16} />
        </button>
      </main>

      <aside className="app-rightbar">
        <PointDetail
          pathName={mainVisiblePath?.name ?? null}
          pathColor={mainVisiblePath?.color ?? null}
          point={currentPoint?.point ?? null}
          index={currentPoint?.index ?? 0}
          total={mainVisiblePath?.points.length ?? 0}
          hasOrientation={!!mainVisiblePath?.has_orientation}
          spacing={currentPoint?.spacing ?? null}
          attitudeJump={currentPoint?.attitudeJump ?? null}
          slope={currentPoint?.slope ?? null}
          isAlert={currentPoint?.isAlert ?? false}
          onFocus={() => setOrbitTarget('current')}
        />

        {measureAnchors.length > 0 && (
          <MeasurementPanel
            result={measurement}
            anchorCount={measureAnchors.length}
            onSwap={() => setMeasureAnchors((prev) => (prev.length === 2 ? [prev[1], prev[0]] : prev))}
            onClear={() => setMeasureAnchors([])}
          />
        )}

        <div className="tab-bar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab-item${rightTab === t.key ? ' is-active' : ''}`}
              onClick={() => setRightTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="right-panel-scroll">
          {rightTab === 'display' && (
            <DisplayControls
              showLine={showLine}
              showPoints={showPoints}
              showGrid={showGrid}
              showAxes={showAxes}
              showAllAxes={showAllAxes}
              axesFilter={axesFilter}
              pointSize={pointSize}
              syncPlayback={syncPlayback}
              boxSelectMode={boxSelectMode}
              hiddenCount={hiddenPointsOfMain?.size ?? 0}
              onShowLine={setShowLine}
              onShowPoints={setShowPoints}
              onShowGrid={setShowGrid}
              onShowAxes={setShowAxes}
              onShowAllAxes={setShowAllAxes}
              onAxesFilter={setAxesFilter}
              onPointSize={setPointSize}
              onSyncPlayback={setSyncPlayback}
              onToggleBoxSelect={() => setBoxSelectMode((v) => !v)}
              onClearHidden={clearHidden}
            />
          )}

          {rightTab === 'analysis' && (
            <AnalysisPanel
              path={mainVisiblePath}
              attitude={attitude}
              attitudeThreshold={attitudeThreshold}
              onAttitudeThreshold={setAttitudeThreshold}
              spacing={spacing}
              slope={slope}
              markAlerts={markAlerts}
              onMarkAlerts={setMarkAlerts}
              slopeColoring={slopeColoring}
              onSlopeColoring={setSlopeColoring}
              onJumpTo={seekIndex}
              onExportReport={exportAnalysisReport}
            />
          )}

          {rightTab === 'diff' && (
            <DiffPanel
              paths={paths}
              aId={diffA}
              bId={diffB}
              sampleCount={diffSamples}
              reverseB={diffReverse}
              showHeat={diffHeat}
              report={diffReport}
              disabled={!diffEnabled}
              onA={setDiffA}
              onB={setDiffB}
              onSampleCount={setDiffSamples}
              onReverseB={setDiffReverse}
              onShowHeat={setDiffHeat}
              onExport={exportDiffCsv}
            />
          )}

          {rightTab === 'stats' && (
            <StatsPanel
              path={mainVisiblePath}
              stats={stats}
              visibleCount={mainVisiblePath?.points.length ?? 0}
              hiddenCount={hiddenPointsOfMain?.size ?? 0}
              weldSpeed={weldSpeed}
              onWeldSpeed={setWeldSpeed}
              onJumpTo={seekIndex}
              onExportCleanCsv={exportCleanCsv}
              onExportReport={exportAnalysisReport}
            />
          )}

          {rightTab === 'gun' && (
            <WeldGunPanel
              params={weldGun.params}
              presets={weldGun.presets}
              builtinPresets={BUILTIN_PRESETS}
              selectedPresetId={weldGun.selectedPresetId}
              disabled={gunDisabled}
              onPatch={weldGun.patchParams}
              onReset={weldGun.resetParams}
              onSaveAsPreset={weldGun.saveAsPreset}
              onUpdateSelected={weldGun.updateSelectedPreset}
              onApplyPreset={weldGun.applyPreset}
              onDeletePreset={weldGun.deletePreset}
            />
          )}
        </div>
      </aside>

      <PlaybackBar
        isPlaying={playback.isPlaying}
        progress={playback.progress}
        currentIndex={playback.currentIndex}
        total={playback.total}
        speed={playback.speed}
        mode={playback.mode}
        disabled={playback.total === 0}
        onToggle={playback.toggle}
        onStepBy={playback.stepBy}
        onGoToStart={playback.goToStart}
        onGoToEnd={playback.goToEnd}
        onSeek={playback.seekProgress}
        onSpeedChange={playback.setSpeed}
        onModeChange={playback.setMode}
      />

      {uploadResult && (
        <ColumnMapper
          result={uploadResult}
          busy={importBusy}
          onHeaderRowChange={(row) => void handleHeaderRowChange(row)}
          onConfirm={(mapping, rows) =>
            void handleMappingConfirm(mapping as unknown as Record<string, string>, rows)
          }
          onCancel={() => setUploadResult(null)}
        />
      )}

      {dataModalPath && (
        <PathDataModal
          path={dataModalPath}
          hiddenIds={hiddenPoints.get(dataModalPath.id) ?? new Set()}
          alertPointIds={dataModalPath.id === mainId ? alertPointIds : []}
          attitude={dataModalPath.id === mainId ? attitude : null}
          spacing={dataModalPath.id === mainId ? spacing : null}
          onToggleHidden={(pointId) => togglePointHidden(dataModalPath.id, pointId)}
          onClearHidden={() => {
            setHiddenPoints((prev) => {
              const next = new Map(prev);
              next.delete(dataModalPath.id);
              return next;
            });
          }}
          onJumpTo={(index) => {
            if (dataModalPath.id === mainId) {
              seekIndex(index);
            } else {
              pendingJump.current = { pathId: dataModalPath.id, index };
              void selectPath(dataModalPath.id, false);
            }
          }}
          onClose={() => setDataModalId(null)}
        />
      )}

      {helpOpen && <HotkeyHelp onClose={() => setHelpOpen(false)} />}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {syncPlayback && syncIndexByPath && (
        <div className="sync-indicator" title="所有选中轨迹正按同一归一化进度同步回放">
          <Icon name="layers" size={13} />
          同步回放 {syncIndexByPath.size + 1} 条
        </div>
      )}
    </div>
  );
}
