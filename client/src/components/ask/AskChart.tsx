import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AskChart as AskChartData } from '@shared/api-types';
import { axisEuros, ChartTooltip } from '@/components/charts/ChartTooltip';
import chart from '@/components/charts/chart.module.css';
import styles from './AskPanel.module.css';

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** « 2026-03 » devient « mars 26 » ; tout autre libellé reste tel quel. */
function shortLabel(label: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  return m ? monthFormatter.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15))) : label;
}

/** Graphique d'une réponse : les valeurs viennent de la requête exécutée par le serveur. */
export function AskChart({ data }: { data: AskChartData }) {
  const tooltip = (
    <Tooltip
      cursor={data.kind === 'bar' ? { fill: 'var(--paper-sunken)' } : { stroke: 'var(--rule-strong)' }}
      content={({ active, payload, label }) =>
        active && payload?.length ? <ChartTooltip title={shortLabel(String(label))} entries={[{ name: data.title, value: Number(payload[0]?.value ?? 0) }]} /> : null
      }
    />
  );
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tickFormatter={shortLabel} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
      <YAxis tickFormatter={axisEuros} width={56} tickLine={false} axisLine={false} />
    </>
  );
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>{data.title}</figcaption>
      <div className={chart.wrap} style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          {data.kind === 'bar' ? (
            <BarChart data={data.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
              {axes}
              {tooltip}
              <Bar dataKey="value" fill="var(--ink)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart data={data.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {axes}
              {tooltip}
              <Line dataKey="value" stroke="var(--ink)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
