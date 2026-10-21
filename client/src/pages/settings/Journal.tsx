import { ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useAccounts, useEnvelopes, useTransactions } from '@/api/hooks';
import { TransactionEditDialog } from '@/components/transactions/TransactionEditDialog';
import { TransactionRow } from '@/components/transactions/TransactionRow';
import { EmptyState, ErrorState, GroupLabel, ListRowSkeleton, SectionHeader } from '@/components/ui';
import { relativeDay } from '@/lib/format';
import styles from './Journal.module.css';

/** Les répartitions entre enveloppes : elles ne touchent aucun compte, donc restent hors de la page Opérations. */
export function JournalSettings() {
  const accounts = useAccounts(true);
  const envelopes = useEnvelopes(true);
  const allocations = useTransactions({ kind: 'allocation' });
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accountMap = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const envelopeMap = useMemo(() => new Map((envelopes.data ?? []).map((e) => [e.id, e])), [envelopes.data]);

  const groups = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const t of allocations.data ?? []) {
      const list = byDay.get(t.date) ?? [];
      list.push(t);
      byDay.set(t.date, list);
    }
    return [...byDay.entries()];
  }, [allocations.data]);

  return (
    <div className={styles.page}>
      <SectionHeader
        title="Journal des répartitions"
        description="L’argent déplacé d’une enveloppe à l’autre : budgets du mois, répartitions automatiques et déplacements. Rien ne bouge sur tes comptes, c’est pour ça qu’elles ne sont pas dans Opérations."
      />
      {allocations.isPending ? (
        <ListRowSkeleton rows={6} />
      ) : allocations.error ? (
        <ErrorState title="Impossible de charger le journal" description={errorMessage(allocations.error)} onRetry={() => allocations.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="Aucune répartition" description="Les budgets et déplacements entre enveloppes apparaîtront ici." />
      ) : (
        <div className={styles.groups}>
          {groups.map(([date, list]) => (
            <section key={date}>
              <GroupLabel as="h3">{relativeDay(date)}</GroupLabel>
              <ul className="ledger">
                {list.map((t) => (
                  <TransactionRow key={t.id} transaction={t} accounts={accountMap} envelopes={envelopeMap} onClick={() => setEditing(t)} />
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
