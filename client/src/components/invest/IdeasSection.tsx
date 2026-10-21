import { Lightbulb, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { IdeaRunView, IdeaView } from '@shared/api-types';
import { IDEA_ANGLES } from '@shared/invest';
import { errorMessage } from '@/api/client';
import { useIdeaRun, useIdeas, useStartIdeaRun } from '@/api/hooks';
import { Button, Disclosure, EmptyState, ErrorState, Notice, PulseDot, SectionHeader, Skeleton } from '@/components/ui';
import { keepTogether } from '@/lib/format';
import { failedAnglesText, formatPct, gainTone, ideasTotal, runOutcome } from '@/lib/invest';
import { IdeaCard } from './IdeaCard';
import { IdeaDialog } from './IdeaDialog';
import { IdeasScore } from './IdeasScore';
import styles from './Ideas.module.css';

/** Idées tirées de l'actualité : fournée hebdomadaire à l'arrivée, bouton pour en demander d'autres, suivi de la fournée en cours. */
export function IdeasSection() {
  const ideas = useIdeas();
  const [runId, setRunId] = useState<number | null>(null);
  const [open, setOpen] = useState<IdeaView | null>(null);
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
      <SectionHeader
        id="ideas-title"
        title="Idées"
        description={`Trouvées par ${IDEA_ANGLES.length} chercheurs, passées au crible par un critique, suivies face au S&P 500.`}
        aside={
          <Button size="sm" icon={<Sparkles />} onClick={() => start.mutate('manual')} disabled={running}>
            Trouver des idées
          </Button>
        }
      />

      {running ? (
        <Notice tone="neutral" icon={<PulseDot />} role="status">
          {current?.phase === 'review'
            ? 'Claude passe les pistes au crible.'
            : `${IDEA_ANGLES.length} chercheurs fouillent l’actualité. Ça prend plusieurs minutes, tu peux continuer ailleurs.`}
        </Notice>
      ) : current && current.id === runId ? (
        <RunReport run={current} onRetry={() => start.mutate('manual')} />
      ) : null}
      {start.error ? <Notice tone="negative">{errorMessage(start.error)}</Notice> : null}

      {ideas.isError ? (
        <ErrorState title="Impossible de charger les idées" description={errorMessage(ideas.error)} onRetry={() => ideas.refetch()} />
      ) : !data ? (
        <div className={styles.grid}>
          <Skeleton height={260} />
          <Skeleton height={260} />
        </div>
      ) : (
        <>
          {data.open.length === 0 && !running ? (
            <EmptyState
              icon={<Lightbulb />}
              title="Pas encore d’idées"
              description={`${IDEA_ANGLES.length} chercheurs fouillent l’actualité, un critique ne garde que ce que le marché n’a pas encore vu.`}
            />
          ) : (
            <>
              <OpenTotal ideas={data.open} />
              <div className={[styles.grid, 'stagger'].join(' ')}>
                {data.open.map((i) => (
                  <IdeaCard key={i.id} idea={i} onOpen={() => setOpen(i)} />
                ))}
              </div>
            </>
          )}

          <IdeasScore summary={data.summary} />

          {data.closed.length > 0 ? (
            <Disclosure label="Afficher les idées closes" openLabel="Masquer les idées closes" count={data.closed.length}>
              <div className={styles.grid}>
                {data.closed.map((i) => (
                  <IdeaCard key={i.id} idea={i} onOpen={() => setOpen(i)} />
                ))}
              </div>
            </Disclosure>
          ) : null}
        </>
      )}

      <IdeaDialog idea={open} onClose={() => setOpen(null)} />
    </section>
  );
}

/** Gain moyen des idées en cours, comme si 100 € avaient été mis sur chacune, face au S&P 500 sur les mêmes périodes. */
function OpenTotal({ ideas }: { ideas: IdeaView[] }) {
  const total = ideasTotal(ideas);
  if (!total) return null;
  return (
    <p className={styles.scoreLine}>
      {total.count > 1 ? `Ensemble, les ${total.count} idées en cours font` : 'L’idée en cours fait'}{' '}
      <strong className={['num', styles[gainTone(total.ideas)]].join(' ')}>{formatPct(total.ideas, { signed: true })}</strong>, contre{' '}
      <span className="num">{formatPct(total.bench, { signed: true })}</span> pour le S&P 500 sur les mêmes périodes.
    </p>
  );
}

function RunReport({ run, onRetry }: { run: IdeaRunView; onRetry: () => void }) {
  if (run.status === 'failed') {
    return (
      <Notice tone="negative" action={<Button size="sm" onClick={onRetry}>Réessayer</Button>}>
        La recherche d’idées a échoué : {run.error ?? 'erreur inconnue'}
      </Notice>
    );
  }
  return (
    <div className={styles.report} role="status">
      <span>{runOutcome(run)}</span>
      {run.failedAngles.length > 0 ? <span>{failedAnglesText(run.failedAngles)}</span> : null}
      {run.rejected.length > 0 ? (
        <details className={styles.rejected}>
          <summary>Voir pourquoi</summary>
          <ul>
            {run.rejected.map((r, i) => (
              <li key={i}>
                <span className="mono">{r.ticker}</span>{keepTogether(` : ${r.reason}`)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
