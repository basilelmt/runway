import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { HoldingView, TradeView } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useDeleteHolding, useDeleteTrade } from '@/api/hooks';
import { Amount, Button, Dialog, useToast } from '@/components/ui';
import { formatDateCompact } from '@/lib/format';
import { formatPct, formatQty, gainTone, platformLabel } from '@/lib/invest';
import { unitOf } from './HoldingList';
import { TradeDialog } from './TradeDialog';
import styles from './HoldingDialog.module.css';

type Props = { holding: HoldingView | null; onClose: () => void };

/** Détail d'une position : chiffres clés et mouvements, modifiables s'ils ont été saisis à la main. */
export function HoldingDialog({ holding, onClose }: Props) {
  // Le contenu reste affiché pendant l'animation de fermeture.
  const [last, setLast] = useState(holding);
  if (holding && holding !== last) setLast(holding);
  const shown = holding ?? last;

  return (
    <Dialog open={holding !== null} onClose={onClose} title={shown?.name ?? ''} description={shown ? `${shown.ticker} · ${platformLabel(shown.platform)}` : undefined} size="md">
      {shown ? <HoldingDetail key={shown.id} holding={shown} onClose={onClose} /> : null}
    </Dialog>
  );
}

function HoldingDetail({ holding, onClose }: { holding: HoldingView; onClose: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<{ trade: TradeView | null; key: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const removeTrade = useDeleteTrade({ onSuccess: () => toast.success('Mouvement supprimé') });
  const removeHolding = useDeleteHolding({
    onSuccess: () => {
      toast.success('Position supprimée');
      onClose();
    },
  });
  const qty = Number(holding.quantity);
  const covered = holding.unpricedQuantity ? qty - Number(holding.unpricedQuantity) : qty;
  const average = covered > 0 ? Math.round(holding.costBasis / covered) : null;
  const manual = holding.source === 'manual';
  const error = removeTrade.error ?? removeHolding.error;

  return (
    <div className={styles.detail}>
      <dl className={styles.figures}>
        <div>
          <dt>Quantité</dt>
          <dd className="num">
            {formatQty(holding.quantity)} <span className={styles.unit}>{unitOf(holding.ticker, holding.quantity)}</span>
          </dd>
        </div>
        <div>
          <dt>Prix moyen d’achat</dt>
          <dd className="num">{average !== null ? formatEuros(average) : '-'}</dd>
        </div>
        <div>
          <dt>Valeur</dt>
          <dd>{holding.value !== null ? <Amount cents={holding.value} /> : '-'}</dd>
        </div>
        <div>
          <dt>Plus-value</dt>
          <dd className={['num', styles[gainTone(holding.gain)]].join(' ')}>
            {holding.gain !== null ? `${formatEuros(holding.gain, { signed: true })} · ${formatPct(holding.gainPct, { signed: true })}` : '-'}
          </dd>
        </div>
        {holding.realized !== 0 ? (
          <div>
            <dt>Plus-value réalisée</dt>
            <dd className={['num', styles[gainTone(holding.realized)]].join(' ')}>{formatEuros(holding.realized, { signed: true })}</dd>
          </div>
        ) : null}
        {holding.price ? (
          <div>
            <dt>Cours</dt>
            <dd className="num">
              {formatEuros(Math.round(holding.price.eur * 100))} <span className={styles.unit}>le {formatDateCompact(holding.price.date)}</span>
            </dd>
          </div>
        ) : null}
      </dl>

      {holding.unpricedQuantity ? (
        <p className={styles.note}>
          {formatQty(holding.unpricedQuantity)} {unitOf(holding.ticker, holding.unpricedQuantity)} détenus sur Binance n’ont pas de prix d’achat connu (dépôt depuis un autre portefeuille, par exemple). Ajoute
          l’achat à la main pour un coût de revient exact.
        </p>
      ) : null}

      {holding.missingQuantity ? (
        <p className={styles.note}>
          Les mouvements importés totalisent {formatQty(holding.missingQuantity)} {unitOf(holding.ticker, holding.missingQuantity)} de plus que le solde Binance (retrait vers un
          autre portefeuille, staking bloqué ou vente sur une paire non suivie). Cette part sort au prix de revient, sans plus-value.
        </p>
      ) : null}

      <section aria-labelledby="trades-title">
        <div className={styles.tradesHead}>
          <h3 id="trades-title">Mouvements</h3>
          <Button size="sm" onClick={() => setEditing({ trade: null, key: Date.now() })}>
            Ajouter un mouvement
          </Button>
        </div>
        <ul className="ledger">
          {[...holding.trades].reverse().map((t) => (
            <li key={t.id} className={styles.trade}>
              <span className={styles.tradeDate}>{formatDateCompact(t.date)}</span>
              <span className={styles.tradeSide}>{t.side === 'buy' ? 'Achat' : 'Vente'}</span>
              <span className={['num', styles.tradeQty].join(' ')}>
                {formatQty(t.quantity)} {unitOf(holding.ticker, t.quantity)}
              </span>
              <span className={['num', styles.tradeAmount].join(' ')}>
                {formatEuros(t.amount)}
                {t.fees > 0 ? <span className={styles.unit}> + {formatEuros(t.fees)} de frais</span> : null}
              </span>
              <span className={styles.tradeActions}>
                {t.source === 'binance' ? (
                  <span className={styles.unit}>Importé de Binance</span>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" icon={<Pencil />} aria-label="Modifier le mouvement" onClick={() => setEditing({ trade: t, key: t.id })} />
                    <Button variant="ghost" size="sm" icon={<Trash2 />} aria-label="Supprimer le mouvement" loading={removeTrade.isPending && removeTrade.variables === t.id} onClick={() => removeTrade.mutate(t.id)} />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {errorMessage(error)}
        </p>
      ) : null}

      {manual ? (
        <div className={styles.danger}>
          {confirmDelete ? (
            <>
              <span>La position et ses {holding.trades.length} mouvements seront effacés.</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
              <Button variant="danger" size="sm" loading={removeHolding.isPending} onClick={() => removeHolding.mutate(holding.id)}>
                Confirmer la suppression
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className={styles.deleteLink} icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
              Supprimer la position
            </Button>
          )}
        </div>
      ) : null}

      {editing ? <TradeDialog key={editing.key} holding={holding} trade={editing.trade} open onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
