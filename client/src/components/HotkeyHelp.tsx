import { Icon } from './Icon';

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: '播放',
    items: [
      ['空格', '播放 / 暂停'],
      ['← / →', '上一步 / 下一步'],
      ['Shift + ← / →', '快退 / 快进 10 步'],
      ['Home / End', '跳到起点 / 终点'],
      ['1 ~ 7', '切换播放速度档位'],
    ],
  },
  {
    title: '视角',
    items: [
      ['F', '前视（沿 -Y）'],
      ['T', '俯视（沿 -Z）'],
      ['S', '侧视（沿 -X）'],
      ['I', '轴测视角'],
      ['R', '重新自动取景'],
    ],
  },
  {
    title: '选择与测距',
    items: [
      ['单击点', '选中该点并更新读数'],
      ['Ctrl / Cmd + 单击点', '把该点设为测距锚点 A / B'],
      ['B', '切换框选隐藏点模式'],
      ['Esc', '退出框选 / 清除测距锚点'],
    ],
  },
  {
    title: '视图与面板',
    items: [
      ['L', '显示 / 隐藏轨迹线'],
      ['P', '显示 / 隐藏轨迹点'],
      ['G', '显示 / 隐藏焊枪'],
      ['A', '显示 / 隐藏当前点三轴'],
      ['Shift + A', '显示 / 隐藏全部点三轴'],
      ['C', '清除所有隐藏点'],
      ['?', '打开 / 关闭本帮助'],
    ],
  },
];

export interface HotkeyHelpProps {
  onClose: () => void;
}

export function HotkeyHelp({ onClose }: HotkeyHelpProps) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal hotkey-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="panel-label">
            <Icon name="keyboard" size={14} />
            键盘快捷键
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="关闭 (Esc)">
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body hotkey-body">
          {GROUPS.map((g) => (
            <div className="hotkey-group" key={g.title}>
              <div className="hotkey-group-title">{g.title}</div>
              {g.items.map(([key, desc]) => (
                <div className="hotkey-row" key={key + desc}>
                  <kbd className="kbd">{key}</kbd>
                  <span className="hotkey-desc">{desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
