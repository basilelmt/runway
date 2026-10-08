import type { IdeasSummary } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { plural } from '@/lib/format';
import { formatPct, gainTone } from '@/lib/invest';
import styles from './Ideas.module.css';

/** Bilan des idées closes : est-ce que ce type de raisonnement rapporte plus que le marché ? */
export function IdeasScore({ summary }: { summary: IdeasSummary }) {
  if (summary.closedCount === 0) return null;
  const { invested, ideas, bench } = summary.hundredEach;
  return (
    <section className={styles.score} aria-labelledby="score-title">
      <h3 id="score-title" className={styles.scoreTitle}>
        Bilan
      </h3>
      <p className={styles.scoreLine}>
        <strong className="num">
          {summary.beatCount} {summary.closedCount > 1 ? `idées sur ${summary.closedCount}` : 'idée sur 1'}
        </strong>{' '}
        {summary.beatCount > 1 ? 'ont battu' : 'a battu'} le S&P 500, avec un écart moyen de{' '}
        <span className={['num', styles[gainTone(summary.avgExcess)]].join(' ')}>{formatPct(summary.avgExcess, { signed: true })}</span>.
      </p>
      <p className={styles.scoreLine}>
        100 € sur chaque idée : <span className="num">{formatEuros(invested)}</span> investis seraient devenus{' '}
        <strong className={['num', styles[gainTone(ideas - bench)]].join(' ')}>{formatEuros(ideas)}</strong>, contre <span className="num">{formatEuros(bench)}</span> sur le S&P 500.
      </p>
      {summary.filter ? (
        <p className={styles.scoreLine}>
          Face au S&P 500, les retenues ont fait{' '}
          <span className={['num', styles[gainTone(summary.filter.keptAvgExcess)]].join(' ')}>{formatPct(summary.filter.keptAvgExcess, { signed: true })}</span> en moyenne (
          {plural(summary.filter.keptCount, 'idée')}), les écartées{' '}
          <span className={['num', styles[gainTone(summary.filter.droppedAvgExcess)]].join(' ')}>{formatPct(summary.filter.droppedAvgExcess, { signed: true })}</span> (
          {plural(summary.filter.droppedCount, 'idée')}). {summary.filter.keptAvgExcess > summary.filter.droppedAvgExcess ? 'Le tri de Claude aide.' : 'Le tri de Claude n’aide pas encore.'}
        </p>
      ) : null}
    </section>
  );
}
