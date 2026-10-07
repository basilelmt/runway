import { TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { HoldingView } from '@shared/api-types';
import { Amount, Badge, EmptyState } from '@/components/ui';
import { formatPct, formatQty, gainTone, platformLabel } from '@/lib/invest';
import styles from './Portfolio.module.css';

type Props = { holdings: HoldingView[]; onOpen: (id: number) => void; emptyAction?: ReactNode };

/** Symbole court d'une position : « BTC » pour « BTC-EUR », sinon le ticker. */
export const shortTicker = (ticker: string) => ticker.replace(/-EUR$/, '');

export function HoldingList({ holdings, onOpen, emptyAction }: Props) {
  if (holdings.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp />}
        title="Aucune position"
        description="Ajoute ce que tu détiens sur Trade Republic ou ailleurs, ou relie Binance pour suivre tes cryptos."
        action={emptyAction}
      />
    );
  }
  return (
    <ul className={['ledger', 'stagger', styles.holdings].join(' ')}>
      {holdings.map((h) => (
        <li key={h.id} className={['hover-row', styles.holding].join(' ')}>
          <button type="button" className={styles.open} onClick={() => onOpen(h.id)} aria-label={`Voir le détail de ${h.name}`} />
          <div className={styles.holdingName}>
            <span className={styles.name}>{h.name}</span>
            <span className={styles.meta}>
              <Badge>{platformLabel(h.platform)}</Badge>
              <span className="mono">
                {formatQty(h.quantity)} {shortTicker(h.ticker)}
              </span>
            </span>
            {h.unpricedQuantity ? (
              <span className={styles.unpriced}>
                {formatQty(h.unpricedQuantity)} {shortTicker(h.ticker)} sans prix d’achat
              </span>
            ) : null}
          </div>
          <div className={styles.day}>
            {h.dayChangePct !== null ? (
              <span className={['num', styles[gainTone(h.dayChangePct)]].join(' ')} title="Variation depuis la clôture précédente">
                {formatPct(h.dayChangePct, { signed: true })}
              </span>
            ) : null}
          </div>
          <div className={styles.figures}>
            {h.value !== null ? <Amount cents={h.value} /> : <span className={styles.meta}>Cours indisponible</span>}
            {h.gain !== null ? (
              <span className={['num', styles.gain, styles[gainTone(h.gain)]].join(' ')}>
                <Amount cents={h.gain} tone="always" className={styles[gainTone(h.gain)]} /> · {formatPct(h.gainPct, { signed: true })}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
