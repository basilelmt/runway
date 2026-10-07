import { useIsMutating } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { BinanceState } from '@shared/api-types';
import { errorMessage } from '@/api/client';
import { keys, useDisconnectBinance, useSyncBinance } from '@/api/hooks';
import { Button, useToast } from '@/components/ui';
import { formatDateTime, plural } from '@/lib/format';
import { BinanceConnectDialog } from './BinanceConnectDialog';
import styles from './BinancePanel.module.css';

/** Liaison Binance : invitation à relier, puis état de la synchro, erreur et actions. */
export function BinancePanel({ state }: { state: BinanceState }) {
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const syncing = useIsMutating({ mutationKey: keys.binanceSync }) > 0;
  const sync = useSyncBinance({
    onSuccess: (r) => toast.success(r.newTrades > 0 ? plural(r.newTrades, 'nouveau mouvement', 'nouveaux mouvements') : 'Binance est à jour'),
  });
  const disconnect = useDisconnectBinance({ onSuccess: () => toast.success('Binance déconnecté') });

  if (!state.configured) {
    return (
      <div className={styles.panel}>
        <p className={styles.text}>Relie Binance pour suivre tes cryptos automatiquement, en lecture seule.</p>
        <Button onClick={() => setConnecting(true)}>Relier Binance</Button>
        <BinanceConnectDialog open={connecting} onClose={() => setConnecting(false)} />
      </div>
    );
  }

  const error = state.lastError ?? (sync.error ? errorMessage(sync.error) : null);
  return (
    <div className={styles.wrap}>
      {error && !syncing ? (
        <div className={styles.error} role="alert">
          <AlertTriangle aria-hidden />
          <span>{error}</span>
          <Button size="sm" onClick={() => sync.mutate(undefined)}>
            Réessayer
          </Button>
        </div>
      ) : null}
      <div className={styles.panel}>
        <p className={styles.text}>
          Binance <span className="mono">…{state.apiKeyHint}</span>
          <span className={styles.muted}>
            {' · '}
            {syncing ? 'synchronisation…' : state.lastSyncAt ? `synchronisé le ${formatDateTime(state.lastSyncAt)}` : 'jamais synchronisé'}
          </span>
        </p>
        <div className={styles.actions}>
          {confirm ? (
            <>
              <span className={styles.muted}>Les positions Binance seront retirées de Runway.</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                Annuler
              </Button>
              <Button variant="danger" size="sm" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>
                Déconnecter
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
                Déconnecter
              </Button>
              <Button size="sm" icon={<RefreshCw />} loading={syncing} onClick={() => sync.mutate(undefined)}>
                Synchroniser
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
