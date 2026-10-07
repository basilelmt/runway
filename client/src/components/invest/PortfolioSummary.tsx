import type { PortfolioView } from '@shared/api-types';
import { Amount, Skeleton } from '@/components/ui';
import { formatPct, gainTone } from '@/lib/invest';
import { formatDateCompact } from '@/lib/format';
import styles from './Portfolio.module.css';

/** Valeur totale, montant investi et plus-value : la seule surface en relief de l'écran. */
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
      <div className={styles.heroMain}>
        <p className="eyebrow">Valeur du portefeuille</p>
        <Amount cents={totals.value} size="xl" tone="neutral" animate />
        <p className={[styles.heroGain, styles[tone]].join(' ')}>
          <Amount cents={totals.gain} tone="always" className={styles[tone]} /> <span className="num">({formatPct(totals.gainPct, { signed: true })})</span>
          <span className={styles.heroGainLabel}>de plus-value latente</span>
        </p>
        {staleDate ? <p className={styles.stale}>Cours du {formatDateCompact(staleDate)} : Yahoo Finance ne répond pas pour l’instant.</p> : null}
      </div>
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
      <div className={styles.stats}>
        <Skeleton width={140} height={44} />
      </div>
    </div>
  );
}
