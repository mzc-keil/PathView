/** 焊枪参数（可序列化，localStorage key: pathview.weldgun） */
export interface WeldGunParams {
  visible: boolean;
  color: string;
  /** 嘴尖朝向：z+ 朝 +Z，z- 朝 -Z（默认） */
  direction: 'z+' | 'z-';
  /** 枪嘴 */
  nozzleLength: number;
  nozzleRadius: number;
  /** 枪颈（鹅颈） */
  neckLength: number;
  neckRadius: number;
  /** 枪体 */
  bodyLength: number;
  bodyRadius: number;
  /** 枪柄弯角（度） */
  bendAngle: number;
  /** 枪柄（Box） */
  handleLength: number;
  handleWidth: number;
  handleDepth: number;
}

export interface WeldGunPreset {
  id: string;
  name: string;
  params: WeldGunParams;
}

export const WELD_GUN_STORAGE_KEY = 'pathview.weldgun';
export const WELD_GUN_PRESET_STORAGE_KEY = 'pathview.weldgun.presets';

export const DEFAULT_WELD_GUN_PARAMS: WeldGunParams = {
  visible: false,
  color: '#94a3b8',
  direction: 'z-',
  nozzleLength: 5,
  nozzleRadius: 0.5,
  neckLength: 15,
  neckRadius: 1.5,
  bodyLength: 20,
  bodyRadius: 4,
  bendAngle: 30,
  handleLength: 25,
  handleWidth: 6,
  handleDepth: 4,
};

/** 参数编辑器的字段元数据，驱动 UI 自动生成滑块 */
export interface WeldGunField {
  key: keyof WeldGunParams;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export const WELD_GUN_FIELDS: WeldGunField[] = [
  { key: 'nozzleLength', label: '枪嘴长', min: 1, max: 30, step: 0.5 },
  { key: 'nozzleRadius', label: '枪嘴半径', min: 0.1, max: 8, step: 0.1 },
  { key: 'neckLength', label: '枪颈长', min: 2, max: 80, step: 1 },
  { key: 'neckRadius', label: '枪颈半径', min: 0.3, max: 12, step: 0.1 },
  { key: 'bodyLength', label: '枪体长', min: 2, max: 80, step: 1 },
  { key: 'bodyRadius', label: '枪体半径', min: 0.5, max: 20, step: 0.5 },
  { key: 'bendAngle', label: '枪柄弯角', min: 0, max: 90, step: 1, unit: '°' },
  { key: 'handleLength', label: '枪柄长', min: 2, max: 90, step: 1 },
  { key: 'handleWidth', label: '枪柄宽', min: 1, max: 40, step: 0.5 },
  { key: 'handleDepth', label: '枪柄厚', min: 1, max: 40, step: 0.5 },
];
