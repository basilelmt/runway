import { ArrowRight, Receipt } from 'lucide-react';
import { useState } from 'react';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { addMonths, endOfMonth, startOfMonth, today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useTransactions } from '@/api/hooks';
import { Amount, ButtonLink, Dialog, Dot, Segmented, SkeletonRows } from '@/components/ui';
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
  const transactions = useTransactions({ envelope: envelope.id, from, to, kind: 'expense', limit: 1000 });

  const list = transactions.data ?? [];
  const confirmed = list.filter((t) => t.status === 'confirmed');
  const total = confirmed.reduce((s, t) => s + t.amount, 0);
  const budget = envelope.monthlyBudget > 0 ? envelope.monthlyBudget * months : null;
  const verb = envelope.isSavings ? 'Versé' : 'Dépensé';
  const params = new URLSearchParams({ envelope: String(envelope.id), period: 'custom', from, to });

  return (
    <div className={styles.body}>
      <Segmented label="Période" value={period} onChange={setPeriod} options={PERIODS} />

      <dl className={styles.stats}>
        <div>
          <dt>{verb}</dt>
          <dd>
            <Amount cents={total} size="lg" tone="neutral" className={budget !== null && total > budget ? styles.over : ''} />
            {budget !== null ? <span className={styles.budget}> sur {formatEuros(budget)}</span> : null}
          </dd>
        </div>
        <div className={styles.right}>
          <dt>Disponible aujourd’hui</dt>
          <dd>
            <Amount cents={envelope.balance} size="lg" />
          </dd>
        </div>
      </dl>

      {transactions.isPending ? (
        <SkeletonRows rows={4} />
      ) : transactions.error ? (
        <p className={styles.error} role="alert">
          {errorMessage(transactions.error)}
        </p>
      ) : list.length === 0 ? (
        <p className={styles.empty}>
          <Receipt aria-hidden /> Aucune dépense sur cette période.
        </p>
      ) : (
        <>
          <p className={styles.count}>{plural(list.length, 'dépense')}</p>
          <ul className={['ledger', 'stagger', styles.list].join(' ')}>
            {list.map((t) => (
              <li key={t.id} className={[styles.row, t.status === 'planned' ? styles.planned : ''].join(' ')}>
                <span className={['num', styles.date].join(' ')}>{formatDateCompact(t.date)}</span>
                <span className={styles.label} title={t.label}>
                  {displayLabel(t)}
                  {t.status === 'planned' ? <span className={styles.plannedTag}> · prévue</span> : null}
                </span>
                <Amount cents={-t.amount} tone="neutral" className={styles.amount} />
              </li>
            ))}
          </ul>
        </>
      )}

      <ButtonLink to={`/operations?${params}`} variant="ghost" icon={<ArrowRight />} className={styles.more}>
        Voir dans Opérations
      </ButtonLink>
    </div>
  );
}
