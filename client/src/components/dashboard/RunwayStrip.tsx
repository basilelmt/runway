import { Plane } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ForecastResponse } from '@shared/api-types';
import { addDays, daysBetween, formatDateLong, formatDateShort } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { inDays } from '@/lib/format';
import styles from './RunwayStrip.module.css';

const MAX_MARKERS = 60;

/** Phrase de statut au-dessus de la piste : dégagée, ou premier découvert. */
export function runwayStatus(forecast: Pick<ForecastResponse, 'alerts' | 'horizonDays'>): { tone: 'clear' | 'alert'; text: string } {
  const first = forecast.alerts[0];
  if (!first) return { tone: 'clear', text: `Piste dégagée sur ${forecast.horizonDays} jours` };
  const when = first.daysUntil <= 0 ? "Découvert aujourd'hui" : `Découvert ${inDays(first.daysUntil)}`;
  return { tone: 'alert', text: `${when} · ${first.name} · ${formatEuros(first.minBalance)}` };
}

export function RunwayStrip({ forecast }: { forecast: ForecastResponse }) {
  const { today, horizonDays, alerts, events } = forecast;
  const status = runwayStatus(forecast);
  const firstNegative = alerts[0]?.firstNegativeDate ?? null;
  const redFrom = firstNegative ? Math.max(0, daysBetween(today, firstNegative)) / horizonDays : null;

  // Une graduation par semaine, ou toutes les quatre semaines sur un long horizon.
  const step = horizonDays <= 120 ? 7 : 28;
  const weeks: { date: string; offset: number }[] = [];
  for (let d = step; d < horizonDays; d += step) weeks.push({ date: addDays(today, d), offset: d / horizonDays });

  // Les mouvements d'argent réels d'un même jour sont regroupés sous un seul marqueur (les répartitions de budget n'en sont pas).
  const byDay = new Map<string, typeof events>();
  for (const e of events) if (e.kind !== 'allocation') byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const markers = [...byDay.entries()].slice(0, MAX_MARKERS).map(([date, list]) => {
    const net = list.reduce((s, e) => s + (e.kind === 'income' ? e.amount : e.kind === 'expense' ? -e.amount : 0), 0);
    const title = `${formatDateLong(date)}\n${list.map((e) => `${e.label} ${formatEuros(e.kind === 'income' ? e.amount : -e.amount)}`).join('\n')}`;
    return { date, offset: daysBetween(today, date) / horizonDays, tone: net > 0 ? 'in' : net < 0 ? 'out' : 'neutral', title };
  });

  return (
    <section className={styles.section} aria-label="Piste des prochains jours">
      <div className={styles.status}>
        <p className={[styles.statusText, status.tone === 'alert' ? styles.alert : styles.clear].join(' ')}>{status.text}</p>
      </div>
      <div className={styles.strip} role="img" aria-label={status.text}>
        <div className={styles.tarmac} />
        <div className={styles.centerline} />
        {redFrom !== null ? <div className={styles.danger} style={{ left: `${redFrom * 100}%` }} /> : null}
        <div className={[styles.threshold, styles.today].join(' ')} title={`Aujourd'hui, ${formatDateLong(today)}`} />
        {weeks.map((w) => (
          <div key={w.date} className={styles.tick} style={{ left: `${w.offset * 100}%` }}>
            <span className={styles.tickLabel}>{formatDateShort(w.date)}</span>
          </div>
        ))}
        {markers.map((m) => (
          <span key={m.date} className={[styles.marker, styles[m.tone]].join(' ')} style={{ left: `${m.offset * 100}%` }} title={m.title} />
        ))}
        {/* L'avion roule jusqu'au premier découvert, ou décolle en bout de piste si elle est dégagée. */}
        <span
          className={[styles.plane, redFrom === null ? styles.takeoff : styles.halt].join(' ')}
          style={{ '--stop': `${Math.max(4, (redFrom ?? 1) * 100 - 3)}%` } as CSSProperties}
          aria-hidden
        >
          <Plane />
        </span>
        <div className={[styles.threshold, styles.end].join(' ')} title={`Fin de l'horizon, ${formatDateLong(addDays(today, horizonDays))}`} />
      </div>
      <div className={styles.scale}>
        <span>Aujourd'hui</span>
        <span>{horizonDays} jours</span>
      </div>
    </section>
  );
}
