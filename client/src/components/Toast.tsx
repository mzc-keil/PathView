import type { Toast } from '../types';
import { Icon, type IconName } from './Icon';

const KIND_ICON: Record<Toast['kind'], IconName> = {
  info: 'info',
  success: 'check',
  warn: 'warn',
  error: 'warn',
};

export interface ToastStackProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

/** 轻量通知栈，替代原实现里的 alert() —— alert 会阻塞渲染循环，不适合这个场景 */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div className={`toast toast-${t.kind}`} key={t.id} role="status">
          <Icon name={KIND_ICON[t.kind]} size={15} />
          <span className="toast-message">{t.message}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(t.id)} aria-label="关闭">
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
