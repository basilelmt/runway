import { Pencil } from 'lucide-react';
import { useMemo } from 'react';
import { formatDateWithWeekday, formatMonth, monthKey } from '@shared/dates';
import { formatEuros } from '@shared/money';
import type { Transaction } from '@shared/schemas';
import { useAccounts, useEnvelopes, useMerchant, useTransactions } from '@/api/hooks';
import { Amount, Badge, Button, EnvelopeTag, listRowDate } from '@/components/ui';
import { formatDateCompact, plural } from '@/lib/format';
import { repeatsLabel } from '@/lib/merchants';
import { signedAmount } from './signed';
import { MerchantAbout } from './MerchantAbout';
import { TransactionRow } from './TransactionRow';
import styles from './TransactionSheet.module.css';

type TransactionSheetProps = {
  transaction: Transaction;
  onEdit: () => void;
  onOpen: (t: Transaction) => void;
};

/** Fiche de consultation d'une opération : de quoi se souvenir de ce qu'on a fait de son argent. */
export function TransactionSheet({ transaction: t, onEdit, onOpen }: TransactionSheetProps) {
  const accountList = useAccounts();
  const envelopeList = useEnvelopes();
  const accounts = useMemo(() => new Map((accountList.data ?? []).map((a) => [a.id, a])), [accountList.data]);
  const envelopes = useMemo(() => new Map((envelopeList.data ?? []).map((e) => [e.id, e])), [envelopeList.data]);
  const merchant = useMerchant(t.merchantKey);
  const history = useTransactions({ merchant: t.merchantKey ?? undefined, limit: 6 }, { enabled: t.merchantKey !== null });
  const sameDay = useTransactions({ from: t.date, to: t.date, status: 'confirmed' });

  const others = (list: Transaction[] | undefined) => (list ?? []).filter((x) => x.id !== t.id);
  const row = (x: Transaction) => (
    <TransactionRow
      key={x.id}
      transaction={x}
      accounts={accounts}
      envelopes={envelopes}
      lead={<span className={listRowDate}>{formatDateCompact(x.date)}</span>}
      clickVerb="Ouvrir"
      onClick={() => onOpen(x)}
    />
  );

  const amount = signedAmount(t);
  const account = t.accountId != null ? accounts.get(t.accountId) : undefined;
  const toAccount = t.toAccountId != null ? accounts.get(t.toAccountId) : undefined;
  const where = t.kind === 'transfer' ? `${account?.name ?? '?'} → ${toAccount?.name ?? '?'}` : account?.name ?? '';
  const envelope = t.envelopeId != null ? envelopes.get(t.envelopeId) : undefined;
  const isReimbursement = t.kind === 'income' && envelope != null;

  const merchantHistory = others(history.data);
  const sameDayList = others(sameDay.data).filter((x) => x.kind !== 'allocation');

  return (
    <div className={styles.sheet}>
      <div className={styles.header}>
        <div className={styles.info}>
          <Amount cents={amount} size="xl" tone={amount > 0 ? 'always' : 'neutral'} />
          <div className={styles.meta}>
            <span>{formatDateWithWeekday(t.date)}</span>
            {where ? <span>{where}</span> : null}
            {t.kind === 'expense' || isReimbursement ? envelope ? <EnvelopeTag name={envelope.name} color={envelope.color} /> : <Badge tone="marking">À ranger</Badge> : null}
          </div>
        </div>
        <Button variant="secondary" icon={<Pencil />} onClick={onEdit} className={styles.editButton}>
          Modifier
        </Button>
      </div>

      {t.merchantKey ? <MerchantAbout merchantKey={t.merchantKey} /> : null}

      {merchant.data && merchant.data.transactionCount > 1 ? (
        <section aria-label="Chez ce marchand" className={styles.section}>
          <h3 className={styles.sectionTitle}>Chez ce marchand</h3>
          <p className={styles.sectionMeta}>
            {plural(merchant.data.transactionCount, 'passage')} depuis {formatMonth(monthKey(merchant.data.firstDate ?? t.date)).toLowerCase()} ·{' '}
            {formatEuros(Math.abs(merchant.data.total12Months))} sur 12 mois
          </p>
          {merchantHistory.length > 0 ? <ul className="ledger">{merchantHistory.slice(0, 5).map(row)}</ul> : null}
        </section>
      ) : null}

      {sameDayList.length > 0 ? (
        <section aria-label="Le même jour" className={styles.section}>
          <h3 className={styles.sectionTitle}>Le même jour</h3>
          <ul className="ledger">{sameDayList.map(row)}</ul>
        </section>
      ) : null}

      <section aria-label="Détails bancaires" className={styles.section}>
        <h3 className={styles.sectionTitle}>Détails bancaires</h3>
        <dl className={styles.details}>
          <div className={styles.detailsRow}>
            <dt>Libellé de la banque</dt>
            <dd>{t.label}</dd>
          </div>
          {t.note && !repeatsLabel(t.note, t.label) ? (
            <div className={styles.detailsRow}>
              <dt>Note</dt>
              <dd>{t.note}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
