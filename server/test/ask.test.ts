import { beforeEach, describe, expect, it } from 'vitest';
import { recurringRuleInputSchema } from '@shared/schemas';
import { createRule } from '../src/repos/recurring-rules';
import { createTransaction } from '../src/repos/transactions';
import type { StreamExec } from '../src/services/claude';
import { createTestApp, type TestApp } from './helpers';

const SESSION = '11111111-1111-4111-8111-111111111111';
const line = (o: unknown) => JSON.stringify(o);

/** Faux `claude` : rejoue un appel d'outil puis une réponse structurée ; `structured` peut être différé (le test a besoin de connaître un id créé après coup). */
function fakeStream(structured: unknown | (() => unknown), calls: string[][] = []): StreamExec {
  return async (args, { onLine }) => {
    calls.push(args);
    onLine(line({ type: 'system', subtype: 'init', session_id: SESSION, mcp_servers: [{ name: 'runway', status: 'connected' }] }));
    onLine(line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__runway__query', input: { sql: 'select sum(amount) from transactions' } }] } }));
    onLine(line({ type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: '{"rows":[]}' }] }] } }));
    onLine(line({ type: 'result', subtype: 'success', is_error: false, session_id: SESSION, structured_output: typeof structured === 'function' ? (structured as () => unknown)() : structured }));
    return { stderr: '', exitCode: 0 };
  };
}

