import { useEffect, useRef } from 'react';
import type { ViewPreset } from '../types';
import { SPEED_PRESETS } from './usePlayback';

export interface HotkeyActions {
  togglePlay: () => void;
  step: (delta: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  setSpeed: (speed: number) => void;
  viewPreset: (preset: ViewPreset) => void;
  toggleBoxSelect: () => void;
  escape: () => void;
  toggleLine: () => void;
  togglePoints: () => void;
  toggleGun: () => void;
  toggleAxes: () => void;
  toggleAllAxes: () => void;
  clearHidden: () => void;
  toggleHelp: () => void;
}

const PARAM_KEYS = ['a', 'b', 'i', 'r', 'f', 't', 's', 'l', 'p', 'g', 'c'];
const DIGIT_INDEX: Record<string, number> = {
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
};

/** 判断事件是否来自文本输入控件 —— 在输入框里敲键盘不应该触发播放控制。
 *  注意：checkbox / radio / range 这类非文本控件不能拦，否则点完开关快捷键就全部失效。 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || target.isContentEditable) return true;
  if (tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset'].includes(type);
  }
  return false;
}

export function useHotkeys(actions: HotkeyActions): void {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = ref.current;

      if (e.key === 'Escape') {
        a.escape();
        return;
      }
      if (isTypingTarget(e.target)) return;

      // 数字键切速度
      if (DIGIT_INDEX[e.key] !== undefined) {
        a.setSpeed(SPEED_PRESETS[DIGIT_INDEX[e.key]]);
        e.preventDefault();
        return;
      }

      switch (e.key) {
        case ' ':
          a.togglePlay();
          e.preventDefault();
          return;
        case 'ArrowLeft':
          a.step(e.shiftKey ? -10 : -1);
          e.preventDefault();
          return;
        case 'ArrowRight':
          a.step(e.shiftKey ? 10 : 1);
          e.preventDefault();
          return;
        case 'Home':
          a.goToStart();
          e.preventDefault();
          return;
        case 'End':
          a.goToEnd();
          e.preventDefault();
          return;
        case '?':
          a.toggleHelp();
          e.preventDefault();
          return;
        default:
          break;
      }

      const code = e.code;
      if (code === 'KeyB') {
        a.toggleBoxSelect();
        return;
      }
      if (code === 'KeyR') {
        a.viewPreset('reset');
        return;
      }
      if (code === 'KeyC') {
        a.clearHidden();
        return;
      }
      if (code === 'KeyA') {
        if (e.shiftKey) a.toggleAllAxes();
        else a.toggleAxes();
        return;
      }

      // 视角预设（小写无修饰键，避免和输入冲突）
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        switch (code) {
          case 'KeyF':
            a.viewPreset('front');
            return;
          case 'KeyT':
            a.viewPreset('top');
            return;
          case 'KeyS':
            a.viewPreset('side');
            return;
          case 'KeyI':
            a.viewPreset('iso');
            return;
          case 'KeyL':
            a.toggleLine();
            return;
          case 'KeyP':
            a.togglePoints();
            return;
          case 'KeyG':
            a.toggleGun();
            return;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export { PARAM_KEYS };
