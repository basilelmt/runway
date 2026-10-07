import { useEffect, useRef } from 'react';
import { useRunBankSync } from '@/api/hooks';
import { useToast } from '@/components/ui';
import { syncSummary } from '@/lib/format';

const STALE_MINUTES = 60;

/**
 * À l'ouverture de l'app, demande une synchronisation si la dernière date de plus d'une heure.
 * Silencieux sauf quand des opérations arrivent ; un retard ou une erreur apparaît dans « À faire » sur l'accueil.
 */
export function useAutoBankSync(): void {
  const toast = useToast();
  const { mutate } = useRunBankSync({
    onSuccess: (r) => {
      const summary = syncSummary(r);
      if (summary) toast.success(summary);
    },
  });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate(STALE_MINUTES);
  }, [mutate]);
}
