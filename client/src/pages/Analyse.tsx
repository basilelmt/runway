import { BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { SpendingReport } from '@shared/api-types';
import { addMonths, endOfMonth, startOfMonth, today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useEnvelopes, useMonthly, useNetWorth, useSpending, useTransactions } from '@/api/hooks';
import { Upcoming } from '@/components/analyse/Upcoming';
import { MonthlyBars } from '@/components/charts/MonthlyBars';
import { NetWorthLine } from '@/components/charts/NetWorthLine';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Amount,
  Badge,
  DateRangeField,
  Dot,
  EmptyState,
  EnvelopeTag,
  ErrorState,
  KeyFigure,
  keyFigureValue,
  ListRow,
  ListRowSkeleton,
  listRowDate,
  ProgressBar,
  SectionHeader,
  Segmented,
  Skeleton,
  Stat,
  StatGroup,
  Tabs,
} from '@/components/ui';
import { formatDateCompact, formatDateLong } from '@/lib/format';
import { displayLabel } from '@/lib/merchants';
import { useCountUp } from '@/lib/motion';
import styles from './Analyse.module.css';

type View = 'depenses' | 'evolution' | 'a-venir';
type Preset = 'month' | 'last' | 'quarter' | 'year' | 'custom';

const VIEWS: { value: View; label: string }[] = [
  { value: 'depenses', label: 'Où part l’argent' },
  { value: 'evolution', label: 'Évolution' },
  { value: 'a-venir', label: 'À venir' },
];

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'month', label: 'Ce mois' },
  { value: 'last', label: 'Mois dernier' },
  { value: 'quarter', label: '3 mois' },
  { value: 'year', label: 'Cette année' },
  { value: 'custom', label: 'Dates' },
];

const TOP_EXPENSES = 8;

/** Période d'un preset et nombre de mois entiers couverts (pour comparer au budget mensuel). */
export function periodFor(preset: Preset, now: string): { from: string; to: string; months: number | null } {
  switch (preset) {
    case 'month':
      return { from: startOfMonth(now), to: endOfMonth(now), months: 1 };
    case 'last': {
      const prev = addMonths(startOfMonth(now), -1);
      return { from: prev, to: endOfMonth(prev), months: 1 };
    }
    case 'quarter':
      return { from: startOfMonth(addMonths(now, -2)), to: endOfMonth(now), months: 3 };
    case 'year':
      return { from: `${now.slice(0, 4)}-01-01`, to: endOfMonth(now), months: Number(now.slice(5, 7)) };
    case 'custom':
      return { from: startOfMonth(now), to: now, months: null };
  }
}

export function AnalysePage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('vue');
  const view: View = raw === 'evolution' || raw === 'a-venir' ? raw : 'depenses';

  return (
    <div className="page">
      <PageHeader title="Analyse" subtitle="Où part ton argent, ce que tu mets de côté, et ce qui arrive." />
      <div className={styles.body}>
        <Tabs<View> label="Vues de l’analyse" value={view} onChange={(v) => setParams(v === 'depenses' ? {} : { vue: v }, { replace: true })} items={VIEWS} />
        {view === 'depenses' ? <Spending /> : view === 'evolution' ? <Evolution /> : <Upcoming />}
      </div>
    </div>
  );
}

