import { ChevronDown, Lightbulb, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { IdeaRunView } from '@shared/api-types';
import { errorMessage } from '@/api/client';
import { useIdeaRun, useIdeas, useStartIdeaRun } from '@/api/hooks';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { plural } from '@/lib/format';
import { IdeaCard } from './IdeaCard';
import { IdeasScore } from './IdeasScore';
import styles from './Ideas.module.css';

/** Idées tirées de l'actualité : fournée hebdomadaire à l'arrivée, bouton pour en demander d'autres, suivi de la fournée en cours. */
export function IdeasSection() {
  const ideas = useIdeas();
  const [runId, setRunId] = useState<number | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const start = useStartIdeaRun({ onSuccess: (r) => r.started && r.run && setRunId(r.run.id) });
  const run = useIdeaRun(runId);

  // Reprend une fournée déjà en cours (lancée avant un rechargement de la page).
  const lastRun = ideas.data?.lastRun ?? null;
  if (runId === null && lastRun?.status === 'running') setRunId(lastRun.id);

  // Fournée hebdomadaire : le serveur ne lance rien si la dernière a moins de 7 jours.
  const weekly = useRef(false);
  const { mutate } = start;
  useEffect(() => {
    if (weekly.current || !ideas.data) return;
    weekly.current = true;
    mutate('weekly');
  }, [ideas.data, mutate]);

  const current: IdeaRunView | null = run.data ?? (runId !== null && lastRun?.id === runId ? lastRun : null);
  // La demande hebdomadaire que le serveur ignore ne doit pas faire clignoter l'état « en cours ».
  const running = current?.status === 'running' || (start.isPending && start.variables === 'manual');
  const data = ideas.data;

  return (
    <section aria-labelledby="ideas-title" className={styles.section}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 id="ideas-title">Idées</h2>
          <p className={styles.subtitle}>Tirées de l’actualité par Claude, suivies face au S&P 500.</p>
        </div>
        <Button icon={<Sparkles />} onClick={() => start.mutate('manual')} disabled={running}>
          Trouver des idées
        </Button>
      </div>

      {running ? (
        <p className={styles.running} role="status">
          <span className={styles.pulse} aria-hidden />
          Claude lit l’actualité et cherche des idées. Ça prend quelques minutes, tu peux continuer ailleurs.
        </p>
      ) : current && current.id === runId ? (
        <RunReport run={current} onRetry={() => start.mutate('manual')} />
      ) : null}
      {start.error ? (
        <p className={styles.failed} role="alert">
          {errorMessage(start.error)}
        </p>
      ) : null}

      {ideas.isError ? (
        <EmptyState title="Impossible de charger les idées" description={errorMessage(ideas.error)} action={<Button onClick={() => ideas.refetch()}>Réessayer</Button>} />
      ) : !data ? (
        <div className={styles.grid}>
          <Skeleton height={260} />
          <Skeleton height={260} />
        </div>
      ) : (
        <>
          {data.open.length === 0 && !running ? (
            <EmptyState icon={<Lightbulb />} title="Pas encore d’idées" description="Claude cherche dans l’actualité des événements à venir et ce qu’ils pourraient faire monter." />
          ) : (
            <div className={[styles.grid, 'stagger'].join(' ')}>
              {data.open.map((i) => (
                <IdeaCard key={i.id} idea={i} />
              ))}
            </div>
          )}

          <IdeasScore summary={data.summary} />

          {data.closed.length > 0 ? (
            <div className={styles.closed}>
              <button type="button" className={styles.closedToggle} aria-expanded={showClosed} onClick={() => setShowClosed((v) => !v)}>
                <ChevronDown aria-hidden className={showClosed ? styles.chevronOpen : ''} />
                {plural(data.closed.length, 'idée close', 'idées closes')}
              </button>
              {showClosed ? (
                <div className={styles.grid}>
                  {data.closed.map((i) => (
                    <IdeaCard key={i.id} idea={i} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function RunReport({ run, onRetry }: { run: IdeaRunView; onRetry: () => void }) {
  if (run.status === 'failed') {
    return (
      <div className={styles.failed} role="alert">
        <span>La recherche d’idées a échoué : {run.error ?? 'erreur inconnue'}</span>
        <Button size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      </div>
    );
  }
  return (
    <div className={styles.report} role="status">
      <span>
        {run.acceptedCount === 0 ? 'Aucune nouvelle idée retenue' : plural(run.acceptedCount, 'idée ajoutée', 'idées ajoutées')}
        {run.rejected.length > 0 ? ` · ${plural(run.rejected.length, 'écartée', 'écartées')}` : ''}
      </span>
      {run.rejected.length > 0 ? (
        <details className={styles.rejected}>
          <summary>Voir pourquoi</summary>
          <ul>
            {run.rejected.map((r, i) => (
              <li key={i}>
                <span className="mono">{r.ticker}</span> : {r.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
