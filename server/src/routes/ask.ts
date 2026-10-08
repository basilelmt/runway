import { Hono } from 'hono';
import { resolve } from 'node:path';
import { streamSSE } from 'hono/streaming';
import { askRequestSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { runAsk } from '../ask/ask';
import { getSettings } from '../repos/settings';
import type { StreamExec } from '../services/claude';
import { validate } from '../validate';

export function askRoutes(deps: { stream?: StreamExec; newSessionId?: () => string } = {}) {
  return new Hono<AppEnv>().post('/', validate('json', askRequestSchema), (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const today = c.get('today');
    const path = db.$client.name;
    return streamSSE(c, async (stream) => {
      // Panneau fermé ou nouvelle question : la connexion se ferme et le processus `claude` est tué.
      const controller = new AbortController();
      stream.onAbort(() => controller.abort());
      // Les écritures sont chaînées pour garder l'ordre, et le flux ne se ferme qu'une fois la dernière envoyée.
      let writes = Promise.resolve();
      await runAsk(
        db,
        { ...input, today },
        { stream: deps.stream, newSessionId: deps.newSessionId, dbPath: path === ':memory:' ? '' : resolve(path), model: getSettings(db).claudeModel || undefined, signal: controller.signal },
        (e) => {
          writes = writes.then(() => stream.writeSSE({ event: e.event, data: JSON.stringify(e.data) }));
        },
      );
      await writes;
    });
  });
}
