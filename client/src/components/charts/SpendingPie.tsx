import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SpendingReport } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { Amount } from '@/components/ui';
import { ChartTooltip } from './ChartTooltip';
import styles from './chart.module.css';

const MAX_SLICES = 6;
const OTHER_KEY = 'other';
const OTHER_COLOR = '#9a9a9a';

type Slice = { key: string; name: string; color: string; amount: number };

/** Au-delà de six parts, la queue est repliée dans "Autres" pour rester lisible. */
export function foldSlices(byEnvelope: SpendingReport['byEnvelope']): Slice[] {
  const slices: Slice[] = byEnvelope.map((e) => ({ key: String(e.envelopeId ?? 'unsorted'), name: e.name, color: e.color, amount: e.amount }));
  if (slices.length <= MAX_SLICES) return slices;
  const head = slices.slice(0, MAX_SLICES - 1);
  const tail = slices.slice(MAX_SLICES - 1);
  return [...head, { key: OTHER_KEY, name: 'Autres', color: OTHER_COLOR, amount: tail.reduce((s, x) => s + x.amount, 0) }];
}

export function SpendingPie({ report }: { report: SpendingReport }) {
  const slices = useMemo(() => foldSlices(report.byEnvelope), [report.byEnvelope]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = slices.filter((s) => !hidden.has(s.key));
  const total = visible.reduce((s, x) => s + x.amount, 0);

  const toggle = (key: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className={styles.pieLayout}>
      <div className={styles.wrap} style={{ height: 220, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={visible} dataKey="amount" nameKey="name" innerRadius={66} outerRadius={100} paddingAngle={2} stroke="var(--paper-raised)" strokeWidth={2} isAnimationActive={false}>
              {visible.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <ChartTooltip
                    title={`${total > 0 ? Math.round((Number(payload[0].value) / total) * 100) : 0} % des dépenses`}
                    entries={[{ name: String(payload[0].name), value: Number(payload[0].value), color: String(payload[0].payload.color) }]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.centerLabel} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span className="eyebrow">Total</span>
          <Amount cents={total} tone="neutral" size="lg" />
        </div>
      </div>
      <div className={styles.pieTable} role="list" aria-label="Dépenses par enveloppe">
        {slices.map((s) => (
          <button key={s.key} type="button" className={styles.pieRow} aria-pressed={!hidden.has(s.key)} onClick={() => toggle(s.key)} title={hidden.has(s.key) ? 'Afficher' : 'Masquer'}>
            <span className={styles.pieName}>
              <span className={styles.swatch} style={{ background: s.color }} aria-hidden />
              <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </span>
            </span>
            <span className={styles.pieShare}>{total > 0 && !hidden.has(s.key) ? `${Math.round((s.amount / total) * 100)} %` : ''}</span>
            <span className="mono">{formatEuros(s.amount)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
