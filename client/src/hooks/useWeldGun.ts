import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_WELD_GUN_PARAMS,
  WELD_GUN_PRESET_STORAGE_KEY,
  WELD_GUN_STORAGE_KEY,
  type WeldGunParams,
  type WeldGunPreset,
} from '../types/weldGun';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadParams(): WeldGunParams {
  try {
    const raw = localStorage.getItem(WELD_GUN_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WELD_GUN_PARAMS };
    return { ...DEFAULT_WELD_GUN_PARAMS, ...(JSON.parse(raw) as Partial<WeldGunParams>) };
  } catch {
    return { ...DEFAULT_WELD_GUN_PARAMS };
  }
}

function loadPresets(): WeldGunPreset[] {
  try {
    const raw = localStorage.getItem(WELD_GUN_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WeldGunPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 内置预设模板：常见焊枪形态，方便快速起步（不写入 localStorage） */
export const BUILTIN_PRESETS: WeldGunPreset[] = [
  {
    id: 'builtin-500a',
    name: '标准 500A 水冷',
    params: { ...DEFAULT_WELD_GUN_PARAMS, nozzleLength: 6, nozzleRadius: 0.6, neckLength: 18, neckRadius: 1.8, bodyLength: 22, bodyRadius: 4.2, bendAngle: 30, handleLength: 26, handleWidth: 6.5, handleDepth: 4.5 },
  },
  {
    id: 'builtin-narrow',
    name: '窄间隙细长枪',
    params: { ...DEFAULT_WELD_GUN_PARAMS, nozzleLength: 14, nozzleRadius: 0.4, neckLength: 42, neckRadius: 1.1, bodyLength: 24, bodyRadius: 3.2, bendAngle: 12, handleLength: 26, handleWidth: 5, handleDepth: 3.5 },
  },
  {
    id: 'builtin-bent',
    name: '大弯角鹅颈枪',
    params: { ...DEFAULT_WELD_GUN_PARAMS, nozzleLength: 8, nozzleRadius: 0.7, neckLength: 22, neckRadius: 2, bodyLength: 18, bodyRadius: 4.5, bendAngle: 55, handleLength: 24, handleWidth: 7, handleDepth: 5 },
  },
];

export function useWeldGun() {
  const [params, setParams] = useState<WeldGunParams>(loadParams);
  const [presets, setPresets] = useState<WeldGunPreset[]>(loadPresets);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(WELD_GUN_STORAGE_KEY, JSON.stringify(params));
    } catch {
      /* 隐私模式下可能不可写，忽略 */
    }
  }, [params]);

  useEffect(() => {
    try {
      localStorage.setItem(WELD_GUN_PRESET_STORAGE_KEY, JSON.stringify(presets));
    } catch {
      /* ignore */
    }
  }, [presets]);

  /** 改任一参数就不再归属任何已保存预设 */
  const updateParam = useCallback(<K extends keyof WeldGunParams>(key: K, value: WeldGunParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setSelectedPresetId(null);
  }, []);

  const patchParams = useCallback((patch: Partial<WeldGunParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
    setSelectedPresetId(null);
  }, []);

  const resetParams = useCallback(() => {
    setParams({ ...DEFAULT_WELD_GUN_PARAMS, visible: true });
    setSelectedPresetId(null);
  }, []);

  const saveAsPreset = useCallback((name: string) => {
    const trimmed = name.trim() || '未命名预设';
    const preset: WeldGunPreset = { id: genId(), name: trimmed, params: { ...params } };
    setPresets((prev) => [...prev, preset]);
    setSelectedPresetId(preset.id);
  }, [params]);

  const updateSelectedPreset = useCallback(() => {
    if (!selectedPresetId) return;
    setPresets((prev) =>
      prev.map((p) => (p.id === selectedPresetId ? { ...p, params: { ...params } } : p))
    );
  }, [selectedPresetId, params]);

  const applyPreset = useCallback((preset: WeldGunPreset) => {
    // 应用预设时保留当前的 visible 开关，否则用户点预设会把模型藏起来
    setParams((prev) => ({ ...prev, ...preset.params, visible: prev.visible }));
    setSelectedPresetId(preset.id.startsWith('builtin-') ? null : preset.id);
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    setSelectedPresetId((prev) => (prev === id ? null : prev));
  }, []);

  const renamePreset = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
  }, []);

  const toggleVisible = useCallback(() => {
    setParams((prev) => ({ ...prev, visible: !prev.visible }));
  }, []);

  return {
    params,
    presets,
    selectedPresetId,
    updateParam,
    patchParams,
    resetParams,
    saveAsPreset,
    updateSelectedPreset,
    applyPreset,
    deletePreset,
    renamePreset,
    toggleVisible,
  };
}

export type UseWeldGunReturn = ReturnType<typeof useWeldGun>;
