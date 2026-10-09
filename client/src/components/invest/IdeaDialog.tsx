import { ArrowUpRight } from 'lucide-react';
import type { IdeaView } from '@shared/api-types';
import { Dialog } from '@/components/ui';
import { keepTogether } from '@/lib/format';
import { domainOf, formatMarketContext, platformLabel } from '@/lib/invest';
import styles from './IdeaDialog.module.css';

/** Raisonnement complet d'une idée : événement, sources, déduction, actif, contexte de marché, risque. */
export function IdeaDialog({ idea, onClose }: { idea: IdeaView | null; onClose: () => void }) {
  return (
    <Dialog open={idea !== null} onClose={onClose} title={idea?.title ?? ''} size="lg">
      {idea ? <IdeaReasoning idea={idea} /> : null}
    </Dialog>
  );
}

function IdeaReasoning({ idea }: { idea: IdeaView }) {
  const where = idea.whereToBuy === 'other' ? 'Ailleurs' : `Sur ${platformLabel(idea.whereToBuy)}`;

  return (
    <div className={styles.reasoning}>
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
    </div>
  );
}