function Spending() {
  const now = today();
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState(() => periodFor('custom', now));
  const period = preset === 'custom' ? { ...custom, months: null } : periodFor(preset, now);
  const valid = period.from <= period.to;

  const spending = useSpending(valid ? period.from : undefined, valid ? period.to : undefined);

  return (
    <div className={styles.view}>
      <div className={styles.periodBar}>
        <Segmented label="Période" value={preset} onChange={setPreset} options={PRESETS} />
        {preset === 'custom' ? (
          <DateRangeField
            variant="pill"
            aria-label="Période personnalisée"
            from={custom.from}
            to={custom.to}
            onChange={({ from, to }) => setCustom((c) => ({ ...c, from: from ?? c.from, to: to ?? from ?? c.to }))}
          />
        ) : (
          <span className="muted">
            Du {formatDateLong(period.from)} au {formatDateLong(period.to)}
          </span>
        )}
      </div>

      {!valid ? (
        <p className="muted">La date de début doit précéder la date de fin.</p>
      ) : spending.isPending ? (
        <ListRowSkeleton rows={6} meta={false} middle />
      ) : spending.isError ? (
        <ErrorState title="Impossible de charger le rapport des dépenses" description={errorMessage(spending.error)} onRetry={() => spending.refetch()} />
      ) : spending.data.byEnvelope.length === 0 ? (
        <EmptyState icon={<BarChart3 />} title="Aucune dépense sur cette période" description="Les dépenses confirmées apparaîtront ici, enveloppe par enveloppe." />
      ) : (
        <>
          <ByEnvelope report={spending.data} months={period.months} />
          <TopExpenses from={period.from} to={period.to} />
        </>
      )}
    </div>
  );
}

function ByEnvelope({ report, months }: { report: SpendingReport; months: number | null }) {
  const navigate = useNavigate();
  const max = Math.max(...report.byEnvelope.map((e) => e.amount));
  const budget = months ? report.monthlyBudget * months : 0;

  return (
    <div className={styles.byEnvelope}>
      <KeyFigure
        label="Dépensé sur la période"
        figure={<Amount cents={report.total} size="xl" tone="neutral" animate />}
        aside={
          budget > 0 ? (
            <p className={styles.versus}>
              {report.total <= budget ? (
                <>
                  <strong className={['num', styles.good].join(' ')}>{formatEuros(budget - report.total)}</strong> sous le budget de {formatEuros(budget)}
                </>
              ) : (
                <>
                  <strong className={['num', styles.bad].join(' ')}>{formatEuros(report.total - budget)}</strong> au-dessus du budget de {formatEuros(budget)}
                </>
              )}
            </p>
          ) : undefined
        }
      />

      <section aria-label="Dépenses par enveloppe" className={styles.block}>
        {/* Barres relatives à la plus grosse enveloppe, trait au budget de la période */}
        <ul className={['ledger', 'stagger', styles.bars].join(' ')}>
          {report.byEnvelope.map((e) => {
            const target = months && e.monthlyBudget > 0 ? e.monthlyBudget * months : null;
            const over = target !== null && e.amount > target;
            const params = new URLSearchParams({ period: 'custom', from: report.from, to: report.to });
            if (e.envelopeId) params.set('envelope', String(e.envelopeId));
            const to = e.envelopeId ? `/operations?${params}` : '/operations?vue=a-ranger';
            const share = Math.round((e.amount / report.total) * 100);
            return (
              <ListRow
                key={e.envelopeId ?? 'unsorted'}
                onClick={() => navigate(to)}
                clickLabel={`Voir les opérations de ${e.name}`}
                lead={<Dot color={e.color} />}
                title={e.name}
                middle={
                  <ProgressBar
                    ratio={e.amount / max}
                    color={e.color}
                    size="md"
                    label={target ? `${e.name} : ${formatEuros(e.amount)} sur ${formatEuros(target)}` : `${e.name} : ${share} % des dépenses`}
                    marker={target ? target / max : undefined}
                    markerLabel="Budget de la période"
                  />
                }
                trail={<Amount cents={e.amount} tone="neutral" className={over ? styles.bad : undefined} />}
                trailSub={target ? `sur ${formatEuros(target)}` : `${share} %`}
              />
            );
          })}
        </ul>
        {months ? <p className={styles.note}>Le petit trait vertical marque le budget de l’enveloppe sur la période. Clique une ligne pour voir ses opérations.</p> : null}
      </section>
    </div>
  );
}

