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

const MONTH = /^\d{4}-\d{2}$/;
const CATEGORY_WIDTH = 148;
const CATEGORY_MAX_CHARS = 18;
const ROW_HEIGHT = 28;

/** Nom de catégorie sur une seule ligne (Recharts couperait un nom long en deux), raccourci s'il dépasse la colonne. */
function CategoryTick({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) {
  const label = payload?.value ?? '';
  return (
    <text x={x} y={y} dx={-6} dy={4} textAnchor="end" className="recharts-cartesian-axis-tick-value">
      {label.length > CATEGORY_MAX_CHARS ? `${label.slice(0, CATEGORY_MAX_CHARS - 1)}…` : label}
    </text>
  );
}

/**
 * Graphique d'une réponse : les valeurs viennent de la requête exécutée par le serveur.
 * Des barres par mois restent verticales ; des barres par nom (commerçant, enveloppe) passent à l'horizontale,
 * pour lire chaque nom en entier au lieu d'un sur deux.
 */
export function AskChart({ data }: { data: AskChartData }) {
  const byCategory = data.kind === 'bar' && !data.rows.every((r) => MONTH.test(r.label));
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
      <div className={chart.wrap} style={{ height: byCategory ? data.rows.length * ROW_HEIGHT + 32 : 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          {byCategory ? (
            <BarChart data={data.rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickFormatter={axisEuros} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" tick={CategoryTick} width={CATEGORY_WIDTH} tickLine={false} axisLine={false} interval={0} />
              {tooltip}
              <Bar dataKey="value" fill="var(--ink)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
            </BarChart>
          ) : data.kind === 'bar' ? (
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
