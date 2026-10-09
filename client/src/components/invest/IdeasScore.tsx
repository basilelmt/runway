import type { IdeasSummary } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { SectionHeader, Stat, StatGroup } from '@/components/ui';
import { plural } from '@/lib/format';
import { formatPct, gainTone } from '@/lib/invest';
import styles from './Ideas.module.css';

/** Bilan des idées closes : est-ce que ce type de raisonnement rapporte plus que le marché ? */
export function IdeasScore({ summary }: { summary: IdeasSummary }) {
  if (summary.closedCount === 0) return null;
  const { invested, ideas, bench } = summary.hundredEach;
  return (
    <section className={styles.score} aria-labelledby="score-title">
      <SectionHeader as="h3" id="score-title" title="Bilan" />
      <p className={styles.scoreLine}>
        <strong className="num">
          {summary.beatCount} {summary.closedCount > 1 ? `idées sur ${summary.closedCount}` : 'idée sur 1'}
        </strong>{' '}
        {summary.beatCount > 1 ? 'ont battu' : 'a battu'} le S&P 500, avec un écart moyen de{' '}
        <span className={['num', styles[gainTone(summary.avgExcess)]].join(' ')}>{formatPct(summary.avgExcess, { signed: true })}</span>.
      </p>
      <StatGroup>
        <Stat label="100 € investis sur chaque idée">{formatEuros(invested)}</Stat>
        <Stat label="Auraient donné" emphasis>
          <span className={styles[gainTone(ideas - bench)]}>{formatEuros(ideas)}</span>
        </Stat>
        <Stat label="Contre, sur le S&P 500">{formatEuros(bench)}</Stat>
      </StatGroup>
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
