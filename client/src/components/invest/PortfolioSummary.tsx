import type { PortfolioView } from '@shared/api-types';
import { Amount, KeyFigure, Skeleton, Stat, StatGroup } from '@/components/ui';
import { formatPct, gainTone } from '@/lib/invest';
import { formatDateCompact } from '@/lib/format';
import { EarthriseArt } from './EarthriseArt';
import { MoonTrail } from './MoonTrail';
import styles from './Portfolio.module.css';

/**
 * Valeur totale, montant investi et plus-value, sur fond de Terre qui se lève au-dessus de la Lune (ascii.rest).
 * La seule surface en relief de l'écran ; au survol, une fusée en pixels traîne « TO THE MOON » derrière le curseur.
 */
export function PortfolioSummary({ portfolio }: { portfolio: PortfolioView }) {
  const { totals } = portfolio;
  const tone = gainTone(totals.gain);
  const staleDate = portfolio.stale
    ? portfolio.holdings
        .map((h) => (h.price?.stale ? h.price.date : null))
        .filter((d): d is string => d !== null)
        .sort()[0]
    : null;

  return (
    <KeyFigure
      variant="night"
      className={styles.summary}
      label="Valeur du portefeuille"
      figure={<Amount cents={totals.value} size="xl" tone="neutral" animate />}
      caption={
        <>
          <span className={[styles.summaryGain, styles[tone]].join(' ')}>
            <Amount cents={totals.gain} tone="always" className={styles[tone]} /> <span className="num">({formatPct(totals.gainPct, { signed: true })})</span>
            <span className={styles.summaryGainLabel}>de plus-value latente</span>
          </span>
          {staleDate ? <span className={styles.stale}>Cours du {formatDateCompact(staleDate)} : Yahoo Finance ne répond pas pour l’instant.</span> : null}
        </>
      }
      aside={
        <StatGroup direction="column">
          <Stat label="Investi">
            <Amount cents={totals.invested} size="lg" tone="neutral" />
          </Stat>
          {totals.realized !== 0 ? (
            <Stat label="Plus-value réalisée">
              <Amount cents={totals.realized} size="lg" tone="always" />
            </Stat>
          ) : null}
        </StatGroup>
      }
      decoration={
        <>
          <EarthriseArt className={styles.art} label="La Terre qui se lève sur l’horizon de la Lune, en ascii art" />
          <div className={styles.veil} />
          <MoonTrail />
        </>
      }
    />
  );
}

export function PortfolioSummarySkeleton() {
  return (
    <div aria-busy>
      <KeyFigure variant="night" className={styles.summary} label="Valeur du portefeuille" figure={<Skeleton width={260} height={56} />} caption={<Skeleton width={220} height={16} />} />
    </div>
  );
}
