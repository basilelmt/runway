import { useEffect, useRef } from 'react';
import { useRunBankSync } from '@/api/hooks';
import { useToast } from '@/components/ui';
import { plural } from '@/lib/format';

const STALE_MINUTES = 60;

/**
 * À l'ouverture de l'app, demande une synchronisation si la dernière date de plus d'une heure.
 * Silencieux sauf quand des opérations arrivent ; les erreurs restent visibles dans la carte Import.
 */
export function useAutoBankSync(): void {
  const toast = useToast();
  const { mutate } = useRunBankSync({
    onSuccess: (r) => {
      if (r.reason !== 'ok') return;
      const created = r.connections.reduce((n, c) => n + c.created, 0);
      const matched = r.connections.reduce((n, c) => n + c.matched, 0);
      if (created + matched === 0) return;
      toast.success(`${plural(created, 'opération synchronisée', 'opérations synchronisées')}${matched ? `, ${matched} rapprochée${matched > 1 ? 's' : ''}` : ''}`);
    },
  });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate(STALE_MINUTES);
  }, [mutate]);
}
