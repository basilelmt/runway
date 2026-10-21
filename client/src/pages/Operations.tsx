import { ArrowLeftRight, Upload } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useAccounts, useAdvancePeople, useAdvances, useConfirmTransaction, useEnvelopes, useOverview, useTransactions } from '@/api/hooks';
import { AdvancesTab } from '@/components/advances/AdvancesTab';
import { PageHeader } from '@/components/layout/PageHeader';
import { useQuickAdd } from '@/components/layout/quick-add-context';
import { TransactionEditDialog } from '@/components/transactions/TransactionEditDialog';
import { filtersFromParams, filtersToParams, toApiFilter, TransactionFilters, type FiltersState } from '@/components/transactions/TransactionFilters';
import { TransactionRow } from '@/components/transactions/TransactionRow';
import { UnsortedList } from '@/components/transactions/UnsortedList';
import { signedAmount } from '@/components/transactions/signed';
import { Button, ButtonLink, EmptyState, ErrorState, GroupLabel, ListRowSkeleton, Tabs, Total, useToast } from '@/components/ui';
import { plural, relativeDay } from '@/lib/format';
import styles from './Operations.module.css';

type View = 'toutes' | 'a-ranger' | 'avances';

export function OperationsPage() {
  const [params, setParams] = useSearchParams();
  const overview = useOverview();
  const people = useAdvancePeople();
  const raw = params.get('vue');
  const view: View = raw === 'a-ranger' || raw === 'avances' ? raw : 'toutes';
  const unsorted = overview.data?.unsortedCount ?? 0;
  const owing = people.data?.length ?? 0;

  return (
    <div className="page">
      <PageHeader
        title="Opérations"
        subtitle="Tout ce qui passe sur tes comptes. La synchronisation bancaire les ajoute toute seule."
        actions={
          <ButtonLink to="/operations/importer" icon={<Upload />}>
            Importer un relevé
          </ButtonLink>
        }
      />
      <div className={styles.body}>
        <Tabs<View>
          label="Vue des opérations"
          value={view}
          onChange={(v) => setParams(v === 'toutes' ? {} : { vue: v }, { replace: true })}
          items={[
            { value: 'toutes', label: 'Toutes' },
            { value: 'a-ranger', label: 'À ranger', count: unsorted },
            { value: 'avances', label: 'Avances', count: owing },
          ]}
        />
        {view === 'a-ranger' ? <UnsortedList /> : view === 'avances' ? <AdvancesTab /> : <AllTransactions />}
      </div>
    </div>
  );
}

function AllTransactions() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const setFilters = useCallback((next: FiltersState) => setParams(filtersToParams(next), { replace: true }), [setParams]);
  const openQuickAdd = useQuickAdd();

  const accounts = useAccounts(true);
  const envelopes = useEnvelopes(true);
  // Seulement ce qui s'est passé sur les comptes : les répartitions entre enveloppes sont dans Réglages › Journal.
  const transactions = useTransactions({ ...toApiFilter(filters), excludeAllocations: true });
  const openAdvances = useAdvances('open');
  const toast = useToast();
  const confirm = useConfirmTransaction({ onSuccess: () => toast.success('Opération confirmée'), onError: (e) => toast.error(errorMessage(e)) });
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accountMap = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const envelopeMap = useMemo(() => new Map((envelopes.data ?? []).map((e) => [e.id, e])), [envelopes.data]);
  const advanceExpenseIds = useMemo(() => new Set((openAdvances.data ?? []).map((a) => a.expense.id)), [openAdvances.data]);

  const visible = useMemo(() => transactions.data ?? [], [transactions.data]);

  const groups = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const t of visible) {
      const list = byDay.get(t.date) ?? [];
      list.push(t);
      byDay.set(t.date, list);
    }
    return [...byDay.entries()];
  }, [visible]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of visible) {
      if (t.status !== 'confirmed') continue;
      const s = signedAmount(t, filters.account);
      if (s > 0) income += s;
      else expense -= s;
    }
    return { income, expense };
  }, [visible, filters.account]);

  return (
    <div className={styles.all}>
      <TransactionFilters value={filters} onChange={setFilters} accounts={(accounts.data ?? []).filter((a) => !a.archived)} envelopes={(envelopes.data ?? []).filter((e) => !e.archived)} />

      {visible.length > 0 ? (
        <p className={styles.summary}>
          {plural(visible.length, 'opération')}
          <Total label="Entrées" cents={totals.income} />
          <Total label="Sorties" cents={totals.expense} />
        </p>
      ) : null}

      {transactions.isPending ? (
        <ListRowSkeleton rows={8} />
      ) : transactions.error ? (
        <ErrorState title="Impossible de charger les opérations" description={errorMessage(transactions.error)} onRetry={() => transactions.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight />}
          title="Aucune opération"
          description="Rien sur cette période avec ces filtres."
          action={
            <Button variant="secondary" onClick={openQuickAdd}>
              Saisir une opération
            </Button>
          }
        />
      ) : (
        <div className={[styles.groups, 'stagger'].join(' ')}>
          {groups.map(([date, list]) => (
            <section key={date} className={styles.group}>
              <GroupLabel as="h2">{relativeDay(date)}</GroupLabel>
              <ul className="ledger stagger">
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
                    hasOpenAdvance={advanceExpenseIds.has(t.id)}
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
