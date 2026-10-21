import { describe, expect, it } from 'vitest';
import { createRun, finishRun } from '../src/repos/ideas';
import { createClaudeTasks } from '../src/services/claude-tasks';
import { createTestApp, type TestApp } from './helpers';

describe('createClaudeTasks', () => {
  it('suit une tâche du début à la fin, puis l’oublie après 10 minutes', () => {
    let t = new Date('2026-10-21T10:00:00Z');
    const tasks = createClaudeTasks({ now: () => t });
    const id = tasks.start('merchant_web', 'Claude cherche SC-Fourteen sur le web', 'SC-FOURTEEN CA');
    expect(tasks.list()).toMatchObject([{ id, status: 'running', subject: 'SC-FOURTEEN CA', finishedAt: null }]);
    expect(tasks.find('merchant_web', 'SC-FOURTEEN CA')?.id).toBe(id);
    t = new Date('2026-10-21T10:01:00Z');
    tasks.finish(id, 'Bar-restaurant, Paris (14e)');
    expect(tasks.list()[0]).toMatchObject({ status: 'done', result: 'Bar-restaurant, Paris (14e)', finishedAt: '2026-10-21T10:01:00.000Z' });
    expect(tasks.find('merchant_web', 'SC-FOURTEEN CA')).toBeNull();
    t = new Date('2026-10-21T10:11:01Z');
    expect(tasks.list()).toEqual([]);
  });

  it('garde l’erreur d’un échec, et 20 tâches au plus, les plus récentes d’abord', () => {
    let n = 0;
    const tasks = createClaudeTasks({ now: () => new Date(Date.UTC(2026, 9, 21, 10, 0, n++)) });
    const failed = tasks.start('merchant_naming', 'Claude décrit tes marchands');
    tasks.fail(failed, 'Claude Code n’est pas installé');
    expect(tasks.list()[0]).toMatchObject({ status: 'failed', error: 'Claude Code n’est pas installé' });
    for (let i = 0; i < 25; i++) tasks.start('merchant_web', `t${i}`, `K${i}`);
    expect(tasks.list()).toHaveLength(20);
    expect(tasks.list()[0]!.label).toBe('t24');
  });
});

describe('GET /api/claude/tasks', () => {
  it('fusionne le registre et les fournées d’idées en cours ou récentes', async () => {
    const t: TestApp = createTestApp('2026-10-21');
    const now = Date.now();
    const running = createRun(t.db, 'manual', new Date(now - 60_000).toISOString());
    const recent = createRun(t.db, 'manual', new Date(now - 7 * 60_000).toISOString());
    finishRun(t.db, recent.id, { status: 'done', finishedAt: new Date(now - 5 * 60_000).toISOString(), acceptedCount: 3 });
    const old = createRun(t.db, 'manual', new Date(now - 30 * 60_000).toISOString());
    finishRun(t.db, old.id, { status: 'done', finishedAt: new Date(now - 20 * 60_000).toISOString(), acceptedCount: 1 });

    const res = await t.call('GET', '/api/claude/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject([
      { id: `ideas-${running.id}`, kind: 'ideas', label: "Claude cherche des idées d'investissement", status: 'running' },
      { id: `ideas-${recent.id}`, kind: 'ideas', label: "Claude cherche des idées d'investissement", status: 'done', result: '3 idées retenues' },
    ]);
    expect(res.body).toHaveLength(2);
  });
});
