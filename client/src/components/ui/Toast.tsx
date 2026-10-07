import { AlertCircle, Check, Info } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/lib/motion';
import { ToastContext, type ToastApi } from './toast-context';
import styles from './Toast.module.css';

type Toast = { id: number; message: string; tone: 'neutral' | 'positive' | 'negative'; leaving: boolean };

/** Durée de la sortie, alignée sur `.leaving` dans le CSS. */
const LEAVE_MS = 200;

const ICONS = { neutral: Info, positive: Check, negative: AlertCircle } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'neutral') => {
    const id = nextId.current++;
    const life = tone === 'negative' ? 6000 : 3500;
    // Pas plus de trois à la fois : les plus anciennes laissent la place.
    setToasts((list) => [...list.slice(-2), { id, message, tone, leaving: false }]);
    window.setTimeout(() => setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), life);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), life + (prefersReducedMotion() ? 0 : LEAVE_MS));
  }, []);

  // Les fenêtres modales vivent dans la couche supérieure du navigateur : la zone des messages y passe aussi,
  // et se réaffiche à chaque nouveau message pour rester au-dessus de la dernière fenêtre ouverte.
  const region = useRef<HTMLDivElement>(null);
  const lastId = toasts.at(-1)?.id;
  useEffect(() => {
    const el = region.current;
    if (!el || typeof el.showPopover !== 'function') return;
    if (lastId === undefined) {
      if (el.matches(':popover-open')) el.hidePopover();
      return;
    }
    const open = el.matches(':popover-open');
    // Repasser au premier plan rejoue les animations : seulement si une fenêtre a pu s'ouvrir par-dessus.
    if (open && document.querySelector('dialog[open]')) el.hidePopover();
    if (!el.matches(':popover-open')) el.showPopover();
  }, [lastId]);

  const api = useMemo<ToastApi>(
    () => ({ toast, success: (m) => toast(m, 'positive'), error: (m) => toast(m, 'negative') }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div ref={region} popover="manual" className={styles.region} role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} className={[styles.toast, styles[t.tone], t.leaving ? styles.leaving : ''].join(' ')}>
              <Icon className={styles.icon} aria-hidden />
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
