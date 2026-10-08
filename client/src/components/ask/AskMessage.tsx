import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Amount, Button } from '@/components/ui';
import type { AskTurn } from './ask-context';
import { AskChart } from './AskChart';
import styles from './AskPanel.module.css';

type AskMessageProps = {
  turn: AskTurn;
  onRetry: () => void;
  /** Cartes d'action, rendues sous la réponse. */
  renderActions?: (turn: AskTurn) => ReactNode;
};

/** Un tour du fil : la question, puis l'attente, la réponse ou l'erreur. */
export function AskMessage({ turn, onRetry, renderActions }: AskMessageProps) {
  return (
    <li className={styles.turn}>
      <p className={styles.question}>{turn.question}</p>
      {turn.status === 'pending' ? (
        <p className={styles.pending} role="status" aria-live="polite">
          <span className={styles.pulse} aria-hidden />
          {turn.step ?? 'Je réfléchis…'}
        </p>
      ) : null}
      {turn.status === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{turn.error}</p>
          <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      ) : null}
      {turn.answer ? (
        <div className={styles.answer}>
          {turn.answer.highlight ? (
            <div className={styles.highlight}>
              <span className="eyebrow">{turn.answer.highlight.label}</span>
              <Amount cents={turn.answer.highlight.amount} size="lg" tone="neutral" />
            </div>
          ) : null}
          <p className={styles.text}>{turn.answer.answer}</p>
          {turn.answer.chart ? <AskChart data={turn.answer.chart} /> : null}
          {renderActions?.(turn)}
        </div>
      ) : null}
    </li>
  );
}
