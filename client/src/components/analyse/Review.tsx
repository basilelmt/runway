import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { MonthReview, ReviewProposal, ReviewRemainder } from '@shared/api-types';
import type { AppliedReview } from '@shared/schemas';
import { addMonths, endOfMonth, formatDateLong, formatMonth, monthKey, startOfMonth, today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useApplyReview, useCancelReview, useEnvelopes, useReview } from '@/api/hooks';
import { useAsk } from '@/components/ask/ask-context';
import { operationsHref } from '@/components/transactions/TransactionFilters';
import {
  Amount,
  Button,
  Checkbox,
  Dot,
  EmptyState,
  ErrorState,
  FieldError,
  InlinePill,
  KeyFigure,
  ListRow,
  ListRowSkeleton,
  MoneyInput,
  Notice,
  SectionHeader,
  Stat,
  StatGroup,
  useToast,
} from '@/components/ui';
import { plural } from '@/lib/format';
import { askTarget } from '@/components/ask/ask-target';
import styles from './Review.module.css';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mois précédent, celui proposé par défaut : on ne peut pas aller au-delà. */
function lastMonth(): string {
  return monthKey(addMonths(today(), -1));
}

/** Onglet « Bilan » d’Analyse : chiffres d’un mois passé, propositions de budget, restes à verser. */
export function Review() {
  const [params, setParams] = useSearchParams();
  const max = lastMonth();
  const month = params.get('mois') ?? max;
  const setMonth = (m: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('vue', 'bilan');
        next.set('mois', m);
        return next;
      },
      { replace: true },
    );

  const review = useReview(month);

  return (
    <div className={styles.view}>
      <MonthPicker month={month} max={max} onChange={setMonth} />
      {review.isPending ? (
        <ListRowSkeleton rows={4} />
      ) : review.isError ? (
        <ErrorState title="Impossible de charger le bilan" description={errorMessage(review.error)} onRetry={() => review.refetch()} />
      ) : review.data.status.validated ? (
        <ValidatedReview key={month} month={month} review={review.data} />
      ) : (
        <EditableReview key={month} month={month} review={review.data} />
      )}
    </div>
  );
}

function MonthPicker({ month, max, onChange }: { month: string; max: string; onChange: (month: string) => void }) {
  return (
    <div className={styles.picker}>
      <Button size="sm" variant="ghost" icon={<ChevronLeft />} aria-label="Mois précédent" onClick={() => onChange(monthKey(addMonths(`${month}-01`, -1)))} />
      <span className={styles.pickerLabel}>{capitalize(formatMonth(month))}</span>
      <Button size="sm" variant="ghost" icon={<ChevronRight />} aria-label="Mois suivant" disabled={month >= max} onClick={() => onChange(monthKey(addMonths(`${month}-01`, 1)))} />
    </div>
  );
}

function MonthFigures({ month, figures }: { month: string; figures: MonthReview['figures'] }) {
  return (
    <KeyFigure
      label={`Dépensé en ${formatMonth(month)}`}
      figure={<Amount cents={figures.spent} size="xl" tone="neutral" />}
      aside={
        <StatGroup direction="column" divided>
          <Stat label="Revenus">
            <Amount cents={figures.income} size="lg" tone="neutral" />
          </Stat>
          <Stat label="Mis de côté">
            <Amount cents={figures.saved} size="lg" tone="neutral" />
          </Stat>
        </StatGroup>
      }
    />
  );
}

function EnvelopeList({ month, envelopes }: { month: string; envelopes: MonthReview['envelopes'] }) {
  const ask = useAsk();
  const navigate = useNavigate();
  const from = startOfMonth(`${month}-01`);
  const to = endOfMonth(`${month}-01`);

  if (envelopes.length === 0) return <EmptyState title="Aucune enveloppe à revoir ce mois-là" />;

  return (
    <section aria-labelledby="review-envelopes-title" {...askTarget('section', null, `Bilan de ${formatMonth(month)}`)}>
      <SectionHeader id="review-envelopes-title" title="Enveloppes" />
      <ul className="ledger">
        {envelopes.map((e) => (
          <ListRow
            key={e.envelopeId}
            data={askTarget('envelope', e.envelopeId, `${e.name} en ${formatMonth(month)}`)}
            onClick={() => navigate(operationsHref({ envelope: e.envelopeId, from, to }))}
            clickLabel={`Voir les opérations de ${e.name} en ${formatMonth(month)}`}
            lead={<Dot color={e.color} />}
            title={e.name}
            meta={`${formatEuros(e.spent)} sur ${formatEuros(e.budget)}`}
            trail={<Amount cents={Math.abs(e.gap)} tone="neutral" className={e.gap > 0 ? styles.over : e.gap < 0 ? styles.under : undefined} />}
            trailSub={e.gap > 0 ? 'dépassement' : e.gap < 0 ? 'de marge' : undefined}
            actions={
              e.gap > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<HelpCircle />}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    ask.setOpen(true);
                    ask.send(`Pourquoi ${e.name} a dépassé en ${formatMonth(month)} ?`);
                  }}
                >
                  Demander pourquoi
                </Button>
              ) : undefined
            }
          />
        ))}
      </ul>
    </section>
  );
}

