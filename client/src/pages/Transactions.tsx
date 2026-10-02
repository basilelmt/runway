import { ArrowLeftRight } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useAccounts, useConfirmTransaction, useEnvelopes, useTransactions } from '@/api/hooks';
import { PageHeader } from '@/components/layout/PageHeader';
import { TransactionEditDialog } from '@/components/transactions/TransactionEditDialog';
import { filtersFromParams, filtersToParams, toApiFilter, TransactionFilters, type FiltersState } from '@/components/transactions/TransactionFilters';
import { TransactionRow } from '@/components/transactions/TransactionRow';
import { signedAmount } from '@/components/transactions/signed';
import { Amount, EmptyState, SkeletonRows, useToast } from '@/components/ui';
import { plural, relativeDay } from '@/lib/format';
import styles from './Transactions.module.css';

export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const setFilters = useCallback((next: FiltersState) => setParams(filtersToParams(next), { replace: true }), [setParams]);

  const accounts = useAccounts(true);
  const envelopes = useEnvelopes(true);
  const transactions = useTransactions(toApiFilter(filters));
  const toast = useToast();
  const confirm = useConfirmTransaction({ onSuccess: () => toast.success('Opération confirmée'), onError: (e) => toast.error(errorMessage(e)) });
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accountMap = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const envelopeMap = useMemo(() => new Map((envelopes.data ?? []).map((e) => [e.id, e])), [envelopes.data]);

  const groups = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const t of transactions.data ?? []) {
      const list = byDay.get(t.date) ?? [];
      list.push(t);
      byDay.set(t.date, list);
    }
    return [...byDay.entries()];
  }, [transactions.data]);

  const total = useMemo(
    () => (transactions.data ?? []).filter((t) => t.kind !== 'allocation' && t.status === 'confirmed').reduce((s, t) => s + signedAmount(t, filters.account), 0),
    [transactions.data, filters.account],
  );

  return (
    <div className="page">
      <PageHeader
        title="Opérations"
        subtitle={
          transactions.data ? (
            <>
              {plural(transactions.data.length, 'opération')}, net <Amount cents={total} tone="always" />
            </>
          ) : undefined
        }
      />

      <TransactionFilters value={filters} onChange={setFilters} accounts={(accounts.data ?? []).filter((a) => !a.archived)} envelopes={(envelopes.data ?? []).filter((e) => !e.archived)} />

      {transactions.isPending ? (
        <SkeletonRows rows={6} />
      ) : transactions.error ? (
        <p className={styles.error} role="alert">
          {errorMessage(transactions.error)}
        </p>
      ) : groups.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight />} title="Aucune opération" description="Rien sur cette période avec ces filtres. Appuie sur n pour en saisir une." />
      ) : (
        <div className={styles.groups}>
          {groups.map(([date, list]) => (
            <section key={date} className={styles.group}>
              <h2 className={styles.day}>{relativeDay(date)}</h2>
              <ul className={['ledger', styles.list].join(' ')}>
                {list.map((t) => (
                  <TransactionRow
                    key={t.id}
                    transaction={t}
                    accounts={accountMap}
                    envelopes={envelopeMap}
                    viewAccountId={filters.account}
                    onClick={() => setEditing(t)}
                    onConfirm={() => confirm.mutate(t.id)}
                    confirming={confirm.isPending && confirm.variables === t.id}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TransactionEditDialog transaction={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
