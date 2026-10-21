import { Hono } from 'hono';
import type { ClaudeTaskView } from '@shared/api-types';
import type { AppEnv } from '../app';
import { recentIdeaRuns, type IdeaRunRow } from '../repos/ideas';
import { FINISHED_TTL_MS, type ClaudeTasks } from '../services/claude-tasks';

/** Une fournée d'idées vue comme un travail de Claude, pour le panneau du client. */
function ideaRunTask(row: IdeaRunRow): ClaudeTaskView {
  return {
    id: `ideas-${row.id}`,
    kind: 'ideas',
    label: "Claude cherche des idées d'investissement",
    subject: null,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    result: row.status === 'done' ? `${row.acceptedCount} idée${row.acceptedCount > 1 ? 's' : ''} retenue${row.acceptedCount > 1 ? 's' : ''}` : null,
    error: row.error,
  };
}

/** Fusion du registre en mémoire et des fournées d'idées (déjà en base), triée par début décroissant. */
export const claudeTaskRoutes = (tasks: ClaudeTasks) =>
  new Hono<AppEnv>().get('/', (c) => {
    const db = c.get('db');
    const ideas = recentIdeaRuns(db, new Date(Date.now() - FINISHED_TTL_MS).toISOString()).map(ideaRunTask);
    return c.json([...tasks.list(), ...ideas].sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
  });
