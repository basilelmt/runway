import { ArrowUpRight } from 'lucide-react';
import type { IdeaView } from '@shared/api-types';
import { BENCHMARK_NAME } from '@shared/invest';
import { formatDateCompact, keepTogether } from '@/lib/format';
import { domainOf, formatMarketContext, formatPct, gainTone, platformLabel } from '@/lib/invest';
import styles from './Ideas.module.css';

/** Une idée : l'événement, la déduction, l'actif, et ce qu'elle a donné face au S&P 500. */
export function IdeaCard({ idea }: { idea: IdeaView }) {
  const closed = idea.status === 'closed';
  const beat = idea.return !== null && idea.benchReturn !== null ? idea.return > idea.benchReturn : null;
  const where = idea.whereToBuy === 'other' ? 'Ailleurs' : `Sur ${platformLabel(idea.whereToBuy)}`;

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{keepTogether(idea.title)}</h3>
        <span className={styles.horizon}>{closed ? `Close le ${formatDateCompact(idea.horizon)}` : `D’ici le ${formatDateCompact(idea.horizon)}`}</span>
      </header>

      <p className={styles.event}>
        {keepTogether(idea.event)}{' '}
        <span className={styles.sources}>
          {idea.sources.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className={styles.source}>
              {domainOf(url)}
              <ArrowUpRight aria-hidden />
            </a>
          ))}
        </span>
      </p>

      <ol className={styles.chain} aria-label="Déduction">
        {idea.reasoning.map((step, i) => (
          <li key={i}>{keepTogether(step)}</li>
        ))}
      </ol>

      <div className={styles.asset}>
        <span className={styles.assetName}>{idea.assetName}</span>
        <span className="mono">{idea.ticker}</span>
        <span className={styles.where}>{where}</span>
      </div>

      {idea.marketContext ? <p className={styles.market}>{formatMarketContext(idea.marketContext)}</p> : null}

      <p className={styles.pricedIn}>
        <span className={styles.pricedInLabel}>{keepTogether('Déjà dans les prix ?')}</span> {keepTogether(idea.pricedIn)}
      </p>

      {idea.risk ? (
        <p className={styles.pricedIn}>
          <span className={styles.pricedInLabel}>Ce qui peut mal tourner</span> {keepTogether(idea.risk)}
        </p>
      ) : null}

      <footer className={styles.perf}>
        <div className={styles.perfFigure}>
          <span className={['num', styles.perfValue, styles[gainTone(idea.return)]].join(' ')}>{formatPct(idea.return, { signed: true })}</span>
          <span className={styles.perfLabel}>{closed ? 'à l’horizon' : `depuis le ${formatDateCompact(idea.createdOn)}`}</span>
        </div>
        <div className={styles.perfFigure}>
          <span className={['num', styles.perfBench].join(' ')}>{formatPct(idea.benchReturn, { signed: true })}</span>
          <span className={styles.perfLabel}>{BENCHMARK_NAME}</span>
        </div>
        {closed && beat !== null ? (
          <span className={[styles.verdict, beat ? styles.verdictWin : styles.verdictLose].join(' ')}>{beat ? 'A battu le S&P 500' : 'N’a pas battu le S&P 500'}</span>
        ) : null}
      </footer>
    </article>
  );
}
