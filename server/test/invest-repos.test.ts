import { describe, expect, it } from 'vitest';
import { addTrade, createHolding, deleteBinanceHoldings, findBinanceHolding, listHoldings, listTrades, updateTrade } from '../src/repos/invest';
import { closeIdea, createRun, failInterruptedRuns, finishRun, insertIdea, lastSuccessfulRun, listIdeas, runningRun } from '../src/repos/ideas';
import { readSettingKey, writeSettingKey } from '../src/repos/settings';
import { createTestDb } from './helpers';

const candidate = {
  title: 'Fête des nouilles', event: 'La fête approche', sourceUrl: 'https://exemple.fr/a', reasoning: ['a', 'b'],
  pricedIn: 'Probablement en partie', ticker: 'BAG.PA', assetName: 'Baguettes SA', whereToBuy: 'trade_republic' as const, horizon: '2026-10-28',
};

describe('repos invest', () => {
  it('crée une position et ses mouvements, ignore un mouvement externe déjà connu', () => {
    const { db } = createTestDb();
    const h = createHolding(db, { platform: 'binance', ticker: 'BTC-EUR', name: 'Bitcoin', source: 'binance', externalAsset: 'BTC' });
    const t = { side: 'buy' as const, date: '2025-10-01', quantity: '0.01', amount: 600_00, fees: 0, source: 'binance' as const, externalId: 'trade:BTCEUR:1' };
    expect(addTrade(db, h.id, t)).not.toBeNull();
    expect(addTrade(db, h.id, t)).toBeNull();
    expect(listTrades(db, h.id)).toHaveLength(1);
    expect(findBinanceHolding(db, 'BTC')?.id).toBe(h.id);
    deleteBinanceHoldings(db);
    expect(listHoldings(db)).toEqual([]);
  });

  it('modifie un mouvement manuel', () => {
    const { db } = createTestDb();
    const h = createHolding(db, { platform: 'trade_republic', ticker: 'SXR8.DE', name: 'S&P 500', source: 'manual' });
    const t = addTrade(db, h.id, { side: 'buy', date: '2025-10-01', quantity: '4', amount: 3000_00, fees: 1_00 })!;
    expect(updateTrade(db, t.id, { quantity: '4.5' }).quantity).toBe('4.5');
  });
});

describe('repos idées', () => {
  it('fournées, idées et clôture', () => {
    const { db } = createTestDb();
    const run = createRun(db, 'manual', '2026-10-07T10:00:00Z');
    expect(runningRun(db)?.id).toBe(run.id);
    const idea = insertIdea(db, run.id, '2026-10-07', candidate, { priceEur: 10, benchPriceEur: 700 });
    finishRun(db, run.id, { status: 'done', finishedAt: '2026-10-07T10:05:00Z', acceptedCount: 1, rejected: [{ ticker: 'XX', reason: 'inconnu' }] });
    expect(lastSuccessfulRun(db)?.id).toBe(run.id);
    expect(listIdeas(db, { status: 'open' })).toHaveLength(1);
    closeIdea(db, idea.id, 0.1, 0.02);
    expect(listIdeas(db, { status: 'closed' })[0]).toMatchObject({ finalReturn: 0.1, benchFinalReturn: 0.02 });
  });

  it('marque les fournées interrompues', () => {
    const { db } = createTestDb();
    createRun(db, 'weekly', '2026-10-07T10:00:00Z');
    expect(failInterruptedRuns(db, '2026-10-07T11:00:00Z')).toBe(1);
    expect(runningRun(db)).toBeNull();
  });
});

describe('réglages bruts', () => {
  it('lit, écrit et efface une clé hors schéma', () => {
    const { db } = createTestDb();
    expect(readSettingKey(db, 'binance')).toBeNull();
    writeSettingKey(db, 'binance', { apiKey: 'k' });
    expect(readSettingKey<{ apiKey: string }>(db, 'binance')).toEqual({ apiKey: 'k' });
    writeSettingKey(db, 'binance', null);
    expect(readSettingKey(db, 'binance')).toBeNull();
  });
});
