import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastApi } from './toast-context';
import styles from './Toast.module.css';

type Toast = { id: number; message: string; tone: 'neutral' | 'positive' | 'negative' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'neutral') => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'negative' ? 6000 : 3500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ toast, success: (m) => toast(m, 'positive'), error: (m) => toast(m, 'negative') }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={[styles.toast, styles[t.tone]].join(' ')}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
