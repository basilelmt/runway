import { isZeroQty, normalizeQty, priceOn, subQty, valueCents } from '@core/invest';
import type { BinanceState, BinanceSyncResult } from '@shared/api-types';
import { addDays, toISODate, type ISODate } from '@shared/dates';
import { CASH_ASSETS } from '@shared/invest';
import type { BinanceKeys, TradeInput } from '@shared/schemas';
import { createBinanceClient, type BinanceClient } from '../bank/binance';
import type { Db } from '../db/client';
import { AppError } from '../errors';
import { addTrade, createHolding, deleteBinanceHoldings, findBinanceHolding, listHoldings, listTrades, setSyncedQuantity } from '../repos/invest';
import { readSettingKey, writeSettingKey } from '../repos/settings';
import { binanceState, type BinanceStored } from './portfolio';
import type { HttpFetch, Prices } from './prices';

export type BinanceDeps = { fetch?: HttpFetch; now?: () => Date };

/** Droits qui permettent autre chose que lire : une clé qui en a un est refusée. */
const FORBIDDEN_PERMISSIONS = [
  'enableSpotAndMarginTrading',
  'enableWithdrawals',
  'enableInternalTransfer',
  'permitsUniversalTransfer',
  'enableMargin',
  'enableFutures',
  'enableVanillaOptions',
  'enablePortfolioMarginTrading',
  'enableFixApiTrade',
];
const QUOTES = ['EUR', 'USDT', 'USDC'];
const FIRST_SYNC_DAYS = 3 * 365;
const OVERLAP_MS = 2 * 24 * 3600 * 1000;
/** En dessous de cette valeur, un reliquat sans mouvement ne devient pas une position. */
const MIN_VALUE_CENTS = 1_00;

const client = (keys: { apiKey: string; apiSecret: string }, deps: BinanceDeps): BinanceClient =>
  createBinanceClient(keys, { fetch: deps.fetch, now: deps.now ? () => deps.now!().getTime() : undefined });

/** Jour local d'un horodatage Binance, comme les autres dates de Runway. */
const dayOf = (ms: number): ISODate => toISODate(new Date(ms));

export async function saveBinanceKeys(db: Db, keys: BinanceKeys, deps: BinanceDeps): Promise<BinanceState> {
  const r = await client(keys, deps).restrictions();
  if (FORBIDDEN_PERMISSIONS.some((p) => r[p] === true)) {
    throw new AppError('Cette clé peut trader ou retirer : crée une clé en lecture seule', 400, 'binance_key_permissions');
  }
  if (r.enableReading !== true) throw new AppError("Cette clé n'a pas le droit de lecture", 400, 'binance_key_permissions');
  const stored: BinanceStored = { ...keys, lastSyncAt: null, lastError: null };
  writeSettingKey(db, 'binance', stored);
  return binanceState(db);
}

export function disconnectBinance(db: Db): void {
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    deleteBinanceHoldings(t);
    writeSettingKey(t, 'binance', null);
  });
}

type PendingTrade = TradeInput & { externalId: string };

/** Synchro en cours par base : une deuxième demande attend la même au lieu de doubler les appels à Binance. */
const inflight = new WeakMap<Db, Promise<BinanceSyncResult>>();

export function syncBinance(db: Db, prices: Prices, deps: BinanceDeps, opts: { onlyIfStaleMinutes?: number } = {}): Promise<BinanceSyncResult> {
  const running = inflight.get(db);
  if (running) return running;
  const promise = doSync(db, prices, deps, opts).finally(() => inflight.delete(db));
  inflight.set(db, promise);
  return promise;
}

/** Met à jour l'état de synchro seulement si la même clé est toujours enregistrée (pas de clé ressuscitée après une déconnexion). */
function recordState(db: Db, apiKey: string, patch: Partial<Pick<BinanceStored, 'lastSyncAt' | 'lastError'>>): void {
  const current = readSettingKey<BinanceStored>(db, 'binance');
  if (current?.apiKey === apiKey) writeSettingKey(db, 'binance', { ...current, ...patch } satisfies BinanceStored);
}

