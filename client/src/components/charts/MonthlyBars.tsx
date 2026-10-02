import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthlyReport } from '@shared/api-types';
import { formatMonth } from '@shared/dates';
import { axisEuros, ChartTooltip } from './ChartTooltip';
import styles from './chart.module.css';

const SERIES = [
  { key: 'income', name: 'Revenus', color: 'var(--positive)' },
  { key: 'expense', name: 'Dépenses', color: 'var(--negative)' },
] as const;

const shortFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });

/** "nov. 25", "janv. 26" */
function shortMonth(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return shortFormatter.format(new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, 15)));
}

export function MonthlyBars({ data, height = 240 }: { data: MonthlyReport; height?: number }) {
  return (
    <div>
      <div className={styles.wrap} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickFormatter={shortMonth} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tickFormatter={axisEuros} width={64} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: 'var(--paper-sunken)' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    title={formatMonth(String(label))}
                    entries={SERIES.map((s) => ({ name: s.name, value: Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0), color: s.color }))}
                  />
                ) : null
              }
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend} aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
