import { createContext, useContext } from 'react';

/** Action unique proposée dans un message, affichée tant qu'il reste visible (« Annuler »). */
export type ToastAction = { label: string; onClick: () => void };

export type ToastApi = {
  toast: (message: string, tone?: 'neutral' | 'positive' | 'negative', action?: ToastAction) => void;
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé sous ToastProvider');
  return ctx;
}
