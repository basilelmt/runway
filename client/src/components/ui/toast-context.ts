import { createContext, useContext } from 'react';

export type ToastApi = {
  toast: (message: string, tone?: 'neutral' | 'positive' | 'negative') => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé sous ToastProvider');
  return ctx;
}
