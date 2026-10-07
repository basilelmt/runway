import { useEffect, useRef } from 'react';
import { useSyncBinance } from '@/api/hooks';
import { useToast } from '@/components/ui';
import { plural } from '@/lib/format';

const STALE_MINUTES = 60;

/**
 * À l'arrivée sur l'écran, synchronise Binance si la dernière synchro date de plus d'une heure.
 * Silencieux sauf quand des mouvements arrivent ; une erreur s'affiche sur la ligne Binance.
 */
export function useAutoBinanceSync(configured: boolean): void {
  const toast = useToast();
  const { mutate } = useSyncBinance({
    onSuccess: (r) => {
      if (r.newTrades > 0) toast.success(plural(r.newTrades, 'nouveau mouvement Binance', 'nouveaux mouvements Binance'));
    },
  });
  const started = useRef(false);
  useEffect(() => {
    if (!configured || started.current) return;
    started.current = true;
    mutate(STALE_MINUTES);
  }, [configured, mutate]);
}