function TopExpenses({ from, to }: { from: string; to: string }) {
  const transactions = useTransactions({ from, to, kind: 'expense', status: 'confirmed', limit: 1000 });
  const envelopes = useEnvelopes(true);
  const envelopeById = useMemo(() => new Map((envelopes.data ?? []).map((e) => [e.id, e])), [envelopes.data]);
  const top = useMemo(
    () =>
      (transactions.data ?? [])
        .filter((t) => !(t.envelopeId != null && envelopeById.get(t.envelopeId)?.isSavings))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, TOP_EXPENSES),
    [transactions.data, envelopeById],
  );

  return (
    <section aria-labelledby="top-title">
      <SectionHeader id="top-title" title="Plus grosses dépenses" />
      {transactions.isPending ? (
        <ListRowSkeleton rows={4} />
      ) : transactions.isError ? (
        <ErrorState title="Impossible de charger les plus grosses dépenses" description={errorMessage(transactions.error)} onRetry={() => transactions.refetch()} />
      ) : (
        <ol className={['ledger', 'stagger', styles.top].join(' ')}>
          {top.map((t) => {
            const env = t.envelopeId != null ? envelopeById.get(t.envelopeId) : undefined;
            return (
              <ListRow
                key={t.id}
                lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}
                title={<span title={t.label}>{displayLabel(t)}</span>}
                meta={env ? <EnvelopeTag name={env.name} color={env.color} /> : <Badge tone="marking">À ranger</Badge>}
                trail={<Amount cents={t.amount} tone="neutral" />}
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Evolution() {
  const monthly = useMonthly(12);
  const netWorth = useNetWorth(12, 90);
  const now = today();

  const kpis = useMemo(() => {
    const data = monthly.data ?? [];
    const income = data.reduce((s, m) => s + m.income, 0);
    const saved = data.reduce((s, m) => s + m.saved, 0);
    const expense = data.reduce((s, m) => s + m.expense, 0);
    const months = Math.max(1, data.length);
    return { rate: income > 0 ? saved / income : null, savedPerMonth: Math.round(saved / months), expensePerMonth: Math.round(expense / months) };
  }, [monthly.data]);
  const ratePercent = useCountUp(kpis.rate === null ? 0 : Math.round(kpis.rate * 100));

  return (
    <div className={styles.view}>
      {monthly.isPending ? (
        <Skeleton height={72} />
      ) : monthly.isError ? (
        <ErrorState title="Impossible de calculer le taux d’épargne" description={errorMessage(monthly.error)} onRetry={() => monthly.refetch()} />
      ) : (
        <KeyFigure
          label="Taux d’épargne sur 12 mois"
          figure={
            <span className={keyFigureValue} aria-label={kpis.rate === null ? 'inconnu' : `${Math.round(kpis.rate * 100)} %`}>
              <span aria-hidden>{kpis.rate === null ? '–' : `${ratePercent} %`}</span>
            </span>
          }
          caption="Part des revenus mise de côté ou investie. Mis de côté et dépensé : moyennes par mois."
          aside={
            <StatGroup direction="column" divided>
              <Stat label="Mis de côté par mois">
                <Amount cents={kpis.savedPerMonth} size="lg" tone="neutral" animate />
              </Stat>
              <Stat label="Dépensé par mois, hors épargne">
                <Amount cents={kpis.expensePerMonth} size="lg" tone="neutral" animate />
              </Stat>
            </StatGroup>
          }
        />
      )}

      <section aria-labelledby="monthly-title">
        <SectionHeader id="monthly-title" title="Revenus, dépenses et épargne" aside={<span className={styles.period}>12 derniers mois</span>} />
        {monthly.isPending ? (
          <Skeleton height={260} />
        ) : monthly.isError ? (
          <ErrorState title="Impossible de charger les revenus et dépenses" description={errorMessage(monthly.error)} onRetry={() => monthly.refetch()} />
        ) : (
          <MonthlyBars data={monthly.data} height={260} />
        )}
      </section>

      <section aria-labelledby="networth-title">
        <SectionHeader id="networth-title" title="Total de tes comptes" aside={<span className={styles.period}>12 mois passés, 90 jours projetés</span>} />
        {netWorth.isPending ? (
          <Skeleton height={260} />
        ) : netWorth.isError ? (
          <ErrorState title="Impossible de charger le total de tes comptes" description={errorMessage(netWorth.error)} onRetry={() => netWorth.refetch()} />
        ) : (
          <NetWorthLine report={netWorth.data} today={now} height={260} />
        )}
      </section>
    </div>
  );
}
