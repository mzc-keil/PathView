import type { PlaybackMode } from '../types';
import { SPEED_PRESETS } from '../hooks/usePlayback';
import { Icon } from './Icon';

const MODE_LABEL: Record<PlaybackMode, string> = {
  point: '逐点',
  smooth: '平滑',
  loop: '循环',
};

const MODE_HINT: Record<PlaybackMode, string> = {
  point: '每跳一步一个点，适合逐点排查坏点',
  smooth: '在两点之间插值，位移连续，适合整体观察',
  loop: '到末尾自动回到起点循环播放',
};

export interface PlaybackBarProps {
  isPlaying: boolean;
  progress: number;
  currentIndex: number;
  total: number;
  speed: number;
  mode: PlaybackMode;
  disabled: boolean;
  onToggle: () => void;
  onStepBy: (delta: number) => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  onSeek: (progress: number) => void;
  onSpeedChange: (speed: number) => void;
  onModeChange: (mode: PlaybackMode) => void;
}

export function PlaybackBar({
  isPlaying,
  progress,
  currentIndex,
  total,
  speed,
  mode,
  disabled,
  onToggle,
  onStepBy,
  onGoToStart,
  onGoToEnd,
  onSeek,
  onSpeedChange,
  onModeChange,
}: PlaybackBarProps) {
  const pct = total > 0 ? Math.round(progress * 100) : 0;

  return (
    <div className={`playback-bar${disabled ? ' is-disabled' : ''}`}>
      <div className="playback-info">
        <div className="playback-index">
          <span className="playback-index-now">{total > 0 ? currentIndex + 1 : 0}</span>
          <span className="playback-index-sep">/</span>
          <span className="playback-index-total">{total}</span>
        </div>
        <div className="playback-index-label">当前点 / 总点数</div>
      </div>

      <div className="playback-center">
        <div className="transport">
          <button
            type="button"
            className="icon-btn"
            title="回到起点 (Home)"
            onClick={onGoToStart}
            disabled={disabled}
          >
            <Icon name="skipStart" size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="上一步 (←)"
            onClick={() => onStepBy(-1)}
            disabled={disabled}
          >
            <Icon name="stepBack" size={15} />
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn-primary${isPlaying ? ' is-active' : ''}`}
            title="播放 / 暂停 (空格)"
            onClick={onToggle}
            disabled={disabled}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="下一步 (→)"
            onClick={() => onStepBy(1)}
            disabled={disabled}
          >
            <Icon name="stepFwd" size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="跳到末尾 (End)"
            onClick={onGoToEnd}
            disabled={disabled}
          >
            <Icon name="skipEnd" size={15} />
          </button>
        </div>

        <div className="progress-wrap">
          <input
            type="range"
            className="progress-slider"
            min={0}
            max={1}
            step={0.0001}
            value={progress}
            disabled={disabled}
            aria-label="播放进度"
            onChange={(e) => onSeek(Number(e.target.value))}
          />
          <div className="progress-meta">
            <span>{pct}%</span>
            <span className="progress-hint">空格播放 · ←→ 步进 · Home/End 首尾</span>
          </div>
        </div>
      </div>

      <div className="playback-right">
        <div className="segmented" role="group" aria-label="播放模式">
          {(Object.keys(MODE_LABEL) as PlaybackMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`segmented-item${mode === m ? ' is-active' : ''}`}
              onClick={() => onModeChange(m)}
              disabled={disabled}
              title={MODE_HINT[m]}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        <label className="speed-control">
          <Icon name="speed" size={14} />
          <select
            className="select"
            value={String(speed)}
            disabled={disabled}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            aria-label="播放速度"
          >
            {SPEED_PRESETS.map((s) => (
              <option key={s} value={String(s)}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
