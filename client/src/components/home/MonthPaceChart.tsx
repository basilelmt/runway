import { useRef, useState, type PointerEvent } from 'react';
import { addDays, daysInMonth, formatDateShort, parts } from '@shared/dates';
import { formatEuros, type Cents } from '@shared/money';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import chart from '@/components/charts/chart.module.css';
import styles from './MonthPaceChart.module.css';

type MonthPaceChartProps = {
  /** Cumul des dépenses courantes à la fin de chaque jour, du 1er à aujourd'hui inclus. */
  daily: Cents[];
  /** Budget des dépenses courantes du mois. */
  budget: Cents;
  monthStart: string;
  monthEnd: string;
};

/** Repère : abscisses et ordonnées en fraction de la zone de tracé, de 0 à 1. */
const VIEW = 1000;

/**
 * Le mois des dépenses courantes : cumul en marches jusqu'à aujourd'hui, face à la diagonale du rythme prévu,
 * avec sa légende et l'écart au rythme du jour (le seul endroit où ce rythme est calculé).
 * SVG étiré à la largeur (traits non déformés) ; points et libellés en HTML, placés en pourcentage, pour rester ronds et nets.
 */
export function MonthPaceChart({ daily, budget, monthStart, monthEnd }: MonthPaceChartProps) {
  const { year, month } = parts(monthStart);
  const days = daysInMonth(year, month);
  const today = daily.length;
  const spent = daily[today - 1] ?? 0;
  const top = Math.max(budget, ...daily) * 1.08 || 1;
  const x = (endOfDay: number) => endOfDay / days;
  const y = (cents: number) => 1 - cents / top;
  const pace = (endOfDay: number) => Math.round((budget * endOfDay) / days);

  let line = `M 0 ${y(0) * VIEW}`;
  daily.forEach((v, i) => {
    line += ` V ${y(v) * VIEW} H ${x(i + 1) * VIEW}`;
  });
  const area = `${line} V ${VIEW} H 0 Z`;

  const [hover, setHover] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const onMove = (e: PointerEvent) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const day = Math.ceil(((e.clientX - box.left) / box.width) * days);
    setHover(Math.min(Math.max(day, 1), today));
  };

  const shown = hover ?? today;
  const pct = (f: number) => `${f * 100}%`;
  const diff = pace(today) - spent;
  const summary = `Dépenses courantes : ${formatEuros(spent)} au ${formatDateShort(addDays(monthStart, today - 1))}, ${formatEuros(Math.abs(diff))} ${diff >= 0 ? 'sous le' : 'au-dessus du'} rythme prévu, sur ${formatEuros(budget)} pour le mois.`;

  return (
    <figure className={styles.chart}>
      <div ref={plot} className={styles.plot} role="img" aria-label={summary} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        <svg className={styles.svg} viewBox={`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="none" aria-hidden="true">
          <line className={styles.budget} x1={0} x2={VIEW} y1={y(budget) * VIEW} y2={y(budget) * VIEW} />
          <line className={styles.pace} x1={0} y1={y(0) * VIEW} x2={VIEW} y2={y(budget) * VIEW} />
          <path className={styles.area} d={area} />
          <path className={styles.line} d={line} />
          <line className={styles.today} x1={x(today) * VIEW} x2={x(today) * VIEW} y1={0} y2={VIEW} />
          {hover != null && hover !== today ? <line className={styles.cursor} x1={x(hover) * VIEW} x2={x(hover) * VIEW} y1={0} y2={VIEW} /> : null}
        </svg>
        <span className={styles.budgetLabel} style={{ bottom: `calc(${pct(1 - y(budget))} + var(--s-1))` }} aria-hidden="true">
          <span className="num">{formatEuros(budget)}</span> prévus
        </span>
        <span className={styles.paceDot} style={{ left: pct(x(shown)), top: pct(y(pace(shown))) }} aria-hidden="true" />
        <span className={styles.dot} style={{ left: pct(x(shown)), top: pct(y(daily[shown - 1] ?? 0)) }} aria-hidden="true" />
        {hover != null ? (
          <div className={[styles.tip, x(hover) > 0.6 ? styles.tipLeft : ''].join(' ')} style={{ left: pct(x(hover)) }}>
            <ChartTooltip
              title={hover === today ? 'Aujourd’hui' : formatDateShort(addDays(monthStart, hover - 1))}
              entries={[
                { name: 'Dépensé', value: daily[hover - 1] ?? 0, color: 'var(--ink)' },
                { name: 'Rythme prévu', value: pace(hover), color: 'var(--rule-strong)' },
              ]}
            />
          </div>
        ) : null}
      </div>
      <div className={styles.axis} aria-hidden="true">
        <span>{formatDateShort(monthStart)}</span>
        {today > 2 && today < days - 2 ? (
          <span className={styles.axisToday} style={{ left: pct(x(today)) }}>
            {today}
          </span>
        ) : null}
        <span>{formatDateShort(monthEnd)}</span>
      </div>
      <figcaption className={styles.caption}>
        <span className={chart.legend} aria-hidden="true">
          <span className={chart.legendItem}>
            <span className={[chart.swatchLine, styles.swatchSpent].join(' ')} />
            Dépenses courantes
          </span>
          <span className={chart.legendItem}>
            <span className={[chart.swatchLine, styles.swatchPace].join(' ')} />
            Rythme prévu
          </span>
        </span>
        <span className={styles.summary}>
          <strong className={['num', diff < 0 ? styles.over : styles.under].join(' ')}>{formatEuros(Math.abs(diff))}</strong> {diff >= 0 ? 'sous le' : 'au-dessus du'} rythme{' '}
          <span className={styles.ratio}>
            · <span className="num">{formatEuros(spent)}</span> / <span className="num">{formatEuros(budget)}</span>
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
