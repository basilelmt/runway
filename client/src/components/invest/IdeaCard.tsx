import type { IdeaView } from '@shared/api-types';
import { BENCHMARK_NAME } from '@shared/invest';
import { Badge, Card } from '@/components/ui';
import { formatDateCompact, keepTogether } from '@/lib/format';
import { formatPct, gainTone, platformLabel } from '@/lib/invest';
import styles from './Ideas.module.css';

/** Résumé d'une idée en carte : titre, horizon, actif et performances face au S&P 500. Le raisonnement complet est dans le dialogue. */
export function IdeaCard({ idea, onOpen }: { idea: IdeaView; onOpen: () => void }) {
  const closed = idea.status === 'closed';
  const beat = idea.return !== null && idea.benchReturn !== null ? idea.return > idea.benchReturn : null;
  const where = idea.whereToBuy === 'other' ? 'Ailleurs' : `Sur ${platformLabel(idea.whereToBuy)}`;

  return (
    <Card tone="flat" padding="md" className={styles.card}>
      <button type="button" className={styles.cardButton} onClick={onOpen} aria-label={`Voir le raisonnement : ${idea.title}`} />
      <header className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{keepTogether(idea.title)}</h3>
        <span className="eyebrow">{closed ? `Close le ${formatDateCompact(idea.horizon)}` : `D’ici le ${formatDateCompact(idea.horizon)}`}</span>
      </header>

      <div className={styles.asset}>
        <span className={styles.assetName}>{idea.assetName}</span>
        <span className="mono">{idea.ticker}</span>
        <span className={styles.where}>{where}</span>
      </div>

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
          <Badge tone={beat ? 'positive' : 'neutral'} className={styles.perfVerdict}>
            {beat ? 'A battu le S&P 500' : 'N’a pas battu le S&P 500'}
          </Badge>
        ) : null}
      </footer>
    </Card>
  );
}
