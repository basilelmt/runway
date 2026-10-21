import { Crosshair, RotateCcw } from 'lucide-react';
import { Amount, Button, KeyFigure, Notice, PulseDot } from '@/components/ui';
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
      <p className={styles.question}>{turn.question}</p>
      {turn.refs.length > 0 ? (
        <ul className={[styles.refs, styles.questionRefs].join(' ')} aria-label="Blocs montrés">
          {turn.refs.map((ref) => (
            <li key={`${ref.kind}-${ref.id}-${ref.label}`} className={styles.ref}>
              <Crosshair aria-hidden />
              <span className={styles.refLabel}>{ref.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {turn.status === 'pending' ? (
        <p className={styles.pending}>
          <PulseDot />
          <span role="status" aria-live="polite">
            {turn.step ?? 'Je réfléchis…'}
          </span>
        </p>
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
          {turn.answer.highlight ? (
            <KeyFigure size="compact" label={turn.answer.highlight.label} figure={<Amount cents={turn.answer.highlight.amount} size="lg" tone="neutral" />} />
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
