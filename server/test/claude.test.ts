import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { BATCH_SIZE, buildPrompt, runClaudeSort, type Exec, type ExecResult } from '../src/services/claude';
import { createTestDb, type TestContext } from './helpers';

const input = {
  transactions: [
    { id: 1, date: '2026-03-12', label: 'CARTE X1234 CARREFOUR MARKET', amount: 62_30 },
    { id: 2, date: '2026-03-11', label: 'PRLV EDF', amount: 45_00 },
  ],
  envelopes: [
    { id: 10, name: 'Courses' },
    { id: 11, name: 'Logement' },
  ],
  rules: [{ pattern: 'carrefour', envelopeId: 10 }],
  examples: [{ label: 'CB LECLERC', envelopeId: 10 }],
};

function ok(structured: unknown): ExecResult {
  return { stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 };
}

describe('buildPrompt', () => {
  it('contient enveloppes, règles, exemples et opérations', () => {
    const p = buildPrompt(input);
    expect(p).toContain('- 10 : Courses');
    expect(p).toContain('"carrefour" -> enveloppe 10');
    expect(p).toContain('"CB LECLERC" -> enveloppe 10');
    expect(p).toContain('id 1 | 2026-03-12 | 62.30 € | CARTE X1234 CARREFOUR MARKET');
  });
});

describe('runClaudeSort', () => {
  it('passe les bons arguments et renvoie les suggestions validées', async () => {
    const exec = vi.fn<Exec>(async () =>
      ok({
        suggestions: [
          { transactionId: 1, envelopeId: 10, reason: 'supermarché' },
          { transactionId: 2, envelopeId: 11, reason: 'électricité' },
          { transactionId: 99, envelopeId: 10, reason: 'inconnue' },
          { transactionId: 1, envelopeId: 42, reason: 'enveloppe inexistante' },
        ],
        rules: [
          { pattern: 'EDF', envelopeId: 11 },
          { pattern: 'Carrefour', envelopeId: 10 },
          { pattern: 'XYZ', envelopeId: 42 },
        ],
      }),
    );
    const result = await runClaudeSort({ ...input, model: 'haiku' }, { exec });
    const args = exec.mock.calls[0]![0];
    expect(args.slice(0, 5)).toEqual(['-p', '--tools', '', '--output-format', 'json']);
    expect(args).toContain('--json-schema');
    expect(args).toContain('--model');
    expect(args).toContain('haiku');
    expect(result.suggestions).toEqual([
      { transactionId: 1, envelopeId: 10, reason: 'supermarché' },
      { transactionId: 2, envelopeId: 11, reason: 'électricité' },
      { transactionId: 1, envelopeId: null, reason: 'enveloppe inexistante' },
    ]);
    expect(result.rules).toEqual([{ pattern: 'EDF', envelopeId: 11 }]);
  });

  it('découpe en lots', async () => {
    const exec = vi.fn<Exec>(async () => ok({ suggestions: [], rules: [] }));
    const many = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => ({ id: i + 1, date: '2026-03-01', label: `op ${i}`, amount: 100 }));
    await runClaudeSort({ ...input, transactions: many }, { exec });
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('ne lance rien sans opération', async () => {
    const exec = vi.fn<Exec>();
    expect(await runClaudeSort({ ...input, transactions: [] }, { exec })).toEqual({ suggestions: [], rules: [] });
    expect(exec).not.toHaveBeenCalled();
  });

  it.each<[string, ExecResult, string]>([
    ['binaire absent', { stdout: '', stderr: 'ENOENT', exitCode: 127 }, 'claude_not_installed'],
    ['délai dépassé', { stdout: '', stderr: 'TIMEOUT', exitCode: 124 }, 'claude_timeout'],
    ['non connecté', { stdout: JSON.stringify({ is_error: true, result: 'Not logged in · Please run /login' }), stderr: '', exitCode: 0 }, 'claude_not_logged_in'],
    ['sortie non JSON', { stdout: 'garbage', stderr: '', exitCode: 1 }, 'claude_invalid_output'],
    ['schéma non respecté', ok({ suggestions: [{ transactionId: 'x' }] }), 'claude_invalid_output'],
    ['erreur générique', { stdout: JSON.stringify({ is_error: true, result: 'boom' }), stderr: '', exitCode: 1 }, 'claude_error'],
  ])('erreur typée : %s', async (_name, execResult, code) => {
    const exec = vi.fn<Exec>(async () => execResult);
    await expect(runClaudeSort(input, { exec })).rejects.toMatchObject({ code });
  });
});

describe('routes /api/sorting', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createTestDb();
  });

  it('suggest lit les à trier et apply écrit tout en une fois', async () => {
    const exec = vi.fn<Exec>(async (args) => {
      const prompt = args.at(-1)!;
      expect(prompt).toContain('Inconnu');
      expect(prompt).toContain(`- ${ctx.courses.id} : Courses`);
      return ok({ suggestions: [{ transactionId: 1, envelopeId: ctx.courses.id, reason: 'ok' }], rules: [{ pattern: 'inconnu', envelopeId: ctx.courses.id }] });
    });
    const app = createApp({ db: ctx.db, now: () => '2026-03-10', exec });
    const json = (method: string, path: string, body?: unknown) =>
      app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

    await json('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 12_00, label: 'Inconnu', accountId: ctx.courant.id });
    const suggest = await json('POST', '/api/sorting/suggest');
    expect(suggest.status).toBe(200);
    const body = (await suggest.json()) as any;
    expect(body.suggestions).toEqual([{ transactionId: 1, envelopeId: ctx.courses.id, envelopeName: 'Courses', reason: 'ok' }]);

    const apply = await json('POST', '/api/sorting/apply', { assignments: [{ transactionId: 1, envelopeId: ctx.courses.id }], rules: body.rules });
    expect(await apply.json()).toEqual({ assigned: 1, rulesCreated: 1 });
    expect((await (await json('GET', '/api/transactions?unsorted=true')).json()) as any[]).toHaveLength(0);
    expect((await (await json('GET', '/api/sorting-rules')).json()) as any[]).toHaveLength(1);
  });

  it('remonte une erreur Claude lisible', async () => {
    const exec = vi.fn<Exec>(async () => ({ stdout: '', stderr: 'ENOENT', exitCode: 127 }));
    const app = createApp({ db: ctx.db, now: () => '2026-03-10', exec });
    await app.request('/api/transactions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'expense', date: '2026-03-02', amount: 1, label: 'x', accountId: ctx.courant.id }) });
    const res = await app.request('/api/sorting/suggest', { method: 'POST' });
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).code).toBe('claude_not_installed');
  });
});