async function doSync(db: Db, prices: Prices, deps: BinanceDeps, opts: { onlyIfStaleMinutes?: number }): Promise<BinanceSyncResult> {
  const stored = readSettingKey<BinanceStored>(db, 'binance');
  if (!stored) throw new AppError("Binance n'est pas relié", 400, 'binance_not_configured');
  const now = deps.now?.() ?? new Date();
  if (opts.onlyIfStaleMinutes && stored.lastSyncAt && now.getTime() - Date.parse(stored.lastSyncAt) < opts.onlyIfStaleMinutes * 60_000) {
    return { skipped: true, holdings: 0, newTrades: 0, warnings: [] };
  }

  try {
    const { result, complete } = await runSync(db, prices, client(stored, deps), stored, now);
    // Un mouvement sans cours (Yahoo injoignable) n'est pas perdu : le curseur n'avance pas et la prochaine synchro le relit.
    recordState(db, stored.apiKey, complete ? { lastSyncAt: now.toISOString(), lastError: null } : { lastError: null });
    return result;
  } catch (e) {
    recordState(db, stored.apiKey, { lastError: e instanceof Error ? e.message : 'Erreur inattendue' });
    throw e;
  }
}

async function runSync(
  db: Db,
  prices: Prices,
  api: BinanceClient,
  stored: BinanceStored,
  now: Date,
): Promise<{ result: BinanceSyncResult; complete: boolean }> {
  const warnings: string[] = [];
  let unpriced = 0;
  const stillConnected = () => readSettingKey<BinanceStored>(db, 'binance')?.apiKey === stored.apiKey;
  const endMs = now.getTime();
  const startMs = stored.lastSyncAt ? Date.parse(stored.lastSyncAt) - OVERLAP_MS : endMs - FIRST_SYNC_DAYS * 24 * 3600 * 1000;

  const [balances, converts, fiat] = [await api.balances(), await api.convertFlow(startMs, endMs), await api.fiatBuys(startMs, endMs)];
  const isCrypto = (asset: string) => !CASH_ASSETS.has(asset);

  // Taux EURUSD, chargés une fois : les stablecoins sont comptés comme des dollars.
  const usd = await prices.history('EURUSD=X', addDays(dayOf(startMs), -10));
  const toEurCents = async (amount: number, asset: string, day: ISODate): Promise<number | null> => {
    if (asset === 'EUR') return Math.round(amount * 100);
    if (CASH_ASSETS.has(asset)) {
      const rate = usd ? priceOn(usd.closes, day) : null;
      return rate ? Math.round((amount / rate.close) * 100) : null;
    }
    const p = await prices.closeEurOn(`${asset}-EUR`, day);
    return p ? Math.round(amount * p.eur * 100) : null;
  };

  const pending = new Map<string, PendingTrade[]>();
  const push = (asset: string, t: PendingTrade) => pending.set(asset, [...(pending.get(asset) ?? []), { ...t, quantity: normalizeQty(t.quantity) }]);

  for (const c of converts) {
    const day = dayOf(c.createTime);
    const from = Number(c.fromAmount);
    const to = Number(c.toAmount);
    if (isCrypto(c.toAsset) && !isCrypto(c.fromAsset)) {
      const amount = await toEurCents(from, c.fromAsset, day);
      if (amount === null) unpriced++;
      else push(c.toAsset, { side: 'buy', date: day, quantity: c.toAmount, amount, fees: 0, externalId: `convert:${c.orderId}:buy` });
    } else if (isCrypto(c.fromAsset) && !isCrypto(c.toAsset)) {
      const amount = await toEurCents(to, c.toAsset, day);
      if (amount === null) unpriced++;
      else push(c.fromAsset, { side: 'sell', date: day, quantity: c.fromAmount, amount, fees: 0, externalId: `convert:${c.orderId}:sell` });
    } else if (isCrypto(c.fromAsset) && isCrypto(c.toAsset)) {
      const amount = (await toEurCents(to, c.toAsset, day)) ?? (await toEurCents(from, c.fromAsset, day));
      if (amount === null) {
        unpriced++;
        continue;
      }
      push(c.fromAsset, { side: 'sell', date: day, quantity: c.fromAmount, amount, fees: 0, externalId: `convert:${c.orderId}:sell` });
      push(c.toAsset, { side: 'buy', date: day, quantity: c.toAmount, amount, fees: 0, externalId: `convert:${c.orderId}:buy` });
    }
  }

  for (const f of fiat) {
    // Un stablecoin acheté par carte reste des liquidités, pas un investissement.
    if (!isCrypto(f.cryptoCurrency)) continue;
    const day = dayOf(f.createTime);
    const fee = Number(f.totalFee) || 0;
    const amount = await toEurCents(Number(f.sourceAmount) - fee, f.fiatCurrency, day);
    const fees = await toEurCents(fee, f.fiatCurrency, day);
    if (amount === null || fees === null) {
      unpriced++;
      continue;
    }
    push(f.cryptoCurrency, { side: 'buy', date: day, quantity: f.obtainAmount, amount, fees, externalId: `fiat:${f.orderNo}` });
  }

  // Les positions déjà suivies sont relues aussi : un actif entièrement vendu repasse à zéro.
  const known = listHoldings(db).flatMap((h) => (h.source === 'binance' && h.externalAsset ? [h.externalAsset] : []));
  const assets = new Set([...[...balances.keys()].filter(isCrypto), ...pending.keys(), ...known]);
  let holdingCount = 0;
  let newTrades = 0;

  for (const asset of [...assets].sort()) {
    const ticker = `${asset}-EUR`;
    const quote = await prices.quoteEur(ticker);
    if (!quote) {
      if (prices.isUnknown(ticker)) warnings.push(`${asset} : pas de cours en euros chez Yahoo Finance, ignoré`);
      else unpriced += pending.get(asset)?.length ?? 1;
      continue;
    }

    for (const q of QUOTES) {
      const symbol = `${asset}${q}`;
      for (const t of await api.myTrades(symbol)) {
        const day = dayOf(t.time);
        const amount = await toEurCents(Number(t.quoteQty), q, day);
        if (amount === null) {
          unpriced++;
          continue;
        }
        const commission = Number(t.commission) || 0;
        let quantity = t.qty;
        let fees = 0;
        if (t.commissionAsset === asset && t.isBuyer) quantity = subQty(t.qty, t.commission);
        else if (t.commissionAsset === asset) fees = Math.round((commission * amount) / Number(t.qty));
        else if (commission > 0) fees = (await toEurCents(commission, t.commissionAsset, day)) ?? 0;
        push(asset, { side: t.isBuyer ? 'buy' : 'sell', date: day, quantity, amount, fees, externalId: `trade:${symbol}:${t.id}` });
      }
    }

    // À partir d'ici tout est synchrone : une déconnexion ne peut pas s'intercaler entre la vérification et les écritures.
    if (!stillConnected()) break;
    const balance = normalizeQty(balances.get(asset) ?? '0');
    const trades = pending.get(asset) ?? [];
    let holding = findBinanceHolding(db, asset);
    if (!holding) {
      if (trades.length === 0 && valueCents(balance, quote.eur) < MIN_VALUE_CENTS) continue;
      holding = createHolding(db, { platform: 'binance', ticker, name: quote.name.replace(/\s+EUR$/, ''), source: 'binance', externalAsset: asset });
    }
    db.transaction((tx) => {
      const t = tx as unknown as Db;
      setSyncedQuantity(t, holding.id, balance);
      for (const trade of trades) if (addTrade(t, holding.id, { ...trade, source: 'binance' })) newTrades++;
    });
    if (!isZeroQty(balance) || listTrades(db, holding.id).length > 0) holdingCount++;
  }

  if (unpriced > 0) warnings.push(`Cours indisponibles pour ${unpriced} mouvement${unpriced > 1 ? 's' : ''} : ils seront importés à la prochaine synchronisation`);
  return { result: { skipped: false, holdings: holdingCount, newTrades, warnings }, complete: unpriced === 0 };
}
