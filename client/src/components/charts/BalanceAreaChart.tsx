import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateLong, formatDateShort } from '@shared/dates';
import { axisEuros, CHART_MARGIN, ChartTooltip } from './ChartTooltip';
import styles from './chart.module.css';

type BalanceAreaChartProps = {
  data: { date: string; value: number }[];
  name: string;
  today: string;
  height?: number;
};

/**
 * Solde projeté jour par jour. Le dégradé bascule au vert au-dessus de zéro et au rouge en dessous,
 * calculé à partir de l'étendue des valeurs pour que la frontière tombe exactement sur la ligne 0.
 */
export function BalanceAreaChart({ data, name, today, height = 260 }: BalanceAreaChartProps) {
  const values = data.map((d) => d.value);
  const dataMax = Math.max(...values);
  const dataMin = Math.min(...values);
  const max = Math.max(0, dataMax);
  const min = Math.min(0, dataMin);
  // Les dégradés sont exprimés dans la boîte englobante de chaque forme : l'aire part de la ligne 0,
  // le trait ne couvre que l'étendue des données. Chaque offset est donc calculé sur sa propre boîte.
  const zeroOffset = max === min ? 0.5 : max / (max - min);
  const strokeZeroOffset = dataMax === dataMin ? (dataMax >= 0 ? 1 : 0) : Math.min(1, Math.max(0, dataMax / (dataMax - dataMin)));
  const gradientId = `balance-${name.replace(/\W+/g, '-')}`;

  const yTicks = niceTicks(min, max, 5);

  // Une graduation par semaine environ, pour garder l'axe lisible sur 365 jours.
  const tickEvery = Math.max(1, Math.round(data.length / 8));
  const ticks = data.filter((_, i) => i % tickEvery === 0).map((d) => d.date);

  return (
    <div className={styles.wrap} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="var(--positive)" stopOpacity={0.35} />
              <stop offset={zeroOffset} stopColor="var(--positive)" stopOpacity={0.04} />
              <stop offset={zeroOffset} stopColor="var(--negative)" stopOpacity={0.12} />
              <stop offset={1} stopColor="var(--negative)" stopOpacity={0.45} />
            </linearGradient>
            <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={strokeZeroOffset} stopColor="var(--positive)" />
              <stop offset={strokeZeroOffset} stopColor="var(--negative)" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" ticks={ticks} tickFormatter={(d: string) => formatDateShort(d)} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={axisEuros} width={64} tickLine={false} axisLine={false} domain={[yTicks[0] ?? min, yTicks.at(-1) ?? max]} ticks={yTicks} />
          <ReferenceLine y={0} stroke="var(--ink-mute)" strokeDasharray="4 4" />
          <ReferenceLine x={today} stroke="var(--marking)" label={{ value: "Aujourd'hui", position: 'insideTopLeft', fill: 'var(--ink-mute)', fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: 'var(--rule-strong)' }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <ChartTooltip title={formatDateLong(String(payload[0].payload.date))} entries={[{ name, value: Number(payload[0].value) }]} />
              ) : null
            }
          />
          <Area type="stepAfter" dataKey="value" stroke={`url(#${gradientId}-stroke)`} strokeWidth={2} fill={`url(#${gradientId})`} baseValue={0} isAnimationActive={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Graduations rondes (1, 2, 5 × 10^n) qui englobent [min, max] et passent toujours par zéro. */
export function niceTicks(min: number, max: number, count: number): number[] {
  const span = Math.max(max - min, 1);
  const rough = span / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step; v += step) ticks.push(v);
  return ticks;
}
