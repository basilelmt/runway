import { BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { SpendingReport } from '@shared/api-types';
import { addMonths, endOfMonth, startOfMonth, today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useEnvelopes, useMonthly, useNetWorth, useSpending, useTransactions } from '@/api/hooks';
import { Upcoming } from '@/components/analyse/Upcoming';
import { MonthlyBars } from '@/components/charts/MonthlyBars';
import { NetWorthLine } from '@/components/charts/NetWorthLine';
import { PageHeader } from '@/components/layout/PageHeader';
import { Amount, DateRangeField, Dot, EmptyState, Segmented, Skeleton, SkeletonRows, Tabs } from '@/components/ui';
import { formatDateCompact, formatDateLong } from '@/lib/format';
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
        <SkeletonRows rows={6} />
      ) : spending.isError ? (
        <EmptyState title="Rapport indisponible" description={errorMessage(spending.error)} />
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
  const max = Math.max(...report.byEnvelope.map((e) => e.amount));
  const budget = months ? report.monthlyBudget * months : 0;

  return (
    <section aria-labelledby="by-envelope-title" className={styles.block}>
      <div className={styles.headline}>
        <div>
          <p className="eyebrow" id="by-envelope-title">
            Dépensé sur la période
          </p>
          <Amount cents={report.total} size="xl" tone="neutral" animate />
        </div>
        {budget > 0 ? (
          <p className={styles.headlineSide}>
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
        ) : null}
      </div>

      <ul className={[styles.bars, 'stagger'].join(' ')}>
        {report.byEnvelope.map((e) => {
          const target = months && e.monthlyBudget > 0 ? e.monthlyBudget * months : null;
          const over = target !== null && e.amount > target;
          const params = new URLSearchParams({ period: 'custom', from: report.from, to: report.to });
          if (e.envelopeId) params.set('envelope', String(e.envelopeId));
          const to = e.envelopeId ? `/operations?${params}` : '/operations?vue=a-ranger';
          return (
            <li key={e.envelopeId ?? 'unsorted'}>
              <Link to={to} className={['hover-row', styles.barRow].join(' ')}>
                <span className={styles.barName}>
                  <Dot color={e.color} /> {e.name}
                </span>
                <span className={styles.barTrack} aria-hidden>
                  <span className={styles.barFill} style={{ width: `${(e.amount / max) * 100}%`, background: e.color }} />
                  {target ? <span className={styles.barTarget} style={{ left: `${Math.min(1, target / max) * 100}%` }} title={`Budget ${formatEuros(target)}`} /> : null}
                </span>
                <span className={styles.barAmount}>
                  <Amount cents={e.amount} tone="neutral" className={over ? styles.bad : ''} />
                  <span className={styles.barMeta}>{target ? `sur ${formatEuros(target)}` : `${Math.round((e.amount / report.total) * 100)} %`}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {months ? <p className={styles.note}>Le petit trait vertical marque le budget de l’enveloppe sur la période. Clique une ligne pour voir ses opérations.</p> : null}
    </section>
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
    <section aria-labelledby="top-title" className={styles.block}>
      <div className="section-title">
        <h2 id="top-title">Plus grosses dépenses</h2>
      </div>
      {transactions.isPending ? (
        <SkeletonRows rows={4} />
      ) : (
        <ol className={['ledger', 'stagger', styles.top].join(' ')}>
          {top.map((t) => {
            const env = t.envelopeId != null ? envelopeById.get(t.envelopeId) : undefined;
            return (
              <li key={t.id} className={styles.topRow}>
                <span className={['num', styles.topDate].join(' ')}>{formatDateCompact(t.date)}</span>
                <span className={styles.topLabel}>{t.label}</span>
                <span className={styles.topEnvelope}>
                  {env ? (
                    <>
                      <Dot color={env.color} size={8} /> {env.name}
                    </>
                  ) : (
                    'À ranger'
                  )}
                </span>
                <Amount cents={t.amount} tone="neutral" className={styles.topAmount} />
              </li>
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
      ) : monthly.isError ? null : (
        <dl className={styles.kpis}>
          <div className={styles.kpiMain}>
            <dt>Taux d’épargne sur 12 mois</dt>
            <dd className={styles.kpiValue} aria-label={kpis.rate === null ? 'inconnu' : `${Math.round(kpis.rate * 100)} %`}>
              <span aria-hidden>{kpis.rate === null ? '–' : `${ratePercent} %`}</span>
            </dd>
            <dd className={styles.kpiHint}>part des revenus mise de côté ou investie</dd>
          </div>
          <div>
            <dt>Mis de côté par mois</dt>
            <dd>
              <Amount cents={kpis.savedPerMonth} size="lg" tone="neutral" animate />
            </dd>
            <dd className={styles.kpiHint}>en moyenne</dd>
          </div>
          <div>
            <dt>Dépensé par mois</dt>
            <dd>
              <Amount cents={kpis.expensePerMonth} size="lg" tone="neutral" animate />
            </dd>
            <dd className={styles.kpiHint}>en moyenne, hors épargne</dd>
          </div>
        </dl>
      )}

      <section aria-labelledby="monthly-title" className={styles.block}>
        <div className="section-title">
          <h2 id="monthly-title">Revenus, dépenses et épargne</h2>
          <span className="muted">12 derniers mois</span>
        </div>
        {monthly.isPending ? <Skeleton height={260} /> : monthly.isError ? <EmptyState title="Rapport indisponible" description={errorMessage(monthly.error)} /> : <MonthlyBars data={monthly.data} height={260} />}
      </section>

      <section aria-labelledby="networth-title" className={styles.block}>
        <div className="section-title">
          <h2 id="networth-title">Total de tes comptes</h2>
          <span className="muted">12 mois passés, 90 jours projetés</span>
        </div>
        {netWorth.isPending ? <Skeleton height={260} /> : netWorth.isError ? <EmptyState title="Rapport indisponible" description={errorMessage(netWorth.error)} /> : <NetWorthLine report={netWorth.data} today={now} height={260} />}
      </section>
    </div>
  );
}
