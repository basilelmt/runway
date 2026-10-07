import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { addMonths, endOfMonth, startOfMonth, today } from '@shared/dates';
import { errorMessage } from '@/api/client';
import { useMonthly, useNetWorth, useSpending } from '@/api/hooks';
import { MonthlyBars } from '@/components/charts/MonthlyBars';
import { NetWorthLine } from '@/components/charts/NetWorthLine';
import { SpendingPie } from '@/components/charts/SpendingPie';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, DateInput, EmptyState, Segmented, Skeleton } from '@/components/ui';
import { formatDateLong } from '@/lib/format';
import styles from './Reports.module.css';

type Preset = 'month' | 'last' | 'quarter' | 'year' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'month', label: 'Ce mois' },
  { value: 'last', label: 'Mois dernier' },
  { value: 'quarter', label: '3 mois' },
  { value: 'year', label: 'Cette année' },
  { value: 'custom', label: 'Personnalisé' },
];

export function periodFor(preset: Preset, now: string): { from: string; to: string } {
  switch (preset) {
    case 'month':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'last': {
      const prev = addMonths(startOfMonth(now), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case 'quarter':
      return { from: startOfMonth(addMonths(now, -2)), to: endOfMonth(now) };
    case 'year':
      return { from: `${now.slice(0, 4)}-01-01`, to: `${now.slice(0, 4)}-12-31` };
    case 'custom':
      return { from: startOfMonth(now), to: now };
  }
}

export function ReportsPage() {
  const now = today();
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState(() => periodFor('custom', now));
  const period = preset === 'custom' ? custom : periodFor(preset, now);
  const validPeriod = period.from <= period.to;

  const spending = useSpending(validPeriod ? period.from : undefined, validPeriod ? period.to : undefined);
  const monthly = useMonthly(12);
  const netWorth = useNetWorth(12, 90);

  return (
    <div className="page">
      <PageHeader title="Rapports" subtitle="Où part l'argent, et comment évolue ce qu'il reste." />

      <section className={styles.block}>
        <div className={styles.periodBar}>
          <Segmented label="Période" value={preset} onChange={setPreset} options={PRESETS} />
          {preset === 'custom' ? (
            <div className={styles.customRange}>
              <DateInput value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="Du" />
              <span className="muted">au</span>
              <DateInput value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="Au" />
            </div>
          ) : (
            <span className="muted">
              Du {formatDateLong(period.from)} au {formatDateLong(period.to)}
            </span>
          )}
        </div>

        <Card>
          <div className="section-title">
            <h2>Dépenses par enveloppe</h2>
          </div>
          {!validPeriod ? (
            <p className="muted">La date de début doit précéder la date de fin.</p>
          ) : spending.isPending ? (
            <Skeleton height={220} />
          ) : spending.isError ? (
            <EmptyState title="Rapport indisponible" description={errorMessage(spending.error)} />
          ) : spending.data.byEnvelope.length === 0 ? (
            <EmptyState icon={<BarChart3 />} title="Aucune dépense sur cette période" description="Les dépenses confirmées apparaîtront ici, enveloppe par enveloppe." />
          ) : (
            <SpendingPie report={spending.data} />
          )}
        </Card>
      </section>

      <Card>
        <div className="section-title">
          <h2>Revenus et dépenses par mois</h2>
          <span className="muted">12 derniers mois</span>
        </div>
        {monthly.isPending ? <Skeleton height={240} /> : monthly.isError ? <EmptyState title="Rapport indisponible" description={errorMessage(monthly.error)} /> : <MonthlyBars data={monthly.data} />}
      </Card>

      <Card>
        <div className="section-title">
          <h2>Valeur nette</h2>
          <span className="muted">12 mois passés, 90 jours projetés</span>
        </div>
        {netWorth.isPending ? <Skeleton height={240} /> : netWorth.isError ? <EmptyState title="Rapport indisponible" description={errorMessage(netWorth.error)} /> : <NetWorthLine report={netWorth.data} today={now} />}
      </Card>
    </div>
  );
}
