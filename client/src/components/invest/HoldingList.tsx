import { TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { HoldingView } from '@shared/api-types';
import { Amount, Badge, ColumnHeader, EmptyState, ListRow } from '@/components/ui';
import { formatPct, formatQty, gainTone, platformLabel } from '@/lib/invest';
import styles from './Portfolio.module.css';

type Props = { holdings: HoldingView[]; onOpen: (id: number) => void; emptyAction?: ReactNode };

/** Symbole court d'une position : « BTC » pour « BTC-EUR », sinon le ticker. */
export const shortTicker = (ticker: string) => ticker.replace(/-EUR$/, '');

/** Unité d'une quantité : le symbole pour une crypto (« BTC »), des parts pour une action ou un ETF. */
export function unitOf(ticker: string, quantity?: string): string {
  if (ticker.endsWith('-EUR')) return shortTicker(ticker);
  return quantity !== undefined && Number(quantity) > 1 ? 'parts' : 'part';
}

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
    <div className={styles.holdings}>
      <ColumnHeader title="" middle="Aujourd’hui" trail="All time" />
      <ul className="ledger stagger">
        {holdings.map((h) => (
          <ListRow
            key={h.id}
            onClick={() => onOpen(h.id)}
            clickLabel={`Voir le détail de ${h.name}`}
            title={h.name}
            meta={
              <>
                <Badge>{platformLabel(h.platform)}</Badge>
                <span className="num">
                  {formatQty(h.quantity)} {unitOf(h.ticker, h.quantity)}
                </span>
                <span className="mono">{h.ticker}</span>
                {h.unpricedQuantity ? (
                  <span className={styles.unpriced}>
                    {formatQty(h.unpricedQuantity)} {unitOf(h.ticker, h.unpricedQuantity)} sans prix d’achat
                  </span>
                ) : null}
                {h.missingQuantity ? (
                  <span className={styles.unpriced}>
                    {formatQty(h.missingQuantity)} {unitOf(h.ticker, h.missingQuantity)} sortis de Binance
                  </span>
                ) : null}
              </>
            }
            middle={
              h.dayChangePct !== null ? (
                <span className={['num', styles.day, styles[gainTone(h.dayChangePct)]].join(' ')} title="Variation depuis la clôture précédente">
                  {formatPct(h.dayChangePct, { signed: true })}
                </span>
              ) : (
                <span className={styles.day} />
              )
            }
            trail={h.value !== null ? <Amount cents={h.value} /> : <span className={styles.unavailable}>Cours indisponible</span>}
            trailSub={
              h.gain !== null ? (
                <span className={['num', styles.gain, styles[gainTone(h.gain)]].join(' ')}>
                  <Amount cents={h.gain} tone="always" className={styles[gainTone(h.gain)]} /> · {formatPct(h.gainPct, { signed: true })}
                </span>
              ) : undefined
            }
          />
        ))}
      </ul>
    </div>
  );
}