function parseSse(text: string) {
  return text
    .split('\n\n')
    .filter((b) => b.trim())
    .map((block) => {
      const event = /event: (.*)/.exec(block)?.[1];
      const data = /data: (.*)/.exec(block)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}

let t: TestApp;
let calls: string[][];

async function ask(question: string, sessionId: string | null = null) {
  const res = await t.app.request('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, sessionId }) });
  return { status: res.status, events: parseSse(await res.text()) };
}

describe('POST /api/ask', () => {
  beforeEach(() => {
    calls = [];
  });

  it('relaie les étapes puis la réponse, avec le graphique exécuté par le serveur', async () => {
    t = createTestApp('2026-03-12', {
      askStream: fakeStream(
        {
          answer: 'Tu as dépensé 20 €.',
          highlight: { label: 'Restos', amount: 20_00 },
          chart: { kind: 'bar', title: 'Par jour', sql: 'select date as label, sum(amount) as value from transactions group by date order by date' },
          actions: [],
        },
        calls,
      ),
      askSessionId: () => SESSION,
    });
    createTransaction(t.db, { kind: 'expense', date: '2026-03-01', amount: 12_00, label: 'A', accountId: t.courant.id });
    createTransaction(t.db, { kind: 'expense', date: '2026-03-02', amount: 8_00, label: 'B', accountId: t.courant.id });
    const { status, events } = await ask('Combien en restos ?');
    expect(status).toBe(200);
    expect(events[0]).toEqual({ event: 'step', data: { text: 'Je consulte tes opérations…' } });
    expect(events.at(-1)).toEqual({
      event: 'answer',
      data: {
        sessionId: SESSION,
        answer: 'Tu as dépensé 20 €.',
        highlight: { label: 'Restos', amount: 20_00 },
        chart: { kind: 'bar', title: 'Par jour', rows: [{ label: '2026-03-01', value: 12_00 }, { label: '2026-03-02', value: 8_00 }] },
        actions: [],
        notices: [],
      },
    });
  });

  it('transmet au client le motif d’une action refusée', async () => {
    t = createTestApp('2026-03-12', {
      askStream: fakeStream(() => ({ answer: 'Ok', highlight: null, chart: null, actions: [{ type: 'budget', envelopeId: t.courses.id, monthlyTarget: 10_00 }] })),
      askSessionId: () => SESSION,
    });
    createRule(
      t.db,
      recurringRuleInputSchema.parse({ name: 'Navigo', kind: 'expense', amount: 40_00, label: 'NAVIGO', accountId: t.courant.id, envelopeId: t.courses.id, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-05' }),
    );
    const { events } = await ask('Q');
    expect(events.at(-1)).toEqual({
      event: 'answer',
      data: {
        sessionId: SESSION,
        answer: 'Ok',
        highlight: null,
        chart: null,
        actions: [],
        notices: ['Le budget de Courses ne peut pas descendre sous ses charges fixes (40,00 €)'],
      },
    });
  });

  it('lance claude isolé, puis reprend la session pour une suite', async () => {
    t = createTestApp('2026-03-12', { askStream: fakeStream({ answer: 'Ok', highlight: null, chart: null, actions: [] }, calls), askSessionId: () => SESSION });
    await ask('Première');
    await ask('Et ensuite ?', SESSION);
    const [first, second] = calls;
    expect(first).toEqual(
      expect.arrayContaining(['-p', '--setting-sources', '', '--tools', '', '--strict-mcp-config', '--allowedTools', 'mcp__runway__query', '--output-format', 'stream-json', '--verbose', '--session-id', SESSION]),
    );
    expect(first![first!.indexOf('--settings') + 1]).toBe('{"autoMemoryEnabled":false}');
    expect(first).toContain('--system-prompt');
    expect(first).not.toContain('--resume');
    expect(second).toEqual(expect.arrayContaining(['--resume', SESSION]));
    expect(second).not.toContain('--session-id');
    expect(first!.at(-1)).toBe('Première');
  });

  it('omet un graphique invalide et écarte les actions invalides', async () => {
    t = createTestApp('2026-03-12', {
      askStream: fakeStream({
        answer: 'Ok',
        highlight: null,
        chart: { kind: 'line', title: 'X', sql: 'select nope' },
        actions: [{ type: 'budget', envelopeId: 9999, monthlyTarget: 1 }, { type: 'budget', envelopeId: 0, monthlyTarget: 1 }],
      }),
      askSessionId: () => SESSION,
    });
    const { events } = await ask('Q');
    expect(events.at(-1)!.data).toMatchObject({ chart: null, actions: [] });
  });

  it('traduit une réponse Claude en erreur et refuse une question vide', async () => {
    const notLogged: StreamExec = async (_a, { onLine }) => {
      onLine(line({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' }));
      return { stderr: '', exitCode: 1 };
    };
    t = createTestApp('2026-03-12', { askStream: notLogged, askSessionId: () => SESSION });
    const { events } = await ask('Q');
    expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'claude_not_logged_in', message: expect.stringContaining('/login') } });
    const empty = await t.app.request('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: ' ', sessionId: null }) });
    expect(empty.status).toBe(400);
  });

  it('signale l’absence de claude et une sortie sans réponse', async () => {
    const missing: StreamExec = async () => ({ stderr: 'spawn claude ENOENT', exitCode: 127 });
    t = createTestApp('2026-03-12', { askStream: missing, askSessionId: () => SESSION });
    expect((await ask('Q')).events.at(-1)).toMatchObject({ event: 'error', data: { code: 'claude_not_installed' } });
    const silent: StreamExec = async () => ({ stderr: '', exitCode: 0 });
    t = createTestApp('2026-03-12', { askStream: silent, askSessionId: () => SESSION });
    expect((await ask('Q')).events.at(-1)).toMatchObject({ event: 'error', data: { code: 'claude_invalid_output' } });
  });

  it('s’arrête avec une erreur claire si le serveur de données ne démarre pas', async () => {
    let aborted = false;
    const mcpFailed: StreamExec = async (_a, { onLine, signal }) => {
      onLine(line({ type: 'system', subtype: 'init', session_id: SESSION, mcp_servers: [{ name: 'runway', status: 'failed' }] }));
      aborted = signal.aborted;
      return { stderr: '', exitCode: signal.aborted ? 130 : 0 };
    };
    t = createTestApp('2026-03-12', { askStream: mcpFailed, askSessionId: () => SESSION });
    expect((await ask('Q')).events.at(-1)).toMatchObject({ event: 'error', data: { code: 'ask_data_unavailable' } });
    expect(aborted).toBe(true);
  });

  it('additionne les lignes de même libellé et refuse un graphique tronqué', async () => {
    const chartOf = (sql: string) =>
      fakeStream({ answer: 'Ok', highlight: null, chart: { kind: 'bar', title: 'Par mois', sql }, actions: [] });
    t = createTestApp('2026-03-12', { askStream: chartOf("select substr(date, 1, 7) as label, amount as value from transactions order by date"), askSessionId: () => SESSION });
    createTransaction(t.db, { kind: 'expense', date: '2026-02-10', amount: 5_00, label: 'A', accountId: t.courant.id });
    createTransaction(t.db, { kind: 'expense', date: '2026-03-01', amount: 12_00, label: 'B', accountId: t.courant.id });
    createTransaction(t.db, { kind: 'expense', date: '2026-03-02', amount: 8_00, label: 'C', accountId: t.courant.id });
    expect((await ask('Q')).events.at(-1)!.data.chart).toEqual({ kind: 'bar', title: 'Par mois', rows: [{ label: '2026-02', value: 5_00 }, { label: '2026-03', value: 20_00 }] });

    t = createTestApp('2026-03-12', { askStream: chartOf('select label, amount as value from transactions'), askSessionId: () => SESSION });
    for (let i = 0; i < 70; i++) createTransaction(t.db, { kind: 'expense', date: '2026-03-01', amount: 1_00, label: `op ${i}`, accountId: t.courant.id });
    expect((await ask('Q')).events.at(-1)!.data.chart).toBeNull();
  });
});
