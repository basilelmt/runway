import { Hono } from 'hono';
import { z } from 'zod';
import { binanceKeysSchema, binanceSyncSchema, holdingInputSchema, tradeInputSchema, tradePatchSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import type { Db } from '../db/client';
import { AppError } from '../errors';
import { addTrade, createHolding, deleteHolding, deleteTrade, getHolding, getTrade, listTrades, updateTrade } from '../repos/invest';
import { disconnectBinance, saveBinanceKeys, syncBinance } from '../services/binance-sync';
import { assertNoOversell, binanceState, buildPortfolio } from '../services/portfolio';
import type { HttpFetch, Prices } from '../services/prices';
import { validate } from '../validate';

export type InvestDeps = { prices: Prices; fetch?: HttpFetch; now?: () => Date };

const idParam = z.object({ id: z.coerce.number().int().positive() });
const portfolioQuery = z.object({ range: z.enum(['1m', '6m', '1y', 'all']).default('6m') });
const searchQuery = z.object({ q: z.string().trim().min(1, 'Recherche vide').max(60) });

const syncedHolding = () => new AppError('Position synchronisée avec Binance', 400, 'synced_holding');
const syncedTrade = () => new AppError('Mouvement importé de Binance', 400, 'synced_trade');

export function investRoutes({ prices, ...net }: InvestDeps) {
  return new Hono<AppEnv>()
    .get('/portfolio', validate('query', portfolioQuery), async (c) => {
      return c.json(await buildPortfolio(c.get('db'), prices, c.get('today'), c.req.valid('query').range));
    })
    .get('/search', validate('query', searchQuery), async (c) => c.json(await prices.search(c.req.valid('query').q)))
    .post('/holdings', validate('json', holdingInputSchema), async (c) => {
      const db = c.get('db');
      const input = c.req.valid('json');
      if (input.firstTrade.side === 'sell') throw new AppError('Le premier mouvement doit être un achat', 400, 'oversell');
      if (!(await prices.quoteEur(input.ticker))) throw new AppError('Ticker introuvable chez Yahoo', 400, 'unknown_ticker');
      const holding = db.transaction((tx) => {
        const t = tx as unknown as Db;
        const h = createHolding(t, { platform: input.platform, ticker: input.ticker, name: input.name, source: 'manual' });
        addTrade(t, h.id, input.firstTrade);
        return h;
      });
      return c.json(holding, 201);
    })
    .delete('/holdings/:id', validate('param', idParam), (c) => {
      const db = c.get('db');
      const h = getHolding(db, c.req.valid('param').id);
      if (h.source === 'binance') throw syncedHolding();
      deleteHolding(db, h.id);
      return c.body(null, 204);
    })
    .post('/holdings/:id/trades', validate('param', idParam), validate('json', tradeInputSchema), (c) => {
      const db = c.get('db');
      const h = getHolding(db, c.req.valid('param').id);
      const input = c.req.valid('json');
      assertNoOversell([...listTrades(db, h.id), input]);
      return c.json(addTrade(db, h.id, input), 201);
    })
    .patch('/trades/:id', validate('param', idParam), validate('json', tradePatchSchema), (c) => {
      const db = c.get('db');
      const trade = getTrade(db, c.req.valid('param').id);
      if (trade.source === 'binance') throw syncedTrade();
      const patch = c.req.valid('json');
      assertNoOversell(listTrades(db, trade.holdingId).map((t) => (t.id === trade.id ? { ...t, ...patch } : t)));
      return c.json(updateTrade(db, trade.id, patch));
    })
    .delete('/trades/:id', validate('param', idParam), (c) => {
      const db = c.get('db');
      const trade = getTrade(db, c.req.valid('param').id);
      if (trade.source === 'binance') throw syncedTrade();
      assertNoOversell(listTrades(db, trade.holdingId).filter((t) => t.id !== trade.id));
      deleteTrade(db, trade.id);
      return c.body(null, 204);
    })
    .get('/binance', (c) => c.json(binanceState(c.get('db'))))
    .put('/binance', validate('json', binanceKeysSchema), async (c) => c.json(await saveBinanceKeys(c.get('db'), c.req.valid('json'), net)))
    .delete('/binance', (c) => {
      disconnectBinance(c.get('db'));
      return c.body(null, 204);
    })
    .post('/binance/sync', validate('json', binanceSyncSchema), async (c) => {
      return c.json(await syncBinance(c.get('db'), prices, net, c.req.valid('json')));
    });
}