type Accepted = Record<number, number>;

function ProposalsSection({
  proposals,
  control,
  accepted,
  onToggle,
  onChangeAmount,
}: {
  proposals: ReviewProposal[];
  control: MonthReview['control'];
  accepted: Accepted;
  onToggle: (envelopeId: number, checked: boolean, defaultAmount: number) => void;
  onChangeAmount: (envelopeId: number, amount: number | null) => void;
}) {
  const total = control.envelopes.reduce((sum, e) => {
    const extra = accepted[e.envelopeId];
    return sum + (extra !== undefined ? e.monthlyCharges + extra : e.monthlyBudget);
  }, 0);
  const over = total > control.medianIncome;

  return (
    <section aria-labelledby="review-proposals-title">
      <SectionHeader id="review-proposals-title" title="Budgets à ajuster" description="À partir de la médiane des dépenses courantes des 3 derniers mois." />
      <ul className={styles.proposals}>
        {proposals.map((p) => {
          const isAccepted = p.envelopeId in accepted;
          const amount = accepted[p.envelopeId] ?? p.proposedExtra;
          return (
            <li key={p.envelopeId} className={styles.proposalRow}>
              <Checkbox
                label={`Accepter pour ${p.name}`}
                hint={`${p.monthsSpent.map((c) => formatEuros(c)).join(', ')} sur ${plural(p.monthsSpent.length, 'mois', 'mois')}. Proposé ${formatEuros(p.proposedExtra)} au lieu de ${p.currentExtra ? formatEuros(p.currentExtra) : 'rien'}.`}
                checked={isAccepted}
                onChange={(e) => onToggle(p.envelopeId, e.target.checked, p.proposedExtra)}
              />
              <MoneyInput
                aria-label={`Nouveau complément de ${p.name}`}
                value={amount}
                disabled={!isAccepted}
                onChange={(c) => onChangeAmount(p.envelopeId, c)}
                className={styles.proposalInput}
              />
            </li>
          );
        })}
      </ul>
      <p className={[styles.control, over ? styles.over : ''].join(' ')} role={over ? 'alert' : undefined}>
        Budgets {formatEuros(total)} pour un revenu médian de {formatEuros(control.medianIncome)}
      </p>
    </section>
  );
}

type Transfers = Record<number, number | null>;

