import { RotateCcw } from 'lucide-react';
import { Amount, Button, Notice, PulseDot } from '@/components/ui';
import { keepTogether } from '@/lib/format';
import type { AskTurn } from './ask-context';
import { ActionCard } from './ActionCard';
import { AskChart } from './AskChart';
import styles from './AskPanel.module.css';

type AskMessageProps = {
  turn: AskTurn;
  onRetry: () => void;
};

/** Un tour du fil : la question, puis l'attente, la réponse ou l'erreur. */
export function AskMessage({ turn, onRetry }: AskMessageProps) {
  return (
    <li className={styles.turn}>
      <div className={styles.ask}>
        <p className={styles.question}>{turn.question}</p>
        {turn.refs.length > 0 ? (
          <ul className={styles.questionRefs} aria-label="Blocs montrés">
            {turn.refs.map((ref) => (
              <li key={`${ref.kind}-${ref.id}-${ref.label}`} className={styles.questionRef}>
                <span className={styles.questionRefLabel}>{ref.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {turn.status === 'pending' ? (
        <div className={styles.answer}>
          <Sources sources={turn.sources} />
          <p className={styles.pending}>
            <PulseDot />
            <span role="status" aria-live="polite">
              {turn.step ?? 'Je réfléchis…'}
            </span>
          </p>
        </div>
      ) : null}
      {turn.status === 'error' ? (
        <Notice
          tone="negative"
          action={
            <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={onRetry}>
              Réessayer
            </Button>
          }
        >
          {turn.error}
        </Notice>
      ) : null}
      {turn.answer ? (
        <div className={styles.answer}>
          <Sources sources={turn.sources} />
          {turn.answer.highlight ? (
            <p className={styles.figure}>
              <Amount cents={turn.answer.highlight.amount} size="lg" className={styles.figureAmount} />
              <span className={styles.figureLabel}>{turn.answer.highlight.label}</span>
            </p>
          ) : null}
          <p className={styles.text}>{keepTogether(turn.answer.answer)}</p>
          {turn.answer.chart ? <AskChart data={turn.answer.chart} /> : null}
          {turn.answer.actions.length > 0 ? (
            <ul className={styles.actions} aria-label="Actions proposées">
              {turn.answer.actions.map((action, i) => (
                <ActionCard key={i} action={action} />
              ))}
            </ul>
          ) : null}
          {turn.answer.notices.length > 0 ? (
            <ul className={styles.notices}>
              {turn.answer.notices.map((notice, i) => (
                <li key={i} className={styles.notice}>
                  {keepTogether(notice)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Ce que Claude a consulté pour répondre, en petites étiquettes au-dessus de la réponse. */
function Sources({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null;
  return (
    <ul className={styles.sources} aria-label="Sources consultées">
      {sources.map((s) => (
        <li key={s} className={styles.source}>
          {s}
        </li>
      ))}
    </ul>
  );
}
