import { Ascii } from 'ascii.rest/react';
import * as earthrise from 'ascii.rest/pieces/earthrise';
import type { PortfolioView } from '@shared/api-types';
import { Amount, Skeleton } from '@/components/ui';
import { formatPct, gainTone } from '@/lib/invest';
import { formatDateCompact } from '@/lib/format';
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
    <section className={styles.hero} aria-label="Portefeuille">
      <Ascii piece={earthrise} className={styles.heroArt} label="La Terre qui se lève sur l’horizon de la Lune, en ascii art" />
      <div className={styles.heroMain}>
        <p className="eyebrow">Valeur du portefeuille</p>
        <Amount cents={totals.value} size="xl" tone="neutral" animate />
        <p className={[styles.heroGain, styles[tone]].join(' ')}>
          <Amount cents={totals.gain} tone="always" className={styles[tone]} /> <span className="num">({formatPct(totals.gainPct, { signed: true })})</span>
          <span className={styles.heroGainLabel}>de plus-value latente</span>
        </p>
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Investi</dt>
            <dd>
              <Amount cents={totals.invested} size="lg" tone="neutral" />
            </dd>
          </div>
          {totals.realized !== 0 ? (
            <div className={styles.stat}>
              <dt>Plus-value réalisée</dt>
              <dd>
                <Amount cents={totals.realized} size="lg" tone="always" />
              </dd>
            </div>
          ) : null}
        </dl>
        {staleDate ? <p className={styles.stale}>Cours du {formatDateCompact(staleDate)} : Yahoo Finance ne répond pas pour l’instant.</p> : null}
      </div>
      <MoonTrail />
    </section>
  );
}

export function PortfolioSummarySkeleton() {
  return (
    <div className={styles.hero} aria-busy>
      <div className={styles.heroMain}>
        <Skeleton width={160} height={12} />
        <Skeleton width={260} height={56} />
        <Skeleton width={220} height={16} />
      </div>
    </div>
  );
}
