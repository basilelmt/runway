import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createRunwayMcpServer } from '../src/ask/mcp';
import { updateEnvelope } from '../src/repos/envelopes';
import { createTransaction } from '../src/repos/transactions';
import { createTestDb } from './helpers';

/** Base de test : Courses à 100 € de budget, 130 € dépensés en février 2026. */
async function connect() {
  const ctx = createTestDb();
  updateEnvelope(ctx.db, ctx.courses.id, { monthlyExtra: 100_00 });
  createTransaction(ctx.db, { kind: 'expense', date: '2026-02-03', amount: 130_00, label: 'MONOP', accountId: ctx.courant.id, envelopeId: ctx.courses.id });
  const server = createRunwayMcpServer(ctx.db.$client, '2026-03-12');
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return { client, ctx };
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

describe('serveur MCP runway', () => {
  it('expose query et month_summary, query renvoie les lignes en JSON', async () => {
    const { client } = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(['query', 'month_summary']);
    const res = (await client.callTool({ name: 'query', arguments: { sql: 'select sum(amount) as total from transactions' } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0]!.text)).toEqual({ rows: [{ total: 130_00 }], truncated: false });
  });

  it('renvoie les erreurs SQL comme résultat d’outil', async () => {
    const { client } = await connect();
    const res = (await client.callTool({ name: 'query', arguments: { sql: 'select nope from transactions' } })) as ToolResult;
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/^Erreur SQL/);
  });

  it('month_summary renvoie les chiffres du Bilan', async () => {
    const { client, ctx } = await connect();
    const res = (await client.callTool({ name: 'month_summary', arguments: { month: '2026-02' } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(res.content[0]!.text);
    expect(body.month).toBe('2026-02');
    expect(body.figures.spent).toBe(130_00);
    expect(body.envelopes).toEqual([{ envelopeId: ctx.courses.id, name: 'Courses', budget: 100_00, spent: 130_00, gap: 30_00 }]);
  });

  it('month_summary refuse un mois futur ou mal formé', async () => {
    const { client } = await connect();
    for (const month of ['2026-04', '2026-3', 'mars']) {
      const res = (await client.callTool({ name: 'month_summary', arguments: { month } })) as ToolResult;
      expect(res.isError, month).toBe(true);
    }
  });
});
