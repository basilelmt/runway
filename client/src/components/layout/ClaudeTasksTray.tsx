import { AlertCircle, Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ClaudeTaskView } from '@shared/api-types';
import { useClaudeTasks, useClaudeTaskSync } from '@/api/hooks';
import { ButtonLink, PulseDot } from '@/components/ui';
import styles from './ClaudeTasksTray.module.css';

/** Une carte finie disparaît seule après ce délai, sauf en échec (elle attend la fermeture). */
const DONE_DISMISS_MS = 10_000;

/** Cartes en bas de l'écran : ce que Claude fait en fond, puis ce qu'il a trouvé. */
export function ClaudeTasksTray() {
  useClaudeTaskSync();
  const { data } = useClaudeTasks();
  // Mémorise les tâches vues en cours dans cet onglet : une tâche déjà finie au premier chargement
  // n'y figure jamais. Ajustée pendant le rendu plutôt que dans un effet (React recommande ce calcul
  // direct pour un état dérivé des props/données, sans aller-retour de rendu supplémentaire).
  const [seenRunning, setSeenRunning] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const newlyRunning = (data ?? []).filter((t) => t.status === 'running' && !seenRunning.has(t.id));
  if (newlyRunning.length > 0) {
    setSeenRunning((prev) => {
      const next = new Set(prev);
      for (const t of newlyRunning) next.add(t.id);
      return next;
    });
  }

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));
  const shown = (data ?? []).filter((t) => seenRunning.has(t.id) && !dismissed.has(t.id));
  if (shown.length === 0) return null;

  return (
    <div className={styles.tray} role="status" aria-live="polite">
      {shown.map((t) => (
        <TaskCard key={t.id} task={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function TaskCard({ task, onDismiss }: { task: ClaudeTaskView; onDismiss: () => void }) {
  // Le parent recrée `onDismiss` à chaque interrogation (toutes les 2 s si un autre travail tourne) :
  // le compte à rebours ne dépend que du passage à « fini », pas de ces rendus.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  useEffect(() => {
    if (task.status !== 'done') return;
    const timer = window.setTimeout(() => dismissRef.current(), DONE_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [task.status]);
  const outcome = task.status === 'done' ? (task.result ?? task.label) : task.error;

  return (
    <div className={styles.card} data-status={task.status}>
      <span className={styles.icon}>
        {task.status === 'running' ? <PulseDot /> : task.status === 'done' ? <Check aria-hidden /> : <AlertCircle aria-hidden />}
      </span>
      <div className={styles.body}>
        {task.status === 'running' ? (
          <p className={styles.text}>{task.label}</p>
        ) : (
          // Une fois fini, le sujet rappelle de quoi parle le résultat : « SC-Fourteen · Rien trouvé sur le web ».
          <p className={styles.text}>
            <strong className={styles.title}>{task.title}</strong> · {outcome}
          </p>
        )}
        {task.status === 'done' && task.kind === 'ideas' ? (
          <ButtonLink to="/investir" size="sm" variant="text" className={styles.see}>
            Voir
          </ButtonLink>
        ) : null}
      </div>
      <button type="button" className={styles.close} aria-label="Fermer" onClick={onDismiss}>
        <X aria-hidden />
      </button>
    </div>
  );
}
