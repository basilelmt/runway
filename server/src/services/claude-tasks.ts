import type { ClaudeTaskKind, ClaudeTaskView } from '@shared/api-types';

/** Une tâche finie reste visible ce temps-là, pour que le panneau du client ait le temps de l'annoncer. */
export const FINISHED_TTL_MS = 600_000;
const MAX_TASKS = 20;

export type ClaudeTasks = {
  /** `title` : sujet court rappelé à la fin (« SC-Fourteen ») ; par défaut le libellé. */
  start(kind: ClaudeTaskKind, label: string, subject?: string | null, title?: string): string;
  finish(id: string, result?: string | null): void;
  fail(id: string, error: string): void;
  list(): ClaudeTaskView[];
  /** La tâche en cours de ce type pour ce sujet, s'il y en a une. */
  find(kind: ClaudeTaskKind, subject: string): ClaudeTaskView | null;
};

/** Registre en mémoire des travaux longs de Claude, pour le panneau du client. */
export function createClaudeTasks(opts: { now?: () => Date } = {}): ClaudeTasks {
  const now = opts.now ?? (() => new Date());
  const tasks = new Map<string, ClaudeTaskView>();
  // Numéro de création, pour départager deux tâches de même `startedAt` dans l'ordre d'arrivée
  // (comparer les id en chaîne romprait l'ordre : « merchant_web-10 » < « merchant_web-9 »).
  const order = new Map<string, number>();
  let seq = 0;
  const prune = () => {
    const limit = now().getTime() - FINISHED_TTL_MS;
    for (const [id, t] of tasks) {
      if (t.finishedAt && Date.parse(t.finishedAt) < limit) {
        tasks.delete(id);
        order.delete(id);
      }
    }
  };
  const end = (id: string, patch: Partial<ClaudeTaskView>) => {
    const t = tasks.get(id);
    if (t) tasks.set(id, { ...t, ...patch, finishedAt: now().toISOString() });
  };
  return {
    start(kind, label, subject = null, title = label) {
      const id = `${kind}-${++seq}`;
      tasks.set(id, { id, kind, label, title, subject, status: 'running', startedAt: now().toISOString(), finishedAt: null, result: null, error: null });
      order.set(id, seq);
      return id;
    },
    finish: (id, result = null) => end(id, { status: 'done', result }),
    fail: (id, error) => end(id, { status: 'failed', error }),
    list() {
      prune();
      return [...tasks.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || order.get(b.id)! - order.get(a.id)!).slice(0, MAX_TASKS);
    },
    find(kind, subject) {
      return [...tasks.values()].find((t) => t.kind === kind && t.subject === subject && t.status === 'running') ?? null;
    },
  };
}
