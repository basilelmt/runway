import type { ReactNode } from 'react';
import { formatEuros } from '@shared/money';
import styles from './chart.module.css';

export type TooltipEntry = { name: string; value: number; color?: string };

type ChartTooltipProps = {
  title: ReactNode;
  entries: TooltipEntry[];
};

/** Infobulle commune à tous les graphiques : titre discret, une ligne par série, chiffres alignés. */
export function ChartTooltip({ title, entries }: ChartTooltipProps) {
  return (
    <div className={styles.tooltip} role="presentation">
      <div className={styles.tooltipTitle}>{title}</div>
      {entries.map((e) => (
        <div key={e.name} className={styles.tooltipRow}>
          <span className={styles.tooltipLabel}>
            {e.color ? <span className={styles.swatch} style={{ background: e.color }} aria-hidden /> : null}
            {e.name}
          </span>
          <span className="num">{formatEuros(e.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Formate un montant en centimes pour un axe : "1,2 k€", "250 €". */
export function axisEuros(cents: number): string {
  const euros = cents / 100;
  if (Math.abs(euros) >= 1000) return `${(euros / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€`;
  return `${euros.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;
}
