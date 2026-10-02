import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './Toast.module.css';

type Toast = { id: number; message: string; tone: 'neutral' | 'positive' | 'negative' };
type ToastApi = {
  toast: (message: string, tone?: Toast['tone']) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

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

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé sous ToastProvider');
  return ctx;
}
