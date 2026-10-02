import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatDateShort } from '@shared/dates';
import { ChartTooltip } from './ChartTooltip';
import styles from './chart.module.css';

type SparklineProps = {
  data: { date: string; value: number }[];
  height?: number;
  label: string;
};

/** Courbe minimale sans axes ; le nombre à côté porte la valeur, la courbe porte la tendance. */
export function Sparkline({ data, height = 48, label }: SparklineProps) {
  if (data.length < 2) return null;
  const rising = (data.at(-1)?.value ?? 0) >= (data[0]?.value ?? 0);
  return (
    <div className={styles.wrap} style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Tooltip
            cursor={{ stroke: 'var(--rule-strong)' }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <ChartTooltip title={formatDateShort(String(payload[0].payload.date))} entries={[{ name: label, value: Number(payload[0].value) }]} />
              ) : null
            }
          />
          <Line type="monotone" dataKey="value" stroke={rising ? 'var(--positive)' : 'var(--negative)'} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
