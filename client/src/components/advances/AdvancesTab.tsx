import { ChevronDown, HandCoins, Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdvanceSuggestionView, AdvanceView, PersonAdvancesSummary } from '@shared/api-types';
import { addMonths, formatDateLong, today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import type { Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useAdvancePeople, useAdvances, useAdvanceSuggestions, useEnvelopes, useSettleAdvances, useTransactions, useUpdateTransaction } from '@/api/hooks';
import { Amount, Button, EmptyState, ErrorState, GroupLabel, InlinePill, ListRow, ListRowSkeleton, SectionHeader, listRowDate, useToast } from '@/components/ui';
import { formatDateCompact } from '@/lib/format';
import styles from './AdvancesTab.module.css';

/** Nombre de mois de revenus sans enveloppe proposés au rangement manuel. */
const UNSORTED_INCOME_MONTHS = 6;

/** Vue « Avances » des Opérations : qui doit de l'argent, rapprochements proposés, remboursements passés à ranger. */
export function AdvancesTab() {
  const people = useAdvancePeople();
  const openAdvances = useAdvances('open');
  const suggestions = useAdvanceSuggestions();
  const envelopes = useEnvelopes();
  const since = addMonths(today(), -UNSORTED_INCOME_MONTHS);
  const incomes = useTransactions({ kind: 'income', status: 'confirmed', from: since, limit: 1000 });

  const suggestedIds = useMemo(() => new Set((suggestions.data ?? []).map((s) => s.incomeId)), [suggestions.data]);
  const unsortedIncomes = (incomes.data ?? []).filter((t) => t.envelopeId === null && !suggestedIds.has(t.id));

  const loading = people.isPending || suggestions.isPending || incomes.isPending;
  const error = people.error ?? suggestions.error ?? incomes.error;
  const nothing = !loading && !error && people.data?.length === 0 && (suggestions.data ?? []).length === 0 && unsortedIncomes.length === 0;

  if (loading) return <ListRowSkeleton rows={3} meta={false} actions />;
  if (error) return <ErrorState title="Impossible de charger les avances" description={errorMessage(error)} onRetry={() => { void people.refetch(); void suggestions.refetch(); void incomes.refetch(); }} />;
  if (nothing) {
    return (
      <EmptyState
        icon={<HandCoins />}
        title="Aucune avance en cours"
        description="Avance pour d’autres sur une dépense, puis range les remboursements ici quand ils arrivent."
      />
    );
  }

  return (
    <div className={styles.wrap}>
      {people.data && people.data.length > 0 ? <PeopleSection people={people.data} openAdvances={openAdvances.data ?? []} /> : null}
      {suggestions.data && suggestions.data.length > 0 ? <SuggestionsSection suggestions={suggestions.data} /> : null}
      {unsortedIncomes.length > 0 ? <UnsortedIncomeSection incomes={unsortedIncomes} envelopes={envelopes.data ?? []} /> : null}
    </div>
  );
}

function PeopleSection({ people, openAdvances }: { people: PersonAdvancesSummary[]; openAdvances: AdvanceView[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(person: string) {
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(person)) next.delete(person);
      else next.add(person);
      return next;
    });
  }

  return (
    <section aria-labelledby="advances-people-title">
      <SectionHeader id="advances-people-title" title="Qui doit de l’argent" />
      <ul className="ledger stagger">
        {people.map((p) => {
          const isOpen = expanded.has(p.person);
          const lines = openAdvances.filter((a) => a.person === p.person);
          return (
            <li key={p.person}>
              <ListRow
                as="div"
                onClick={() => toggle(p.person)}
                clickLabel={`${isOpen ? 'Replier' : 'Déplier'} les avances de ${p.person}`}
                title={p.person}
                meta={`Depuis le ${formatDateLong(p.oldestOpenDate.slice(0, 10))}`}
                trail={<Amount cents={p.totalOpen} tone="neutral" />}
                actions={<ChevronDown aria-hidden className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')} />}
              />
              {isOpen ? (
                <ul className={[styles.subList, 'ledger'].join(' ')}>
                  {lines.map((a) => (
                    <ListRow
                      key={a.id}
                      compact
                      lead={<span className={listRowDate}>{formatDateCompact(a.expense.date)}</span>}
                      title={a.expense.label}
                      meta={a.expense.envelopeName ?? undefined}
                      trail={<Amount cents={a.amount} tone="neutral" />}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** « Bowling du 26 juillet et Ciné du 2 août » : les dépenses couvertes par une proposition. */
function describeExpenses(expenses: AdvanceSuggestionView['expenses']): string {
  return expenses.map((e) => `${e.label} du ${formatDateLong(e.date)}`).join(' et ');
}

function SuggestionsSection({ suggestions }: { suggestions: AdvanceSuggestionView[] }) {
  const settle = useSettleAdvances();
  const toast = useToast();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const visible = suggestions.filter((s) => !dismissed.has(s.incomeId));
  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="advances-suggestions-title">
      <SectionHeader id="advances-suggestions-title" title="Rapprochements proposés" />
      <ul className="ledger stagger">
        {visible.map((s) => (
          <ListRow
            key={s.incomeId}
            as="div"
            lead={<Link2 aria-hidden />}
            title={
              <>
                {s.person} doit {formatEuros(s.amount)} pour {describeExpenses(s.expenses)}
              </>
            }
            meta={`${s.incomeLabel} · ${formatDateCompact(s.incomeDate)}`}
            actions={
              <>
                <Button variant="ghost" size="sm" onClick={() => setDismissed((d) => new Set(d).add(s.incomeId))}>
                  Ignorer
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={settle.isPending && settle.variables?.refundId === s.incomeId}
                  onClick={() =>
                    settle.mutate(
                      { advanceIds: s.advanceIds, refundId: s.incomeId },
                      {
                        onSuccess: () => toast.success(`Revenu rapproché de l’avance de ${s.person}`),
                        onError: (e) => toast.error(errorMessage(e)),
                      },
                    )
                  }
                >
                  Rapprocher
                </Button>
              </>
            }
          />
        ))}
      </ul>
    </section>
  );
}

function UnsortedIncomeSection({ incomes, envelopes }: { incomes: Transaction[]; envelopes: { id: number; name: string; color: string }[] }) {
  const update = useUpdateTransaction();
  const toast = useToast();

  function assign(t: Transaction, envelopeId: number) {
    update.mutate(
      { id: t.id, kind: t.kind, date: t.date, amount: t.amount, label: t.label, accountId: t.accountId, toAccountId: t.toAccountId, envelopeId, fromEnvelopeId: t.fromEnvelopeId, note: t.note },
      { onSuccess: () => toast.success('Remboursement rangé'), onError: (e) => toast.error(errorMessage(e)) },
    );
  }

  return (
    <section aria-labelledby="advances-unsorted-title">
      <SectionHeader id="advances-unsorted-title" title={`Revenus des ${UNSORTED_INCOME_MONTHS} derniers mois sans enveloppe`} />
      <GroupLabel as="p">Pour ranger vite un remboursement passé.</GroupLabel>
      <ul className="ledger stagger">
        {incomes.map((t) => (
          <ListRow
            key={t.id}
            compact
            lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}
            title={t.label}
            trail={<Amount cents={t.amount} tone="neutral" />}
            actions={
              <InlinePill
                aria-label={`Enveloppe pour ${t.label}`}
                value={null}
                placeholder="+ Enveloppe"
                options={envelopes.map((env) => ({ value: env.id, label: env.name, color: env.color }))}
                onChange={(v) => v !== null && assign(t, v)}
                disabled={update.isPending && update.variables?.id === t.id}
              />
            }
          />
        ))}
      </ul>
    </section>
  );
}
