import { ArrowUp, RotateCcw, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { useAsk, type AskTurn } from './ask-context';
import { AskMessage } from './AskMessage';
import styles from './AskPanel.module.css';

export const ASK_SUGGESTIONS = ['Combien en restos ce mois-ci ?', 'Mes plus grosses dépenses du mois dernier', 'Quels abonnements ont augmenté cette année ?'];

const MAX_INPUT_LINES = 4;

/** Panneau non modal de conversation avec Claude : la page reste visible et utilisable à côté. */
export function AskPanel({ renderActions }: { renderActions?: (turn: AskTurn) => ReactNode }) {
  const { open, setOpen, turns, pending, send, stop, retry, reset } = useAsk();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // À l'ouverture, le focus va dans le champ ; à la fermeture, il revient là où il était.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => returnFocus.current?.focus();
  }, [open]);

  // Le fil défile vers le bas à chaque question, étape ou réponse.
  const last = turns.at(-1);
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [turns.length, last?.step, last?.status]);

  // Le champ grandit avec le texte, jusqu'à quatre lignes.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    const line = parseFloat(getComputedStyle(input).lineHeight) || 20;
    input.style.height = `${Math.min(input.scrollHeight, line * MAX_INPUT_LINES + 16)}px`;
  }, [draft, open]);

  if (!open) return null;

  const submit = (question: string) => {
    if (!question.trim() || pending) return;
    send(question);
    setDraft('');
  };

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };

  return (
    <aside
      className={styles.panel}
      aria-label="Demander à Claude"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>
          <Sparkles aria-hidden />
          Demander
        </h2>
        <div className={styles.headerActions}>
          {turns.length > 0 ? <Button size="sm" variant="ghost" icon={<RotateCcw />} aria-label="Nouvelle conversation" title="Nouvelle conversation" onClick={reset} /> : null}
          <Button size="sm" variant="ghost" icon={<X />} aria-label="Fermer" title="Fermer (Échap)" onClick={() => setOpen(false)} />
        </div>
      </header>

      <div ref={threadRef} className={styles.thread}>
        {turns.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Pose une question sur ton argent. Claude lit tes données sans rien modifier, et te propose des actions que tu valides d’un clic.</p>
            <ul className={styles.suggestions} aria-label="Suggestions">
              {ASK_SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" className={styles.suggestion} onClick={() => submit(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className={styles.turns}>
            {turns.map((turn) => (
              <AskMessage key={turn.id} turn={turn} onRetry={() => retry(turn.id)} renderActions={renderActions} />
            ))}
          </ol>
        )}
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <textarea
          ref={inputRef}
          className={styles.input}
          aria-label="Ta question"
          placeholder="Combien en restos depuis mars ?"
          rows={1}
          maxLength={500}
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKey}
        />
        {pending ? (
          <Button size="sm" variant="secondary" icon={<Square />} aria-label="Arrêter" title="Arrêter" onClick={stop} className={styles.send} />
        ) : (
          <Button type="submit" size="sm" variant="primary" icon={<ArrowUp />} aria-label="Envoyer" title="Envoyer (Entrée)" disabled={!draft.trim()} className={styles.send} />
        )}
      </form>
    </aside>
  );
}
