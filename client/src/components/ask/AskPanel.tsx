import { ArrowUp, Crosshair, RotateCcw, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AskRef } from '@shared/schemas';
import { Button, ListRow, Textarea } from '@/components/ui';
import { useAsk } from './ask-context';
import { AskOutline } from './AskAim';
import { AskMessage } from './AskMessage';
import { askUi, elementOf, MAX_REFS } from './ask-target';
import styles from './AskPanel.module.css';

export const ASK_SUGGESTIONS = ['Combien en restos ce mois-ci ?', 'Mes plus grosses dépenses du mois dernier', 'Quels abonnements ont augmenté cette année ?'];

const MAX_INPUT_LINES = 4;

/** Panneau non modal de conversation avec Claude : la page reste visible et utilisable à côté. */
export function AskPanel() {
  const { open, setOpen, turns, pending, send, stop, retry, reset, refs, removeRef, aiming, setAiming } = useAsk();
  const [draft, setDraft] = useState('');
  const [shown, setShown] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // À l'ouverture, le focus va dans le champ ; à la fermeture, il revient là où il était.
  // `useLayoutEffect` : le focus bouge dans le même passage que le commit, sans attendre le tour des effets
  // passifs (une autre source ouvre ce panneau via un raccourci global, un effet différé serait un timing fragile).
  useLayoutEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => returnFocus.current?.focus();
  }, [open]);

  // Une fois la réponse arrivée, le champ (désactivé pendant l'attente) reprend le focus pour enchaîner.
  useLayoutEffect(() => {
    if (open && !pending) inputRef.current?.focus();
  }, [open, pending]);

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
      data-aiming={aiming || undefined}
      {...askUi}
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
            <ul className="ledger" aria-label="Suggestions">
              {ASK_SUGGESTIONS.map((s) => (
                <ListRow key={s} compact onClick={() => submit(s)} clickLabel={s} title={s} />
              ))}
            </ul>
          </div>
        ) : (
          <ol className={styles.turns}>
            {turns.map((turn) => (
              <AskMessage key={turn.id} turn={turn} onRetry={() => retry(turn.id)} />
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
        {refs.length > 0 || aiming ? (
          <div className={styles.context}>
            {aiming ? <p className={styles.aimHint}>Clique un bloc de la page pour le montrer à Claude.</p> : null}
            {refs.length > 0 ? (
              <ul className={styles.refs} aria-label="Blocs montrés">
                {refs.map((ref) => (
                  <RefChip key={`${ref.kind}-${ref.id}-${ref.label}`} item={ref} onRemove={() => removeRef(ref)} onShow={(on) => setShown(on ? elementOf(ref) : null)} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className={styles.inputRow}>
          <Button
            size="sm"
            variant={aiming ? 'marking' : 'ghost'}
            icon={<Crosshair />}
            aria-label="Montrer un bloc"
            aria-pressed={aiming}
            title={refs.length >= MAX_REFS ? `${MAX_REFS} blocs au plus` : 'Montrer un bloc de la page'}
            disabled={pending || (!aiming && refs.length >= MAX_REFS)}
            onClick={() => setAiming(!aiming)}
            className={styles.send}
          />
          <Textarea
            ref={inputRef}
            className={styles.field}
            aria-label="Ta question"
            placeholder={refs.length > 0 ? 'Ta question sur ces blocs' : 'Combien en restos depuis mars ?'}
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
        </div>
      </form>
      {shown && !aiming ? <AskOutline el={shown} /> : null}
    </aside>
  );
}

/** Pastille d'un bloc montré : son nom, et × pour le retirer. Au survol, le bloc s'entoure dans la page. */
function RefChip({ item: ref, onRemove, onShow }: { item: AskRef; onRemove: () => void; onShow: (on: boolean) => void }) {
  return (
    <li className={styles.ref} onPointerEnter={() => onShow(true)} onPointerLeave={() => onShow(false)}>
      <Crosshair aria-hidden />
      <span className={styles.refLabel} title={ref.label}>
        {ref.label}
      </span>
      <button
        type="button"
        className={styles.refRemove}
        aria-label={`Retirer ${ref.label}`}
        onClick={() => {
          onShow(false);
          onRemove();
        }}
      >
        <X aria-hidden />
      </button>
    </li>
  );
}
