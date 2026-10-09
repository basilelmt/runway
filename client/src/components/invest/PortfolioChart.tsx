import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { isZeroQty } from '@core/invest';
import type { HoldingView, PortfolioRange, SeriesPoint } from '@shared/api-types';
import { formatDateLong, formatDateShort } from '@shared/dates';
import { axisEuros, ChartTooltip } from '@/components/charts/ChartTooltip';
import chart from '@/components/charts/chart.module.css';
import { FilterPill, Segmented } from '@/components/ui';
import styles from './Portfolio.module.css';

const RANGES: { value: PortfolioRange; label: string }[] = [
  { value: '1m', label: '1 mois' },
  { value: '6m', label: '6 mois' },
  { value: '1y', label: '1 an' },
  { value: 'all', label: 'Tout' },
];

const ALL = 'all';

type Props = {
  series: SeriesPoint[];
  holdings: HoldingView[];
  range: PortfolioRange;
  onRange: (r: PortfolioRange) => void;
  loading?: boolean;
};

/** Valeur du portefeuille, ou d'une seule position, face au montant investi : l'écart entre les deux courbes est la plus-value. */
export function PortfolioChart({ series, holdings, range, onRange, loading = false }: Props) {
  const [chosen, setChosen] = useState(ALL);
  const open = holdings.filter((h) => !isZeroQty(h.quantity));
  // Une position vendue entre-temps disparaît du choix : retour au portefeuille entier.
  const holding = open.find((h) => String(h.id) === chosen) ?? null;
  const shown = holding ? holding.series : series;

  return (
    <section aria-labelledby="chart-title">
      <div className="section-title">
        <h2 id="chart-title">Évolution</h2>
        <div className={styles.chartControls}>
          {open.length > 1 ? (
            <FilterPill value={holding ? chosen : ALL} onChange={setChosen} resetValue={ALL} size="sm" aria-label="Position à tracer">
              <option value={ALL}>Tout le portefeuille</option>
              {open.map((h) => (
                <option key={h.id} value={String(h.id)}>
                  {h.name}
                </option>
              ))}
            </FilterPill>
          ) : null}
          <Segmented label="Période du graphique" size="sm" value={range} onChange={onRange} options={RANGES} />
        </div>
      </div>
      <div className={[chart.wrap, styles.chart, loading ? styles.loading : ''].join(' ')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={shown} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatDateShort(d)} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis tickFormatter={axisEuros} width={72} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
            <Tooltip
              cursor={{ stroke: 'var(--rule-strong)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload as SeriesPoint;
                return (
                  <ChartTooltip
                    title={formatDateLong(p.date)}
                    entries={[
                      { name: 'Valeur', value: p.value, color: 'var(--ink)' },
                      { name: 'Investi', value: p.invested, color: 'var(--ink-mute)' },
                    ]}
                  />
                );
              }}
            />
            <Line type="monotone" dataKey="invested" name="Investi" stroke="var(--ink-mute)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="value" name="Valeur" stroke="var(--ink)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className={chart.legend} aria-hidden>
        <span className={chart.legendItem}>
          <span className={chart.swatch} style={{ background: 'var(--ink)' }} />
          Valeur
        </span>
        <span className={chart.legendItem}>
          <span className={chart.swatch} style={{ background: 'repeating-linear-gradient(90deg, var(--ink-mute) 0 3px, transparent 3px 5px)' }} />
          Investi
        </span>
      </div>
    </section>
  );
}
