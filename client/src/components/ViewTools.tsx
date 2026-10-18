import type { OrbitTarget, ViewPreset } from '../types';

const VIEWS: Array<{ key: ViewPreset; glyph: string; label: string; title: string }> = [
  { key: 'front', glyph: 'F', label: '前视', title: '前视：沿 -Y 看 XZ 平面' },
  { key: 'top', glyph: 'T', label: '俯视', title: '俯视：沿 -Z 看 XY 平面' },
  { key: 'side', glyph: 'S', label: '侧视', title: '侧视：沿 -X 看 YZ 平面' },
  { key: 'iso', glyph: 'I', label: '轴测', title: '轴测：等角视角' },
  { key: 'reset', glyph: '⟲', label: '复位', title: '重新自动取景（并恢复包围盒跟随）' },
];

export interface ViewToolsProps {
  active: ViewPreset | null;
  onSelect: (preset: ViewPreset) => void;
  autoFit: boolean;
  onToggleAutoFit: (value: boolean) => void;
  orbitTarget: OrbitTarget;
  onToggleOrbitTarget: (value: OrbitTarget) => void;
}

/** 视角预设：浮动在 3D 视图左下角，不占用右栏空间 */
export function ViewTools({
  active,
  onSelect,
  autoFit,
  onToggleAutoFit,
  orbitTarget,
  onToggleOrbitTarget,
}: ViewToolsProps) {
  return (
    <div className="view-tools">
      <div className="view-buttons">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className={`view-btn${active === v.key ? ' active' : ''}`}
            title={v.title}
            onClick={() => onSelect(v.key)}
          >
            <span className="view-btn-glyph">{v.glyph}</span>
            <span className="view-btn-label">{v.label}</span>
          </button>
        ))}
      </div>
      <div className="view-options">
        <label className="view-autofit" title="包围盒显著变化时自动重新取景（例如框选剔掉一大段坏点）">
          <input type="checkbox" checked={autoFit} onChange={(e) => onToggleAutoFit(e.target.checked)} />
          自动取景
        </label>
        <label className="view-autofit" title="相机旋转中心跟随当前焊接点（播放时不跟随，否则相机会被轨迹拖走）">
          <input
            type="checkbox"
            checked={orbitTarget === 'current'}
            onChange={(e) => onToggleOrbitTarget(e.target.checked ? 'current' : 'center')}
          />
          跟随当前点
        </label>
      </div>
    </div>
  );
}
