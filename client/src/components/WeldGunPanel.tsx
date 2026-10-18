import { useState } from 'react';
import { WELD_GUN_FIELDS, type WeldGunParams, type WeldGunPreset } from '../types/weldGun';
import { Icon } from './Icon';

export interface WeldGunPanelProps {
  params: WeldGunParams;
  presets: WeldGunPreset[];
  builtinPresets: WeldGunPreset[];
  selectedPresetId: string | null;
  disabled: boolean;
  onPatch: (patch: Partial<WeldGunParams>) => void;
  onReset: () => void;
  onSaveAsPreset: (name: string) => void;
  onUpdateSelected: () => void;
  onApplyPreset: (preset: WeldGunPreset) => void;
  onDeletePreset: (id: string) => void;
}

const PRESET_COLORS = ['#94a3b8', '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#a855f7'];

export function WeldGunPanel({
  params,
  presets,
  builtinPresets,
  selectedPresetId,
  disabled,
  onPatch,
  onReset,
  onSaveAsPreset,
  onUpdateSelected,
  onApplyPreset,
  onDeletePreset,
}: WeldGunPanelProps) {
  const [presetName, setPresetName] = useState('');

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-label">焊枪模型</div>
        <div className="panel-sublabel">
          几何随参数实时重建，验证焊枪在焊接姿态下是否会与工件发生干涉
        </div>

        {disabled && <div className="empty-state">当前点没有姿态数据，无法挂载焊枪</div>}

        <label className="toggle">
          <input
            type="checkbox"
            checked={params.visible}
            onChange={(e) => onPatch({ visible: e.target.checked })}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">显示焊枪（G）</span>
        </label>

        <div className="segmented segmented-wide" role="group" aria-label="嘴尖朝向">
          {(['z-', 'z+'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`segmented-item${params.direction === d ? ' is-active' : ''}`}
              onClick={() => onPatch({ direction: d })}
            >
              嘴尖朝 {d}
            </button>
          ))}
        </div>

        <div className="swatch-row">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch${params.color === c ? ' is-active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => onPatch({ color: c })}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-label">尺寸参数</div>
        {WELD_GUN_FIELDS.map((f) => {
          const value = params[f.key] as number;
          return (
            <div className="slider-row" key={String(f.key)}>
              <span className="slider-label">{f.label}</span>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={value}
                onChange={(e) => onPatch({ [f.key]: Number(e.target.value) } as Partial<WeldGunParams>)}
              />
              <span className="mono slider-value">
                {value}
                {f.unit ?? ''}
              </span>
            </div>
          );
        })}
        <div className="btn-row">
          <button type="button" className="btn" onClick={onReset}>
            <Icon name="refresh" size={14} />
            恢复默认
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-label">预设</div>
        <div className="panel-sublabel">内置模板 + 自己保存的常用枪型</div>

        <div className="preset-list">
          {builtinPresets.map((p) => (
            <div className="preset-item preset-item-builtin" key={p.id}>
              <span className="preset-name">{p.name}</span>
              <span className="preset-tag">内置</span>
              <button type="button" className="mini-btn" onClick={() => onApplyPreset(p)} title="应用">
                <Icon name="check" size={13} />
              </button>
            </div>
          ))}

          {presets.map((p) => (
            <div className={`preset-item${selectedPresetId === p.id ? ' is-active' : ''}`} key={p.id}>
              <span className="preset-name" title={p.name}>
                {p.name}
              </span>
              <button type="button" className="mini-btn" onClick={() => onApplyPreset(p)} title="应用">
                <Icon name="check" size={13} />
              </button>
              <button type="button" className="mini-btn" onClick={() => onDeletePreset(p.id)} title="删除">
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}

          {presets.length === 0 && <div className="panel-sublabel">还没有保存的预设</div>}
        </div>

        <div className="field-row">
          <input
            className="input"
            placeholder="预设名称"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && presetName.trim()) {
                onSaveAsPreset(presetName);
                setPresetName('');
              }
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={!presetName.trim()}
            onClick={() => {
              onSaveAsPreset(presetName);
              setPresetName('');
            }}
          >
            存为新预设
          </button>
        </div>

        {selectedPresetId && (
          <div className="btn-row">
            <button type="button" className="btn" onClick={onUpdateSelected}>
              <Icon name="check" size={14} />
              覆盖当前预设
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
