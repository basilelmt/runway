import { Pencil } from 'lucide-react';
import { CARD_DEBIT_MAX_DELAY_DAYS, effectiveDate } from '@core/payment-date';
import { addDays, formatDateShort, formatDateWithWeekday, formatMonth, monthKey } from '@shared/dates';
import { formatEuros } from '@shared/money';
import type { Transaction } from '@shared/schemas';
import { useAccountMap, useEnvelopeMap, useMerchant, useTransactions } from '@/api/hooks';
import { Amount, Badge, Button, EnvelopeTag, GroupLabel, listRowDate } from '@/components/ui';
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
  const accounts = useAccountMap();
  const envelopes = useEnvelopeMap();
  const merchant = useMerchant(t.merchantKey);
  const history = useTransactions({ merchant: t.merchantKey ?? undefined, limit: 6 }, { enabled: t.merchantKey !== null });
  // Une carte est débitée quelques jours après l'achat : « le même jour » est celui de l'achat.
  const day = effectiveDate(t);
  // Les deux dates ne valent d'être montrées que si elles diffèrent.
  const paidOn = day !== t.date ? day : null;
  const sameDay = useTransactions({ from: day, to: addDays(day, CARD_DEBIT_MAX_DELAY_DAYS), status: 'confirmed', excludeAllocations: true });

  const others = (list: Transaction[] | undefined) => (list ?? []).filter((x) => x.id !== t.id);
  // Le même jour, la date se répéterait sur chaque ligne : seul l'historique du marchand la montre.
  const row = (x: Transaction, withDate = true) => (
    <TransactionRow
      key={x.id}
      transaction={x}
      accounts={accounts}
      envelopes={envelopes}
      lead={withDate ? <span className={listRowDate}>{formatDateCompact(effectiveDate(x))}</span> : undefined}
      onClick={() => onOpen(x)}
    />
  );

  const amount = signedAmount(t);
  const account = t.accountId != null ? accounts.get(t.accountId) : undefined;
  const toAccount = t.toAccountId != null ? accounts.get(t.toAccountId) : undefined;
  const where = t.kind === 'transfer' ? `${account?.name ?? '?'} → ${toAccount?.name ?? '?'}` : account?.name ?? '';
  const envelope = t.envelopeId != null ? envelopes.get(t.envelopeId) : undefined;
  // Une dépense, ou un revenu rangé (remboursement), montre son enveloppe comme dans les listes.
  const envelopeBadge =
    t.kind === 'expense' || (t.kind === 'income' && envelope) ? envelope ? <EnvelopeTag name={envelope.name} color={envelope.color} /> : <Badge tone="marking">À ranger</Badge> : null;

  const merchantHistory = others(history.data);
  const sameDayList = others(sameDay.data).filter((x) => effectiveDate(x) === day);

  return (
    <div className={styles.sheet}>
      <div className={styles.header}>
        <div className={styles.info}>
          <Amount cents={amount} size="xl" tone={amount > 0 ? 'always' : 'neutral'} />
          <div className={styles.meta}>
            {paidOn ? (
              <span>
                Payé le {formatDateWithWeekday(paidOn)} · débité le {formatDateShort(t.date)}
              </span>
            ) : (
              <span>{formatDateWithWeekday(t.date)}</span>
            )}
            {where ? <span>{where}</span> : null}
            {envelopeBadge}
          </div>
        </div>
        <Button variant="secondary" icon={<Pencil />} onClick={onEdit} className={styles.editButton}>
          Modifier
        </Button>
      </div>

      {t.merchantKey ? <MerchantAbout merchantKey={t.merchantKey} /> : null}

      {merchant.data && merchant.data.transactionCount > 1 ? (
        <section aria-label="Chez ce marchand" className={styles.section}>
          <GroupLabel>Chez ce marchand</GroupLabel>
          <p className={styles.sectionMeta}>
            {plural(merchant.data.transactionCount, 'passage')} depuis {formatMonth(monthKey(merchant.data.firstDate ?? t.date)).toLowerCase()} ·{' '}
            {formatEuros(Math.abs(merchant.data.total12Months))} sur 12 mois
          </p>
          {merchantHistory.length > 0 ? <ul className="ledger">{merchantHistory.slice(0, 5).map((x) => row(x))}</ul> : null}
        </section>
      ) : null}

      {sameDayList.length > 0 ? (
        <section aria-label="Le même jour" className={styles.section}>
          <GroupLabel>Le même jour</GroupLabel>
          <ul className="ledger">{sameDayList.map((x) => row(x, false))}</ul>
        </section>
      ) : null}

      <section aria-label="Détails bancaires" className={styles.section}>
        <GroupLabel>Détails bancaires</GroupLabel>
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
