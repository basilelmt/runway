import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { HoldingView, TradeView } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useDeleteHolding, useDeleteTrade } from '@/api/hooks';
import { Amount, Button, ConfirmDialog, Dialog, ListRow, listRowDate, Notice, RowMenu, SectionHeader, Stat, StatGroup, useToast } from '@/components/ui';
import { formatDateCompact } from '@/lib/format';
import { formatPct, formatQty, platformLabel } from '@/lib/invest';
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
  const [deletingTrade, setDeletingTrade] = useState<TradeView | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const removeTrade = useDeleteTrade({
    onSuccess: () => {
      setDeletingTrade(null);
      toast.success('Mouvement supprimé');
    },
  });
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
  // Une colonne d'actions dès qu'un mouvement est modifiable, pour que les montants restent alignés.
  const editable = holding.trades.some((t) => t.source !== 'binance');
  const sideLabel = (t: TradeView) => (t.side === 'buy' ? 'Achat' : 'Vente');

  return (
    <div className={styles.detail}>
      <StatGroup>
        <Stat label="Quantité">
          <span className={['num', styles.quantity].join(' ')}>
            {formatQty(holding.quantity)} <span className={styles.unit}>{unitOf(holding.ticker, holding.quantity)}</span>
          </span>
        </Stat>
        <Stat label="Prix moyen d’achat">{average !== null ? <Amount cents={average} size="lg" tone="neutral" /> : '-'}</Stat>
        <Stat label="Valeur">{holding.value !== null ? <Amount cents={holding.value} size="lg" tone="neutral" /> : '-'}</Stat>
        <Stat label="Plus-value">
          {holding.gain !== null ? (
            <>
              <Amount cents={holding.gain} size="lg" tone="always" /> <span className={['num', styles.unit].join(' ')}>{formatPct(holding.gainPct, { signed: true })}</span>
            </>
          ) : (
            '-'
          )}
        </Stat>
        {holding.realized !== 0 ? (
          <Stat label="Plus-value réalisée">
            <Amount cents={holding.realized} size="lg" tone="always" />
          </Stat>
        ) : null}
        {holding.price ? (
          <Stat label="Cours">
            <Amount cents={Math.round(holding.price.eur * 100)} size="lg" tone="neutral" /> <span className={styles.unit}>le {formatDateCompact(holding.price.date)}</span>
          </Stat>
        ) : null}
      </StatGroup>

      {holding.unpricedQuantity ? (
        <Notice tone="warning">
          {formatQty(holding.unpricedQuantity)} {unitOf(holding.ticker, holding.unpricedQuantity)} détenus sur Binance n’ont pas de prix d’achat connu (dépôt depuis un autre portefeuille, par exemple). Ajoute l’achat
          à la main pour un coût de revient exact.
        </Notice>
      ) : null}

      {holding.missingQuantity ? (
        <Notice tone="warning">
          Les mouvements importés totalisent {formatQty(holding.missingQuantity)} {unitOf(holding.ticker, holding.missingQuantity)} de plus que le solde Binance (retrait vers un autre
          portefeuille, staking bloqué ou vente sur une paire non suivie). Cette part sort au prix de revient, sans plus-value.
        </Notice>
      ) : null}

      <section aria-labelledby="trades-title">
        <SectionHeader
          as="h3"
          id="trades-title"
          title="Mouvements"
          aside={
            <Button size="sm" onClick={() => setEditing({ trade: null, key: Date.now() })}>
              Ajouter un mouvement
            </Button>
          }
        />
        <ul className="ledger">
          {[...holding.trades].reverse().map((t) => (
            <ListRow
              key={t.id}
              compact
              lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}
              title={sideLabel(t)}
              meta={
                <>
                  <span className="num">
                    {formatQty(t.quantity)} {unitOf(holding.ticker, t.quantity)}
                  </span>
                  {t.source === 'binance' ? <span>Importé de Binance</span> : null}
                </>
              }
              trail={<Amount cents={t.amount} tone="neutral" />}
              trailSub={t.fees > 0 ? `+ ${formatEuros(t.fees)} de frais` : undefined}
              actions={
                t.source === 'binance' ? (
                  editable ? (
                    <span />
                  ) : undefined
                ) : (
                  <RowMenu
                    label={`Actions du mouvement du ${formatDateCompact(t.date)}`}
                    items={[
                      { label: 'Modifier', icon: <Pencil />, onSelect: () => setEditing({ trade: t, key: t.id }) },
                      { label: 'Supprimer', icon: <Trash2 />, danger: true, onSelect: () => setDeletingTrade(t) },
                    ]}
                  />
                )
              }
            />
          ))}
        </ul>
      </section>

      {manual ? (
        <div>
          <Button variant="danger-quiet" size="sm" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
            Supprimer la position
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deletingTrade !== null}
        onClose={() => setDeletingTrade(null)}
        onConfirm={() => deletingTrade && removeTrade.mutate(deletingTrade.id)}
        title="Supprimer ce mouvement ?"
        confirmLabel="Supprimer"
        loading={removeTrade.isPending}
        error={removeTrade.error ? errorMessage(removeTrade.error) : null}
      >
        {deletingTrade ? (
          <span>
            <strong>{sideLabel(deletingTrade)}</strong> du {formatDateCompact(deletingTrade.date)} : {formatQty(deletingTrade.quantity)} {unitOf(holding.ticker, deletingTrade.quantity)} pour{' '}
            <Amount cents={deletingTrade.amount} tone="neutral" />.
          </span>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => removeHolding.mutate(holding.id)}
        title="Supprimer la position ?"
        description={`La position et ses ${holding.trades.length} mouvements seront effacés.`}
        confirmLabel="Supprimer"
        loading={removeHolding.isPending}
        error={removeHolding.error ? errorMessage(removeHolding.error) : null}
      >
        <strong>{holding.name}</strong>
      </ConfirmDialog>

      {editing ? <TradeDialog key={editing.key} holding={holding} trade={editing.trade} open onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
