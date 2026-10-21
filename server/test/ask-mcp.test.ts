import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import type { ApiFetch } from '../src/ask/mcp';
import { createRunwayMcpServer } from '../src/ask/mcp';
import { updateEnvelope } from '../src/repos/envelopes';
import { createTransaction } from '../src/repos/transactions';
import { createTestDb } from './helpers';

/** Base de test : Courses à 100 € de budget, 130 € dépensés en février 2026. */
async function connect(api: ApiFetch | null = null) {
  const ctx = createTestDb();
  updateEnvelope(ctx.db, ctx.courses.id, { monthlyExtra: 100_00 });
  createTransaction(ctx.db, { kind: 'expense', date: '2026-02-03', amount: 130_00, label: 'MONOP', accountId: ctx.courant.id, envelopeId: ctx.courses.id });
  const server = createRunwayMcpServer(ctx.db.$client, '2026-03-12', { api });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return { client, ctx };
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

const portfolioFixture = {
  today: '2026-03-12',
  totals: { value: 1500_00, invested: 1200_00, gain: 300_00, gainPct: 0.25, realized: 50_00 },
  stale: false,
  binance: { configured: false, apiKeyHint: null, lastSyncAt: null, lastError: null },
  series: [{ date: '2026-03-01', value: 1400_00, invested: 1200_00 }],
  holdings: [
    {
      id: 12,
      platform: 'trade-republic',
      ticker: 'NVDA',
      name: 'NVIDIA',
      source: 'manual',
      quantity: '3',
      costBasis: 1200_00,
      realized: 0,
      price: { eur: 500, date: '2026-03-12', stale: false },
      value: 1500_00,
      gain: 300_00,
      gainPct: 0.25,
      dayChangePct: -0.018,
      unpricedQuantity: null,
      missingQuantity: null,
      trades: [
        { id: 1, side: 'buy', date: '2026-01-05', quantity: '2', amount: 800_00, fees: 0, source: 'manual' },
        { id: 2, side: 'buy', date: '2026-02-10', quantity: '1', amount: 400_00, fees: 0, source: 'manual' },
      ],
      series: [{ date: '2026-03-01', value: 1400_00, invested: 1200_00 }],
    },
  ],
};

const ideasFixture = {
  open: [
    { id: 1, createdOn: '2026-01-10', title: 'Une idée', event: '...', sources: [], reasoning: [], pricedIn: '...', risk: 'Risque X', marketContext: null, ticker: 'ABC', assetName: 'Société ABC', whereToBuy: 'trade-republic', horizon: '2026-04-10', startPriceEur: 10, status: 'open', return: -0.05, benchReturn: -0.01, priceDate: '2026-03-12' },
    { id: 2, createdOn: '2026-02-01', title: 'Une autre idée', event: '...', sources: [], reasoning: [], pricedIn: '...', risk: null, marketContext: null, ticker: 'XYZ', assetName: 'Société XYZ', whereToBuy: 'binance', horizon: '2026-05-01', startPriceEur: 20, status: 'open', return: null, benchReturn: null, priceDate: null },
  ],
  closed: [
    { id: 3, createdOn: '2025-10-01', title: 'Idée close', event: '...', sources: [], reasoning: [], pricedIn: '...', risk: 'Risque Y', marketContext: null, ticker: 'DEF', assetName: 'Société DEF', whereToBuy: 'trade-republic', horizon: '2026-01-01', startPriceEur: 15, status: 'closed', return: 0.1, benchReturn: 0.02, priceDate: '2026-01-01' },
  ],
  summary: { closedCount: 1, beatCount: 1, avgExcess: 0.08, hundredEach: { invested: 100_00, ideas: 110_00, bench: 102_00 }, filter: null },
  lastRun: { id: 9, trigger: 'weekly', status: 'done', phase: null, startedAt: '2026-03-01T00:00:00Z', finishedAt: '2026-03-01T00:05:00Z', acceptedCount: 1, candidateCount: 2, failedAngles: [], rejected: [], error: null },
};

describe('serveur MCP runway', () => {
  it('expose query, month_summary, portfolio et ideas', async () => {
    const { client } = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(['query', 'month_summary', 'portfolio', 'ideas']);
  });

  it('query renvoie les lignes en JSON', async () => {
    const { client } = await connect();
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

  it('portfolio appelle l’API et garde les champs utiles, sans series ni trades', async () => {
    const calls: string[] = [];
    const api: ApiFetch = async (path) => {
      calls.push(path);
      return portfolioFixture;
    };
    const { client } = await connect(api);
    const res = (await client.callTool({ name: 'portfolio', arguments: {} })) as ToolResult;
    expect(res.isError).toBeFalsy();
    expect(calls).toEqual(['/api/invest/portfolio?range=1m']);
    const body = JSON.parse(res.content[0]!.text);
    expect(body).toEqual({
      today: '2026-03-12',
      totals: { value: 1500_00, invested: 1200_00, gain: 300_00, gainPct: 0.25, realized: 50_00 },
      stale: false,
      holdings: [
        {
          id: 12,
          platform: 'trade-republic',
          ticker: 'NVDA',
          name: 'NVIDIA',
          source: 'manual',
          quantity: '3',
          costBasis: 1200_00,
          value: 1500_00,
          gain: 300_00,
          gainPct: 0.25,
          dayChangePct: -0.018,
          realized: 0,
          unpricedQuantity: null,
          missingQuantity: null,
          firstBuy: '2026-01-05',
          tradeCount: 2,
        },
      ],
    });
    expect(body.holdings[0].series).toBeUndefined();
    expect(body.holdings[0].trades).toBeUndefined();
    expect(body.series).toBeUndefined();
    expect(body.binance).toBeUndefined();
  });

  it('portfolio : firstBuy vaut null sans mouvement d’achat', async () => {
    const api: ApiFetch = async () => ({ ...portfolioFixture, holdings: [{ ...portfolioFixture.holdings[0]!, trades: [] }] });
    const { client } = await connect(api);
    const res = (await client.callTool({ name: 'portfolio', arguments: {} })) as ToolResult;
    const body = JSON.parse(res.content[0]!.text);
    expect(body.holdings[0].firstBuy).toBeNull();
    expect(body.holdings[0].tradeCount).toBe(0);
  });

  it('ideas appelle l’API et garde les champs utiles, sans event/sources/reasoning/pricedIn/marketContext/startPriceEur/lastRun', async () => {
    const calls: string[] = [];
    const api: ApiFetch = async (path) => {
      calls.push(path);
      return ideasFixture;
    };
    const { client } = await connect(api);
    const res = (await client.callTool({ name: 'ideas', arguments: {} })) as ToolResult;
    expect(res.isError).toBeFalsy();
    expect(calls).toEqual(['/api/invest/ideas']);
    const body = JSON.parse(res.content[0]!.text);
    expect(body).toEqual({
      open: [
        { id: 1, createdOn: '2026-01-10', title: 'Une idée', ticker: 'ABC', assetName: 'Société ABC', whereToBuy: 'trade-republic', horizon: '2026-04-10', status: 'open', return: -0.05, benchReturn: -0.01, priceDate: '2026-03-12', risk: 'Risque X' },
        { id: 2, createdOn: '2026-02-01', title: 'Une autre idée', ticker: 'XYZ', assetName: 'Société XYZ', whereToBuy: 'binance', horizon: '2026-05-01', status: 'open', return: null, benchReturn: null, priceDate: null, risk: null },
      ],
      closed: [
        { id: 3, createdOn: '2025-10-01', title: 'Idée close', ticker: 'DEF', assetName: 'Société DEF', whereToBuy: 'trade-republic', horizon: '2026-01-01', status: 'closed', return: 0.1, benchReturn: 0.02, priceDate: '2026-01-01', risk: 'Risque Y' },
      ],
      summary: { closedCount: 1, beatCount: 1, avgExcess: 0.08, hundredEach: { invested: 100_00, ideas: 110_00, bench: 102_00 }, filter: null },
    });
    expect(body.lastRun).toBeUndefined();
  });

  it('portfolio et ideas répondent une erreur d’outil sans api', async () => {
    const { client } = await connect(null);
    const portfolio = (await client.callTool({ name: 'portfolio', arguments: {} })) as ToolResult;
    const ideas = (await client.callTool({ name: 'ideas', arguments: {} })) as ToolResult;
    expect(portfolio.isError).toBe(true);
    expect(portfolio.content[0]!.text).toBe('Données d’investissement indisponibles');
    expect(ideas.isError).toBe(true);
    expect(ideas.content[0]!.text).toBe('Données d’investissement indisponibles');
  });

  it('portfolio et ideas traduisent une erreur réseau en erreur d’outil lisible', async () => {
    const failing: ApiFetch = async () => {
      throw new Error('500 Internal Server Error');
    };
    const { client } = await connect(failing);
    const portfolio = (await client.callTool({ name: 'portfolio', arguments: {} })) as ToolResult;
    expect(portfolio.isError).toBe(true);
    expect(portfolio.content[0]!.text).toMatch(/^Portefeuille indisponible : 500/);
    const ideas = (await client.callTool({ name: 'ideas', arguments: {} })) as ToolResult;
    expect(ideas.isError).toBe(true);
    expect(ideas.content[0]!.text).toMatch(/^Idées indisponibles : 500/);
  });
});