function RemaindersSection({
  month,
  remainders,
  savings,
  transfers,
  onToggle,
  onChangeTarget,
}: {
  month: string;
  remainders: ReviewRemainder[];
  savings: { id: number; name: string; color: string }[];
  transfers: Transfers;
  onToggle: (envelopeId: number, verser: boolean) => void;
  onChangeTarget: (envelopeId: number, toEnvelopeId: number | null) => void;
}) {
  return (
    <section aria-labelledby="review-remainders-title">
      <SectionHeader id="review-remainders-title" title="Restes" description={`Ce qui restait fin ${formatMonth(month)} et que tu peux mettre de côté.`} />
      <ul className={styles.proposals}>
        {remainders.map((r) => {
          const verser = r.envelopeId in transfers;
          return (
            <li key={r.envelopeId} className={styles.remainderRow}>
              <Checkbox
                label={`Verser le reste de ${r.name} (${formatEuros(r.amount)})`}
                checked={verser}
                onChange={(e) => onToggle(r.envelopeId, e.target.checked)}
              />
              {verser ? (
                <InlinePill
                  aria-label={`Enveloppe d’épargne pour le reste de ${r.name}`}
                  value={transfers[r.envelopeId] ?? null}
                  onChange={(v) => onChangeTarget(r.envelopeId, v)}
                  options={savings.map((s) => ({ value: s.id, label: s.name, color: s.color }))}
                  placeholder="Choisir une épargne"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EditableReview({ month, review }: { month: string; review: MonthReview }) {
  const toast = useToast();
  const envelopesQuery = useEnvelopes(true);
  const savings = (envelopesQuery.data ?? []).filter((e) => e.isSavings && !e.archived);

  // Montée avec `key={month}` par l’appelant : change de mois, état reparti à zéro.
  const [accepted, setAccepted] = useState<Accepted>({});
  const [transfers, setTransfers] = useState<Transfers>({});

  const cancel = useCancelReview(month, { onError: (e) => toast.error(errorMessage(e)) });
  const apply = useApplyReview(month, {
    onSuccess: () => toast.success('Bilan validé', { label: 'Annuler', onClick: () => cancel.mutate() }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  function toggleProposal(envelopeId: number, checked: boolean, defaultAmount: number) {
    setAccepted((a) => {
      if (!checked) {
        const { [envelopeId]: _omit, ...rest } = a;
        return rest;
      }
      return { ...a, [envelopeId]: defaultAmount };
    });
  }

  function toggleTransfer(envelopeId: number, verser: boolean) {
    setTransfers((t) => {
      if (!verser) {
        const { [envelopeId]: _omit, ...rest } = t;
        return rest;
      }
      return { ...t, [envelopeId]: savings.length === 1 ? savings[0]!.id : null };
    });
  }

  function submit() {
    const budgets = Object.entries(accepted).map(([id, amount]) => ({ envelopeId: Number(id), monthlyExtra: amount > 0 ? amount : null }));
    const transferEntries = Object.entries(transfers).filter((entry): entry is [string, number] => entry[1] !== null);
    const transferList = transferEntries.map(([id, toEnvelopeId]) => ({
      fromEnvelopeId: Number(id),
      toEnvelopeId,
      amount: review.remainders!.find((r) => r.envelopeId === Number(id))!.amount,
    }));
    apply.mutate({ budgets, transfers: transferList });
  }

  return (
    <>
      <MonthFigures month={month} figures={review.figures} />
      <EnvelopeList month={month} envelopes={review.envelopes} />
      {review.proposals.length > 0 ? (
        <ProposalsSection
          proposals={review.proposals}
          control={review.control}
          accepted={accepted}
          onToggle={toggleProposal}
          onChangeAmount={(id, amount) => setAccepted((a) => ({ ...a, [id]: amount ?? 0 }))}
        />
      ) : null}
      {review.remainders && review.remainders.length > 0 ? (
        <RemaindersSection
          month={month}
          remainders={review.remainders}
          savings={savings}
          transfers={transfers}
          onToggle={toggleTransfer}
          onChangeTarget={(id, to) => setTransfers((t) => ({ ...t, [id]: to }))}
        />
      ) : null}
      <FieldError>{apply.error ? errorMessage(apply.error) : null}</FieldError>
      <Button variant="primary" onClick={submit} loading={apply.isPending} className={styles.submit}>
        Valider le bilan
      </Button>
    </>
  );
}

function appliedSummary(applied: AppliedReview): string {
  const budgets = applied.budgets.length;
  const transfers = applied.allocationIds.length;
  const parts = [budgets > 0 ? plural(budgets, 'complément modifié', 'compléments modifiés') : null, transfers > 0 ? plural(transfers, 'versement') : null];
  const text = parts.filter(Boolean).join(', ');
  return text || 'Rien à appliquer';
}

function ValidatedReview({ month, review }: { month: string; review: MonthReview }) {
  const toast = useToast();
  const cancel = useCancelReview(month, {
    onSuccess: ({ skipped }) =>
      toast.success(skipped.length > 0 ? `Bilan annulé ; ${plural(skipped.length, 'complément modifié depuis')} conservé` : 'Bilan annulé'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const applied = review.status.applied!;

  return (
    <>
      <Notice tone="neutral">
        Bilan validé le {formatDateLong(review.status.reviewedAt!.slice(0, 10))} · {appliedSummary(applied)}.
      </Notice>
      <MonthFigures month={month} figures={review.figures} />
      <EnvelopeList month={month} envelopes={review.envelopes} />
      <FieldError>{cancel.error ? errorMessage(cancel.error) : null}</FieldError>
      <Button variant="danger-quiet" onClick={() => cancel.mutate()} loading={cancel.isPending} className={styles.submit}>
        Annuler ce bilan
      </Button>
    </>
  );
}

