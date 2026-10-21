import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NetWorthReport } from '@shared/api-types';
import { formatDateLong, formatDateShort } from '@shared/dates';
import { axisEuros, CHART_MARGIN, ChartTooltip } from './ChartTooltip';
import styles from './chart.module.css';

type Point = { date: string; history: number | null; projection: number | null };

/** Fusionne historique et projection sur un seul axe ; le point d'aujourd'hui appartient aux deux séries pour que les traits se touchent. */
export function mergeNetWorth(report: NetWorthReport): Point[] {
  const points: Point[] = report.history.map((h) => ({ date: h.date, history: h.value, projection: null }));
  const first = report.projection[0];
  if (first) {
    const last = points.at(-1);
    if (last && last.date === first.date) last.projection = first.value;
    else points.push({ date: first.date, history: first.value, projection: first.value });
  }
  // La projection est quotidienne : on garde un point par semaine pour un trait net, plus le dernier.
  const rest = report.projection.slice(1);
  rest.forEach((p, i) => {
    if (i % 7 === 6 || i === rest.length - 1) points.push({ date: p.date, history: null, projection: p.value });
  });
  return points;
}

export function NetWorthLine({ report, today, height = 240 }: { report: NetWorthReport; today: string; height?: number }) {
  const data = mergeNetWorth(report);
  return (
    <div>
      <div className={styles.wrap} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatDateShort(d)} tickLine={false} axisLine={false} minTickGap={32} />
            <YAxis tickFormatter={axisEuros} width={64} tickLine={false} axisLine={false} />
            <ReferenceLine x={today} stroke="var(--marking)" />
            <Tooltip
              cursor={{ stroke: 'var(--rule-strong)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload as Point;
                const value = p.projection ?? p.history ?? 0;
                return <ChartTooltip title={formatDateLong(p.date)} entries={[{ name: p.history !== null && p.projection === null ? 'Valeur nette' : 'Projection', value }]} />;
              }}
            />
            <Line type="monotone" dataKey="history" name="Valeur nette" stroke="var(--ink)" strokeWidth={2} dot={{ r: 3, fill: 'var(--ink)' }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="projection" name="Projection" stroke="var(--ink-mute)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend} aria-hidden>
        <span className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: 'var(--ink)' }} />
          Passé
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: 'repeating-linear-gradient(90deg, var(--ink-mute) 0 3px, transparent 3px 5px)' }} />
          Projection
        </span>
      </div>
    </div>
  );
}
