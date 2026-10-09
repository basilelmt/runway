import { ArrowRight, Receipt } from 'lucide-react';
import { useState } from 'react';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { addMonths, endOfMonth, startOfMonth, today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useTransactions } from '@/api/hooks';
import { operationsHref } from '@/components/transactions/TransactionFilters';
import { Amount, Badge, ButtonLink, Dialog, Dot, EmptyState, ErrorState, GroupLabel, ListRow, ListRowSkeleton, listRowDate, Segmented, Skeleton, Stat, StatGroup } from '@/components/ui';
import { formatDateCompact, plural } from '@/lib/format';
import { displayLabel } from '@/lib/merchants';
import styles from './EnvelopeDetailDialog.module.css';

type Period = 'month' | 'last' | 'quarter';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'month', label: 'Ce mois' },
  { value: 'last', label: 'Mois dernier' },
  { value: 'quarter', label: '3 mois' },
];

function range(period: Period): { from: string; to: string; months: number } {
  const now = today();
  if (period === 'last') {
    const prev = addMonths(startOfMonth(now), -1);
    return { from: prev, to: endOfMonth(prev), months: 1 };
  }
  if (period === 'quarter') return { from: startOfMonth(addMonths(now, -2)), to: endOfMonth(now), months: 3 };
  return { from: startOfMonth(now), to: endOfMonth(now), months: 1 };
}

type EnvelopeDetailDialogProps = { envelope: EnvelopeWithBalance | null; onClose: () => void };

/** Les dépenses rangées dans une enveloppe, sur une période courte. */
export function EnvelopeDetailDialog({ envelope, onClose }: EnvelopeDetailDialogProps) {
  return (
    <Dialog
      open={envelope !== null}
      onClose={onClose}
      size="lg"
      title={
        envelope ? (
          <span className={styles.title}>
            <Dot color={envelope.color} size={12} /> {envelope.name}
          </span>
        ) : (
          ''
        )
      }
    >
      {envelope ? <Detail key={envelope.id} envelope={envelope} /> : null}
    </Dialog>
  );
}

function Detail({ envelope }: { envelope: EnvelopeWithBalance }) {
  const [period, setPeriod] = useState<Period>('month');
  const { from, to, months } = range(period);
  // En changeant de période, la liste précédente reste affichée jusqu'à l'arrivée de la nouvelle.
  const transactions = useTransactions({ envelope: envelope.id, from, to, kind: 'expense', limit: 1000 }, { keepPrevious: true });

  const list = transactions.data ?? [];
  const confirmed = list.filter((t) => t.status === 'confirmed');
  const total = confirmed.reduce((s, t) => s + t.amount, 0);
  const budget = envelope.monthlyBudget > 0 ? envelope.monthlyBudget * months : null;
  const verb = envelope.isSavings ? 'Versé' : 'Dépensé';

  return (
    <div className={styles.body}>
      <Segmented label="Période" value={period} onChange={setPeriod} options={PERIODS} />

      <StatGroup>
        <Stat label={verb}>
          {/* Largeur réservée sur le budget de la période : la stat voisine ne bouge pas quand le montant arrive. */}
          <span className={styles.spent}>
            <span className={styles.reserve} aria-hidden="true">
              <Amount cents={budget ?? 0} size="lg" tone="neutral" />
              {budget !== null ? <span className={styles.budget}> sur {formatEuros(budget)}</span> : null}
            </span>
            {transactions.isPending ? (
              <Skeleton width="70%" height={20} className={styles.spentSkeleton} />
            ) : (
              <span>
                <Amount cents={total} size="lg" tone="neutral" className={budget !== null && total > budget ? styles.over : ''} />
                {budget !== null ? <span className={styles.budget}> sur {formatEuros(budget)}</span> : null}
              </span>
            )}
          </span>
        </Stat>
        <Stat label="Disponible aujourd’hui">
          <Amount cents={envelope.balance} size="lg" />
        </Stat>
      </StatGroup>

      {/* La zone garde au moins la hauteur de son squelette : le dialogue ne saute pas à l'arrivée des données. */}
      <div className={styles.results} aria-busy={transactions.isFetching}>
        <div className={styles.reserve} aria-hidden="true">
          <ResultsSkeleton />
        </div>
        {transactions.isPending ? (
          <ResultsSkeleton />
        ) : transactions.error ? (
          <ErrorState title="Impossible de charger les dépenses" description={errorMessage(transactions.error)} onRetry={() => transactions.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={<Receipt />} title="Aucune dépense sur cette période." />
        ) : (
          <div className={transactions.isPlaceholderData ? styles.stale : undefined}>
            <GroupLabel as="p">{plural(list.length, 'dépense')}</GroupLabel>
            <ul className={['ledger', 'stagger', styles.list].join(' ')}>
              {list.map((t) => (
                <ListRow
                  key={t.id}
                  compact
                  muted={t.status === 'planned'}
                  lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}
                  title={
                    <>
                      <span title={t.label}>{displayLabel(t)}</span>
                      {t.status === 'planned' ? (
                        <>
                          {' '}
                          <Badge tone="warning">Prévue</Badge>
                        </>
                      ) : null}
                    </>
                  }
                  trail={<Amount cents={-t.amount} tone="neutral" />}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <ButtonLink to={operationsHref({ envelope: envelope.id, from, to })} variant="ghost" size="sm" icon={<ArrowRight />} className={styles.more}>
        Voir dans Opérations
      </ButtonLink>
    </div>
  );
}

/** Chargement de la liste : même forme que le résultat, intitulé compris. */
function ResultsSkeleton() {
  return (
    <div>
      <GroupLabel as="p">
        <Skeleton width={72} height={10} className={styles.labelSkeleton} />
      </GroupLabel>
      <ListRowSkeleton rows={4} compact />
    </div>
  );
}
