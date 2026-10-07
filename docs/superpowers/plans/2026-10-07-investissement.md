# Investir - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ajouter l'écran « Investir » : portefeuille valorisé (Trade Republic en saisie manuelle, Binance synchronisé), idées d'investissement tirées de l'actualité par Claude et suivies face au S&P 500.

**Architecture:** un cœur pur `core/invest.ts` (quantités décimales, PMP, valorisation, rendements), un service `prices` seul à parler à Yahoo avec cache SQLite, un client Binance signé et un service de synchro, un service `ideas` qui appelle `claude -p` avec la recherche web en tâche asynchrone, des routes `/api/invest`, et une page client `/investir`.

**Tech Stack:** TypeScript, Hono, Drizzle + better-sqlite3, zod 4, React 19 + TanStack Query 5, Recharts 3, vitest.

**Spec :** `docs/superpowers/specs/2026-10-07-investissement-design.md`.

## Global Constraints

- Montants en centimes d'euro entiers (`Cents`), dates `YYYY-MM-DD` (`ISODate`), quantités en texte décimal exact (`"0.04512"`).
- Tout le texte d'interface, les messages d'erreur et les commentaires sont en français, avec accents ; jamais de tiret cadratin « - », seulement « - ».
- Aucun écrit dans `/tmp` : les fichiers temporaires vont dans `tmp/` du projet (gitignoré).
- Aucune nouvelle dépendance npm : HMAC via `node:crypto`, HTTP via `fetch`.
- Les appels réseau (Yahoo, Binance) et le binaire `claude` sont injectables ; aucun test ne touche le réseau.
- Référence des idées : `BENCHMARK_TICKER = 'SXR8.DE'`.
- Clé Binance : refusée si elle a un droit autre que la lecture ; jamais renvoyée au navigateur (seulement les 4 derniers caractères).
- Les idées sont générées avec `claude -p --tools WebSearch --allowedTools WebSearch --output-format json --json-schema <schéma>`, délai 10 minutes.
- Commandes de vérification : `npm test`, `npm run typecheck`, `npm run lint`, toutes au vert à la fin de chaque tâche.
- Commits en français au format du dépôt (`feat(server): ...`, `feat(client): ...`, `feat(core): ...`), sans co-auteur.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `shared/schemas.ts` (modifié) | schémas zod des entrées : positions, mouvements, clés Binance, fournées |
| `shared/invest.ts` (nouveau) | constantes partagées (`BENCHMARK_TICKER`, plateformes, stablecoins) |
| `shared/api-types.ts` (modifié) | types des réponses `/api/invest` |
| `core/invest.ts` + test | quantités décimales, PMP, valorisation, série, rendements, bilan |
| `server/src/db/schema.ts` (modifié) + migration `0005` | tables `holdings`, `holding_trades`, `prices`, `price_tickers`, `idea_runs`, `ideas` |
| `server/src/repos/invest.ts` | accès aux positions et mouvements |
| `server/src/repos/ideas.ts` | accès aux idées et fournées |
| `server/src/repos/settings.ts` (modifié) | `readSettingKey` / `writeSettingKey` pour l'état Binance |
| `server/src/services/prices.ts` | Yahoo : recherche, historique, cache, conversion en euros |
| `server/src/services/portfolio.ts` | valorisation du portefeuille pour l'API |
| `server/src/bank/binance.ts` | client HTTP signé Binance |
| `server/src/services/binance-sync.ts` | synchro des soldes et mouvements |
| `server/src/services/claude.ts` (modifié) | extraction de `runClaude` commun au tri et aux idées |
| `server/src/services/ideas.ts` | prompt, fournées, validation, clôture, vue |
| `server/src/routes/invest.ts` | routes `/api/invest` |
| `server/src/app.ts`, `server/src/index.ts` (modifiés) | branchement des dépendances, fournées interrompues |
| `client/src/api/hooks.ts` (modifié) | hooks Investir |
| `client/src/components/layout/nav.ts`, `BottomNav.module.css` (modifiés) | cinquième entrée |
| `client/src/router.tsx` (modifié) | route `/investir` chargée à la demande |
| `client/src/pages/Invest.tsx` + `.module.css` | page |
| `client/src/components/invest/*` | résumé, graphique, positions, dialogues, Binance, idées, bilan |

---

### Task 1: Cœur pur et types partagés

**Files:**
- Create: `shared/invest.ts`, `core/invest.ts`, `core/invest.test.ts`
- Modify: `shared/schemas.ts` (ajouts en fin de fichier), `shared/api-types.ts` (ajouts en fin de fichier)

**Interfaces:**
- Produces (`shared/invest.ts`) :
  ```ts
  export const BENCHMARK_TICKER = 'SXR8.DE';
  export const BENCHMARK_NAME = 'S&P 500 (iShares, en euros)';
  export const platforms = ['trade_republic', 'binance', 'other'] as const;
  export type Platform = (typeof platforms)[number];
  export const PLATFORM_LABELS: Record<Platform, string> = { trade_republic: 'Trade Republic', binance: 'Binance', other: 'Ailleurs' };
  /** Actifs Binance qui ne sont pas des investissements (liquidités). */
  export const CASH_ASSETS = new Set(['EUR', 'USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD', 'USDP']);
  ```
- Produces (`shared/schemas.ts`) : `decimalSchema`, `tradeInputSchema`, `tradePatchSchema`, `holdingInputSchema`, `binanceKeysSchema`, `binanceSyncSchema`, `ideaRunStartSchema`, `ideaCandidateSchema`, `ideaBatchSchema` et leurs types `TradeInput`, `TradePatch`, `HoldingInput`, `BinanceKeys`, `IdeaCandidate`.
- Produces (`core/invest.ts`) : `toUnits`, `fromUnits`, `addQty`, `subQty`, `cmpQty`, `qtyToNumber`, `isZeroQty`, `position`, `valueCents`, `priceOn`, `toEur`, `portfolioSeries`, `simpleReturn`, `ideasSummary`, types `Trade`, `Position`, `DatedPrice`, `SeriesPoint`, `ClosedIdea`, `IdeasSummaryResult`.
- Produces (`shared/api-types.ts`) : `PortfolioRange`, `TradeView`, `HoldingView`, `PortfolioView`, `BinanceState`, `BinanceSyncResult`, `AssetSearchResult`, `IdeaRunView`, `IdeaView`, `IdeasSummary`, `IdeasView`, `IdeaRunStart`.

- [ ] **Step 1: Écrire `shared/invest.ts`** avec exactement le contenu du bloc Interfaces ci-dessus.

- [ ] **Step 2: Ajouter les schémas à la fin de `shared/schemas.ts`**

```ts
import { platforms } from './invest';

/** Quantité décimale exacte, transportée en texte (« 0.04512 »). */
export const decimalSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(',', '.'))
  .pipe(z.string().regex(/^\d+(\.\d{1,18})?$/, 'Quantité invalide'))
  .refine((s) => /[1-9]/.test(s), 'La quantité doit être positive');

export const tradeInputSchema = z.object({
  side: z.enum(['buy', 'sell']),
  date: isoDateSchema,
  quantity: decimalSchema,
  amount: positiveCentsSchema,
  fees: centsSchema.min(0, 'Frais négatifs').default(0),
});
export type TradeInput = z.infer<typeof tradeInputSchema>;

export const tradePatchSchema = tradeInputSchema.partial();
export type TradePatch = z.infer<typeof tradePatchSchema>;

export const holdingInputSchema = z.object({
  platform: z.enum(platforms),
  ticker: z.string().trim().min(1, 'Ticker manquant').max(32),
  name: z.string().trim().min(1, 'Nom manquant').max(120),
  firstTrade: tradeInputSchema,
});
export type HoldingInput = z.infer<typeof holdingInputSchema>;

export const binanceKeysSchema = z.object({
  apiKey: z.string().trim().min(16, 'Clé API trop courte').max(200),
  apiSecret: z.string().trim().min(16, 'Clé secrète trop courte').max(200),
});
export type BinanceKeys = z.infer<typeof binanceKeysSchema>;

export const binanceSyncSchema = z.object({ onlyIfStaleMinutes: z.number().int().min(1).max(10_080).optional() });

export const ideaRunStartSchema = z.object({ trigger: z.enum(['manual', 'weekly']) });

/** Une idée telle que Claude la propose, avant vérification du ticker. */
export const ideaCandidateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  event: z.string().trim().min(1).max(1000),
  sourceUrl: z.url(),
  reasoning: z.array(z.string().trim().min(1).max(400)).min(1).max(5),
  pricedIn: z.string().trim().min(1).max(600),
  ticker: z.string().trim().min(1).max(32),
  assetName: z.string().trim().min(1).max(120),
  whereToBuy: z.enum(platforms),
  horizon: isoDateSchema,
});
export type IdeaCandidate = z.infer<typeof ideaCandidateSchema>;

/** Sortie brute de Claude : chaque idée est validée séparément pour ne pas tout rejeter pour une seule. */
export const ideaBatchSchema = z.object({ ideas: z.array(z.unknown()) });
```

Placer l'`import` en tête de fichier avec les autres imports.

- [ ] **Step 3: Ajouter les types de réponse à la fin de `shared/api-types.ts`**

```ts
import type { Platform } from './invest';

export type PortfolioRange = '1m' | '6m' | '1y' | 'all';

export type PriceInfo = { eur: number; date: ISODate; stale: boolean };

export type TradeView = {
  id: number;
  side: 'buy' | 'sell';
  date: ISODate;
  quantity: string;
  amount: Cents;
  fees: Cents;
  source: 'manual' | 'binance';
};

export type HoldingView = {
  id: number;
  platform: Platform;
  ticker: string;
  name: string;
  source: 'manual' | 'binance';
  /** Quantité détenue : solde Binance pour une position synchronisée, sinon somme des mouvements. */
  quantity: string;
  /** Coût de revient (PMP) de la quantité couverte par des mouvements. */
  costBasis: Cents;
  realized: Cents;
  price: PriceInfo | null;
  value: Cents | null;
  gain: Cents | null;
  gainPct: number | null;
  dayChangePct: number | null;
  /** Quantité synchronisée sans mouvement d'achat connu (« 0,002 BTC sans prix d'achat »), sinon null. */
  unpricedQuantity: string | null;
  trades: TradeView[];
};

export type BinanceState = { configured: boolean; apiKeyHint: string | null; lastSyncAt: string | null; lastError: string | null };

export type PortfolioView = {
  today: ISODate;
  totals: { value: Cents; invested: Cents; gain: Cents; gainPct: number | null; realized: Cents };
  holdings: HoldingView[];
  series: { date: ISODate; value: Cents; invested: Cents }[];
  /** Vrai si au moins un cours affiché n'a pas pu être rafraîchi. */
  stale: boolean;
  binance: BinanceState;
};

export type BinanceSyncResult = { skipped: boolean; holdings: number; newTrades: number; warnings: string[] };

export type AssetSearchResult = { ticker: string; name: string; exchange: string; type: string };

export type IdeaRunView = {
  id: number;
  trigger: 'manual' | 'weekly';
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  acceptedCount: number;
  rejected: { ticker: string; reason: string }[];
  error: string | null;
};

export type IdeaView = {
  id: number;
  createdOn: ISODate;
  title: string;
  event: string;
  sourceUrl: string;
  reasoning: string[];
  pricedIn: string;
  ticker: string;
  assetName: string;
  whereToBuy: Platform;
  horizon: ISODate;
  startPriceEur: number;
  status: 'open' | 'closed';
  /** Rendement depuis l'idée (fraction : 0.05 = +5 %), figé à la clôture ; null si aucun cours. */
  return: number | null;
  benchReturn: number | null;
  /** Date du cours utilisé pour `return`. */
  priceDate: ISODate | null;
};

export type IdeasSummary = {
  closedCount: number;
  beatCount: number;
  /** Écart moyen idée - référence, en fraction. */
  avgExcess: number | null;
  hundredEach: { invested: Cents; ideas: Cents; bench: Cents };
};

export type IdeasView = { open: IdeaView[]; closed: IdeaView[]; summary: IdeasSummary; lastRun: IdeaRunView | null };

export type IdeaRunStart = { run: IdeaRunView | null; started: boolean };
```

`Cents` et `ISODate` sont déjà importés en tête du fichier ; ajouter l'import de `Platform` en tête.

- [ ] **Step 4: Écrire les tests de `core/invest.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  addQty, cmpQty, fromUnits, ideasSummary, isZeroQty, portfolioSeries, position, priceOn, qtyToNumber,
  simpleReturn, subQty, toEur, toUnits, valueCents, type Trade,
} from './invest';

const buy = (date: string, quantity: string, amount: number, fees = 0): Trade => ({ side: 'buy', date, quantity, amount, fees });
const sell = (date: string, quantity: string, amount: number, fees = 0): Trade => ({ side: 'sell', date, quantity, amount, fees });

describe('quantités décimales', () => {
  it('additionne et soustrait sans perte', () => {
    expect(addQty('0.1', '0.2')).toBe('0.3');
    expect(subQty('1', '0.00000001')).toBe('0.99999999');
    expect(subQty('0.5', '0.5')).toBe('0');
  });
  it('compare et convertit', () => {
    expect(cmpQty('2', '10')).toBe(-1);
    expect(cmpQty('1.50', '1.5')).toBe(0);
    expect(isZeroQty('0.000')).toBe(true);
    expect(qtyToNumber('0.04512')).toBeCloseTo(0.04512);
    expect(fromUnits(toUnits('12.3400'))).toBe('12.34');
  });
  it('ne descend jamais sous zéro', () => {
    expect(subQty('1', '2')).toBe('0');
  });
});

describe('position (PMP)', () => {
  it('cumule les achats, frais compris', () => {
    const p = position([buy('2025-10-01', '4', 2000_00, 1_00), buy('2025-11-01', '1', 1000_00, 1_00)]);
    expect(p).toEqual({ quantity: '5', costBasis: 3002_00, realized: 0 });
  });
  it('une vente sort au prix moyen et dégage une plus-value réalisée', () => {
    const p = position([buy('2025-10-01', '4', 2000_00), sell('2025-12-01', '1', 700_00, 1_00)]);
    expect(p.quantity).toBe('3');
    expect(p.costBasis).toBe(1500_00);
    expect(p.realized).toBe(700_00 - 1_00 - 500_00);
  });
  it("trie par date et s'arrête à la date demandée", () => {
    const trades = [buy('2025-11-01', '1', 100_00), buy('2025-10-01', '1', 50_00)];
    expect(position(trades, '2025-10-15')).toEqual({ quantity: '1', costBasis: 50_00, realized: 0 });
  });
  it('tout vendre remet le coût à zéro', () => {
    const p = position([buy('2025-10-01', '0.3', 300_00), sell('2025-10-02', '0.3', 330_00)]);
    expect(p).toEqual({ quantity: '0', costBasis: 0, realized: 30_00 });
  });
});

describe('cours et devises', () => {
  const series = [
    { date: '2026-10-01', close: 100 },
    { date: '2026-10-02', close: 110 },
    { date: '2026-10-05', close: 120 },
  ];
  it('priceOn prend la dernière clôture connue à la date', () => {
    expect(priceOn(series, '2026-10-04')).toEqual({ date: '2026-10-02', close: 110 });
    expect(priceOn(series, '2026-09-30')).toBeNull();
  });
  it('toEur divise par le taux EURXXX et gère les pence', () => {
    expect(toEur(110, 'USD', 1.1)).toBeCloseTo(100);
    expect(toEur(5000, 'GBp', 0.85)).toBeCloseTo(50 / 0.85);
    expect(toEur(42, 'EUR', null)).toBe(42);
    expect(toEur(42, 'USD', null)).toBeNull();
  });
  it('valueCents arrondit au centime', () => {
    expect(valueCents('0.04512', 74136.26)).toBe(3345_03);
  });
});

describe('portfolioSeries', () => {
  it('valorise chaque jour avec le dernier cours connu', () => {
    const out = portfolioSeries(
      [{ trades: [buy('2026-10-02', '2', 200_00)], prices: [{ date: '2026-10-01', close: 100 }, { date: '2026-10-03', close: 120 }] }],
      '2026-10-01',
      '2026-10-04',
    );
    expect(out).toEqual([
      { date: '2026-10-01', value: 0, invested: 0 },
      { date: '2026-10-02', value: 200_00, invested: 200_00 },
      { date: '2026-10-03', value: 240_00, invested: 200_00 },
      { date: '2026-10-04', value: 240_00, invested: 200_00 },
    ]);
  });
});

describe('rendements des idées', () => {
  it('simpleReturn', () => {
    expect(simpleReturn(100, 112)).toBeCloseTo(0.12);
    expect(simpleReturn(0, 112)).toBeNull();
  });
  it('ideasSummary compte les victoires et simule 100 € par idée', () => {
    const s = ideasSummary([
      { return: 0.2, benchReturn: 0.05 },
      { return: -0.1, benchReturn: 0.02 },
    ]);
    expect(s.closedCount).toBe(2);
    expect(s.beatCount).toBe(1);
    expect(s.avgExcess).toBeCloseTo((0.15 - 0.12) / 2);
    expect(s.hundredEach).toEqual({ invested: 200_00, ideas: 120_00 + 90_00, bench: 105_00 + 102_00 });
  });
  it('bilan vide', () => {
    expect(ideasSummary([])).toEqual({ closedCount: 0, beatCount: 0, avgExcess: null, hundredEach: { invested: 0, ideas: 0, bench: 0 } });
  });
});
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run core/invest.test.ts`
Expected: FAIL, module `./invest` introuvable.

- [ ] **Step 6: Écrire `core/invest.ts`**

```ts
import { addDays, compareISODate, type ISODate } from '@shared/dates';
import type { Cents } from '@shared/money';

const SCALE = 18;
const ONE = 10n ** BigInt(SCALE);

/** Quantité décimale en texte vers un entier à 18 décimales. */
export function toUnits(q: string): bigint {
  const [int = '0', frac = ''] = q.trim().replace(',', '.').split('.');
  return BigInt(int || '0') * ONE + BigInt((frac + '0'.repeat(SCALE)).slice(0, SCALE) || '0');
}

export function fromUnits(u: bigint): string {
  const int = u / ONE;
  const frac = (u % ONE).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : `${int}`;
}

export const addQty = (a: string, b: string): string => fromUnits(toUnits(a) + toUnits(b));
/** Soustraction bornée à zéro : une quantité détenue n'est jamais négative. */
export const subQty = (a: string, b: string): string => {
  const d = toUnits(a) - toUnits(b);
  return fromUnits(d > 0n ? d : 0n);
};
export const cmpQty = (a: string, b: string): -1 | 0 | 1 => {
  const d = toUnits(a) - toUnits(b);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};
export const isZeroQty = (q: string): boolean => toUnits(q) === 0n;
export const qtyToNumber = (q: string): number => Number(q);

export type Trade = { side: 'buy' | 'sell'; date: ISODate; quantity: string; amount: Cents; fees: Cents };
export type Position = { quantity: string; costBasis: Cents; realized: Cents };

/** Quantité, coût de revient au prix moyen pondéré et plus-value réalisée, jusqu'à `upTo` inclus. */
export function position(trades: Trade[], upTo?: ISODate): Position {
  const sorted = trades
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => upTo === undefined || compareISODate(t.date, upTo) <= 0)
    .sort((a, b) => compareISODate(a.t.date, b.t.date) || a.i - b.i);
  let qty = 0n;
  let cost = 0;
  let realized = 0;
  for (const { t } of sorted) {
    const q = toUnits(t.quantity);
    if (t.side === 'buy') {
      qty += q;
      cost += t.amount + t.fees;
      continue;
    }
    if (qty === 0n) continue;
    const sold = q > qty ? qty : q;
    const costOut = sold === qty ? cost : Math.round((cost * Number((sold * 1_000_000n) / qty)) / 1_000_000);
    realized += t.amount - t.fees - costOut;
    cost -= costOut;
    qty -= sold;
  }
  return { quantity: fromUnits(qty), costBasis: cost, realized };
}

export const valueCents = (quantity: string, priceEur: number): Cents => Math.round(qtyToNumber(quantity) * priceEur * 100);

export type DatedPrice = { date: ISODate; close: number };

/** Dernière clôture connue à `date` incluse ; `series` triée par date croissante. */
export function priceOn(series: DatedPrice[], date: ISODate): DatedPrice | null {
  let found: DatedPrice | null = null;
  for (const p of series) {
    if (compareISODate(p.date, date) > 0) break;
    found = p;
  }
  return found;
}

/**
 * Convertit un montant coté en `currency` vers l'euro.
 * `eurRate` = nombre d'unités de la devise pour 1 € (ticker Yahoo `EURUSD=X`) ; les pence (`GBp`, `GBX`) sont ramenés en livres.
 */
export function toEur(amount: number, currency: string, eurRate: number | null): number | null {
  if (currency === 'EUR') return amount;
  if (eurRate === null || eurRate <= 0) return null;
  const minor = currency === 'GBp' || currency === 'GBX' || currency === 'ZAc' || currency === 'ILA';
  return (minor ? amount / 100 : amount) / eurRate;
}

/** Devise majeure correspondant à une cotation en centièmes. */
export function majorCurrency(currency: string): string {
  if (currency === 'GBp' || currency === 'GBX') return 'GBP';
  if (currency === 'ZAc') return 'ZAR';
  if (currency === 'ILA') return 'ILS';
  return currency;
}

export type SeriesPoint = { date: ISODate; value: Cents; invested: Cents };

/** Valeur et coût de revient du portefeuille jour par jour ; `prices` en euros, triés par date. */
export function portfolioSeries(items: { trades: Trade[]; prices: DatedPrice[] }[], from: ISODate, to: ISODate): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let d = from; compareISODate(d, to) <= 0; d = addDays(d, 1)) {
    let value = 0;
    let invested = 0;
    for (const item of items) {
      const p = position(item.trades, d);
      if (isZeroQty(p.quantity)) continue;
      invested += p.costBasis;
      const price = priceOn(item.prices, d);
      value += price ? valueCents(p.quantity, price.close) : p.costBasis;
    }
    out.push({ date: d, value, invested });
  }
  return out;
}

export function simpleReturn(start: number, end: number): number | null {
  return start > 0 ? end / start - 1 : null;
}

export type ClosedIdea = { return: number; benchReturn: number };
export type IdeasSummaryResult = {
  closedCount: number;
  beatCount: number;
  avgExcess: number | null;
  hundredEach: { invested: Cents; ideas: Cents; bench: Cents };
};

export function ideasSummary(closed: ClosedIdea[]): IdeasSummaryResult {
  const n = closed.length;
  const hundred = (r: number) => Math.round(100_00 * (1 + r));
  return {
    closedCount: n,
    beatCount: closed.filter((c) => c.return > c.benchReturn).length,
    avgExcess: n ? closed.reduce((s, c) => s + c.return - c.benchReturn, 0) / n : null,
    hundredEach: {
      invested: n * 100_00,
      ideas: closed.reduce((s, c) => s + hundred(c.return), 0),
      bench: closed.reduce((s, c) => s + hundred(c.benchReturn), 0),
    },
  };
}
```

- [ ] **Step 7: Lancer les tests**

Run: `npx vitest run core/invest.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add shared/invest.ts shared/schemas.ts shared/api-types.ts core/invest.ts core/invest.test.ts
git commit -m "feat(core): quantités décimales, PMP, valorisation et bilan des idées"
```

---

### Task 2: Tables, migration et repos

**Files:**
- Modify: `server/src/db/schema.ts`, `server/src/repos/settings.ts`
- Create: migration générée `server/src/db/migrations/0005_*.sql` (renommer en `0005_invest.sql` et mettre à jour `meta/_journal.json` en conséquence), `server/src/repos/invest.ts`, `server/src/repos/ideas.ts`, `server/test/invest-repos.test.ts`

**Interfaces:**
- Consumes: `platforms` (`shared/invest.ts`), `TradeInput`, `TradePatch`, `IdeaCandidate` (Task 1).
- Produces (`repos/invest.ts`) :
  ```ts
  export type HoldingRow = typeof holdings.$inferSelect;
  export type TradeRow = typeof holdingTrades.$inferSelect;
  listHoldings(db: Db): HoldingRow[]
  getHolding(db: Db, id: number): HoldingRow                       // NotFoundError « Position introuvable »
  createHolding(db: Db, input: { platform; ticker; name; source: 'manual' | 'binance'; externalAsset?: string | null }): HoldingRow
  findBinanceHolding(db: Db, asset: string): HoldingRow | null
  setSyncedQuantity(db: Db, id: number, quantity: string): void
  deleteHolding(db: Db, id: number): void
  deleteBinanceHoldings(db: Db): void
  listTrades(db: Db, holdingId?: number): TradeRow[]               // triés par date puis id
  getTrade(db: Db, id: number): TradeRow                           // NotFoundError « Mouvement introuvable »
  addTrade(db: Db, holdingId: number, input: TradeInput & { source?: 'manual' | 'binance'; externalId?: string | null }): TradeRow | null  // null si externalId déjà connu
  updateTrade(db: Db, id: number, patch: TradePatch): TradeRow
  deleteTrade(db: Db, id: number): void
  ```
- Produces (`repos/ideas.ts`) :
  ```ts
  export type IdeaRow = typeof ideas.$inferSelect;
  export type IdeaRunRow = typeof ideaRuns.$inferSelect;
  createRun(db: Db, trigger: 'manual' | 'weekly', startedAt: string): IdeaRunRow
  finishRun(db: Db, id: number, patch: { status: 'done' | 'failed'; finishedAt: string; acceptedCount?: number; rejected?: { ticker: string; reason: string }[]; error?: string | null }): IdeaRunRow
  getRun(db: Db, id: number): IdeaRunRow                                  // NotFoundError « Fournée introuvable »
  latestRun(db: Db): IdeaRunRow | null
  runningRun(db: Db): IdeaRunRow | null
  lastSuccessfulRun(db: Db): IdeaRunRow | null
  failInterruptedRuns(db: Db, at: string): number
  insertIdea(db: Db, runId: number, createdOn: string, c: IdeaCandidate, start: { priceEur: number; benchPriceEur: number }): IdeaRow
  listIdeas(db: Db, filter?: { status?: 'open' | 'closed'; since?: string }): IdeaRow[]   // plus récentes d'abord
  closeIdea(db: Db, id: number, finalReturn: number, benchFinalReturn: number): void
  ```
- Produces (`repos/settings.ts`) : `readSettingKey<T>(db: Db, key: string): T | null`, `writeSettingKey(db: Db, key: string, value: unknown | null): void` (null supprime la ligne).

- [ ] **Step 1: Ajouter les tables à `server/src/db/schema.ts`**

```ts
import { primaryKey, real } from 'drizzle-orm/sqlite-core'; // à fusionner dans l'import existant
import { platforms } from '@shared/invest';

export const holdings = sqliteTable(
  'holdings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    platform: text('platform', { enum: platforms }).notNull(),
    /** Ticker Yahoo (`SXR8.DE`, `BTC-EUR`). */
    ticker: text('ticker').notNull(),
    name: text('name').notNull(),
    source: text('source', { enum: ['manual', 'binance'] }).notNull().default('manual'),
    /** Actif Binance (`BTC`) pour une position synchronisée. */
    externalAsset: text('external_asset'),
    /** Dernier solde lu chez Binance, en texte décimal. */
    syncedQuantity: text('synced_quantity'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('holdings_external_idx').on(t.source, t.externalAsset)],
);

export const holdingTrades = sqliteTable(
  'holding_trades',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    holdingId: integer('holding_id')
      .notNull()
      .references(() => holdings.id, { onDelete: 'cascade' }),
    side: text('side', { enum: ['buy', 'sell'] }).notNull(),
    date: text('date').notNull(),
    quantity: text('quantity').notNull(),
    /** Montant total en centimes d'euro, frais exclus. */
    amount: integer('amount').notNull(),
    fees: integer('fees').notNull().default(0),
    source: text('source', { enum: ['manual', 'binance'] }).notNull().default('manual'),
    externalId: text('external_id'),
  },
  (t) => [index('holding_trades_holding_idx').on(t.holdingId), uniqueIndex('holding_trades_external_idx').on(t.externalId)],
);

export const prices = sqliteTable(
  'prices',
  {
    ticker: text('ticker').notNull(),
    date: text('date').notNull(),
    close: real('close').notNull(),
    currency: text('currency').notNull(),
    fetchedAt: text('fetched_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.date] })],
);

export const priceTickers = sqliteTable('price_tickers', {
  ticker: text('ticker').primaryKey(),
  name: text('name').notNull(),
  currency: text('currency').notNull(),
  /** Plus ancienne date demandée à Yahoo : l'historique en base est complet à partir d'ici. */
  historyFrom: text('history_from').notNull(),
  refreshedAt: text('refreshed_at').notNull(),
});

export const ideaRuns = sqliteTable('idea_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trigger: text('trigger', { enum: ['manual', 'weekly'] }).notNull(),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  acceptedCount: integer('accepted_count').notNull().default(0),
  /** JSON : `[{ ticker, reason }]`. */
  rejected: text('rejected').notNull().default('[]'),
  error: text('error'),
});

export const ideas = sqliteTable(
  'ideas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => ideaRuns.id, { onDelete: 'cascade' }),
    createdOn: text('created_on').notNull(),
    title: text('title').notNull(),
    event: text('event').notNull(),
    sourceUrl: text('source_url').notNull(),
    /** JSON : étapes de la déduction. */
    reasoning: text('reasoning').notNull(),
    pricedIn: text('priced_in').notNull(),
    ticker: text('ticker').notNull(),
    assetName: text('asset_name').notNull(),
    whereToBuy: text('where_to_buy', { enum: platforms }).notNull(),
    horizon: text('horizon').notNull(),
    startPriceEur: real('start_price_eur').notNull(),
    benchStartPriceEur: real('bench_start_price_eur').notNull(),
    status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
    finalReturn: real('final_return'),
    benchFinalReturn: real('bench_final_return'),
  },
  (t) => [index('ideas_status_idx').on(t.status)],
);
```

- [ ] **Step 2: Générer la migration**

Run: `npm run db:generate`
Expected: un fichier `server/src/db/migrations/0005_<nom>.sql`. Le renommer en `0005_invest.sql` et remplacer le `tag` correspondant dans `meta/_journal.json` par `0005_invest`. Relire le SQL : 6 `CREATE TABLE` et les index, aucun `DROP`.

- [ ] **Step 3: Écrire `server/test/invest-repos.test.ts`**

```ts
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
```

- [ ] **Step 4: Lancer et vérifier l'échec**

Run: `npx vitest run server/test/invest-repos.test.ts`
Expected: FAIL, modules introuvables.

- [ ] **Step 5: Écrire les repos**

`server/src/repos/settings.ts`, ajouter :

```ts
import { eq } from 'drizzle-orm';

/** Valeur brute d'une clé hors du schéma des réglages (état interne, secrets jamais renvoyés au client). */
export function readSettingKey<T>(db: Db, key: string): T | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : null;
}

export function writeSettingKey(db: Db, key: string, value: unknown): void {
  if (value === null) {
    db.delete(settings).where(eq(settings.key, key)).run();
    return;
  }
  const json = JSON.stringify(value);
  db.insert(settings).values({ key, value: json }).onConflictDoUpdate({ target: settings.key, set: { value: json } }).run();
}
```

`server/src/repos/invest.ts` : implémenter les fonctions du bloc Interfaces en suivant `repos/accounts.ts` (Drizzle, `.get()`, `.all()`, `.run()`, `NotFoundError` de `../errors`).
`addTrade` vérifie d'abord `getHolding`, puis insère avec `.onConflictDoNothing({ target: holdingTrades.externalId }).returning().get()` et renvoie `null` si rien n'est inséré.
`listTrades` trie par `asc(date), asc(id)`.
`deleteBinanceHoldings` supprime les lignes `source = 'binance'` (les mouvements suivent par cascade).

`server/src/repos/ideas.ts` : idem.
`insertIdea` stocke `reasoning` en `JSON.stringify`.
`listIdeas` trie par `desc(createdOn), desc(id)` et filtre `status` et `createdOn >= since` si fournis.
`failInterruptedRuns` fait un `update ... set status 'failed', finishedAt, error 'Interrompue par un redémarrage' where status = 'running'` et renvoie le nombre de lignes (`.run().changes`).
`lastSuccessfulRun` : dernière fournée `done` par `desc(startedAt)`.

- [ ] **Step 6: Lancer les tests**

Run: `npx vitest run server/test/invest-repos.test.ts && npm test && npm run typecheck`
Expected: PASS, aucune régression (la migration s'applique sur les bases de test en mémoire).

- [ ] **Step 7: Commit**

```bash
git add server/src/db server/src/repos server/test/invest-repos.test.ts
git commit -m "feat(server): tables et repos du portefeuille et des idées"
```

---

### Task 3: Service des cours (Yahoo)

**Files:**
- Create: `server/src/services/prices.ts`, `server/test/prices.test.ts`, `server/test/fixtures/yahoo.ts`

**Interfaces:**
- Consumes: tables `prices`, `priceTickers` (Task 2), `toEur`, `majorCurrency`, `priceOn`, `DatedPrice` (Task 1).
- Produces:
  ```ts
  export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;
  export type PricesDeps = { fetch?: HttpFetch; now?: () => Date };
  export type TickerHistory = { ticker: string; name: string; currency: string; closes: DatedPrice[]; stale: boolean };
  export type Prices = {
    search(query: string): Promise<AssetSearchResult[]>;
    /** Historique en devise de cotation depuis `from` ; null si le ticker est inconnu et absent du cache. */
    history(ticker: string, from: ISODate): Promise<TickerHistory | null>;
    /** Historique converti en euros, jour par jour (taux du jour, à défaut le dernier connu avant). */
    historyEur(ticker: string, from: ISODate): Promise<(TickerHistory & { closesEur: DatedPrice[] }) | null>;
    /** Clôture en euros à une date (dernière connue avant), null si inconnue. */
    closeEurOn(ticker: string, date: ISODate): Promise<{ eur: number; date: ISODate; stale: boolean } | null>;
    /** Dernier cours en euros. */
    quoteEur(ticker: string): Promise<{ eur: number; date: ISODate; stale: boolean; name: string } | null>;
  };
  export function createPrices(db: Db, deps?: PricesDeps): Prices;
  export const REFRESH_MINUTES = 15;
  ```

Règles :
- URL historique : `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${unix(from)}&period2=${unix(demain)}&interval=1d`.
- URL recherche : `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, garder les `quotes` qui ont `symbol` et `isYahooFinance !== false`, mapper vers `{ ticker: symbol, name: longname ?? shortname ?? symbol, exchange: exchDisp ?? exchange ?? '', type: typeDisp ?? quoteType ?? '' }`.
- En-tête `User-Agent: Mozilla/5.0 (X11; Linux x86_64) Runway`, délai 10 s via `AbortSignal.timeout(10_000)`.
- Réponse chart : `chart.result[0]` avec `meta.currency`, `meta.longName ?? meta.shortName`, `meta.regularMarketPrice`, `meta.regularMarketTime`, `timestamp[]`, `indicators.quote[0].close[]` (valeurs `null` ignorées).
  La date d'un point est la date locale de la place : `toISODate(new Date((ts + meta.gmtoffset) * 1000))` lue en UTC.
  Le cours courant (`regularMarketPrice` à la date de `regularMarketTime`) écrase la clôture de ce jour.
  `chart.error` non nul ou `result` vide = ticker inconnu.
- Cache : si `price_tickers` a le ticker, `historyFrom <= from` et `refreshedAt` a moins de `REFRESH_MINUTES`, aucun appel.
  Sinon appel depuis `min(from, dernière date en base - 7 jours)` quand `historyFrom <= from`, sinon depuis `from`.
  Upsert des clôtures (`onConflictDoUpdate`), mise à jour de `price_tickers` (`historyFrom = min(ancien, from)`).
- Erreur réseau, HTTP non 2xx ou JSON inattendu : on renvoie ce qui est en base avec `stale: true`, ou `null` si rien en base.
  Ne jamais lever d'exception depuis `history`, `historyEur`, `closeEurOn`, `quoteEur` ; `search` lève une `AppError` 502 « Recherche Yahoo indisponible ».
- Conversion : devise `majorCurrency(currency)` ; si ce n'est pas `EUR`, charger l'historique de `EUR${majeure}=X` depuis la même date, puis pour chaque clôture `toEur(close, currency, priceOn(fx, date)?.close ?? null)` ; un point non convertible est omis.
  `stale` du résultat = `stale` du ticker ou du taux.

- [ ] **Step 1: Écrire la fixture `server/test/fixtures/yahoo.ts`**

```ts
/** Réponse `/v8/finance/chart` minimale ; `points` en [date ISO, clôture]. */
export function chart(symbol: string, currency: string, points: [string, number | null][], live?: { date: string; price: number }) {
  const ts = (d: string) => Date.parse(`${d}T16:00:00Z`) / 1000;
  return {
    chart: {
      result: [
        {
          meta: {
            symbol, currency, longName: `${symbol} Inc.`, gmtoffset: 7200,
            regularMarketPrice: live?.price ?? points.at(-1)?.[1] ?? null,
            regularMarketTime: ts(live?.date ?? points.at(-1)![0]),
          },
          timestamp: points.map(([d]) => ts(d)),
          indicators: { quote: [{ close: points.map(([, c]) => c) }] },
        },
      ],
      error: null,
    },
  };
}

export const unknownTicker = { chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } };

/** Faux `fetch` : associe un préfixe d'URL (ticker encodé) à un corps JSON ; compte les appels. */
export function fakeFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) return new Response('{}', { status: 404 });
    if (hit[1] instanceof Error) throw hit[1];
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  };
  return Object.assign(fn, { calls });
}
```

- [ ] **Step 2: Écrire `server/test/prices.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createPrices } from '../src/services/prices';
import { chart, fakeFetch, unknownTicker } from './fixtures/yahoo';
import { createTestDb } from './helpers';

const at = (iso: string) => () => new Date(iso);

describe('prices', () => {
  it('récupère et met en cache un historique en euros', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({ 'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-10-05', 740], ['2026-10-06', 745]], { date: '2026-10-07', price: 748.88 }) });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    const h = await prices.historyEur('SXR8.DE', '2026-10-01');
    expect(h?.closesEur).toEqual([
      { date: '2026-10-05', close: 740 },
      { date: '2026-10-06', close: 745 },
      { date: '2026-10-07', close: 748.88 },
    ]);
    await prices.historyEur('SXR8.DE', '2026-10-03');
    expect(fetch.calls).toHaveLength(1);
  });

  it('convertit une cotation en dollars avec EURUSD=X', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({
      'chart/AAPL': chart('AAPL', 'USD', [['2026-10-06', 220]]),
      'chart/EURUSD%3DX': chart('EURUSD=X', 'USD', [['2026-10-06', 1.1]]),
    });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    expect((await prices.quoteEur('AAPL'))?.eur).toBeCloseTo(200);
  });

  it('renvoie le cache marqué périmé quand Yahoo tombe', async () => {
    const { db } = createTestDb();
    const ok = fakeFetch({ 'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-10-05', 740]]) });
    await createPrices(db, { fetch: ok, now: at('2026-10-05T18:00:00Z') }).quoteEur('SXR8.DE');
    const down = fakeFetch({ 'chart/SXR8.DE': new Error('réseau') });
    const q = await createPrices(db, { fetch: down, now: at('2026-10-07T10:00:00Z') }).quoteEur('SXR8.DE');
    expect(q).toMatchObject({ eur: 740, date: '2026-10-05', stale: true });
  });

  it('null pour un ticker inconnu', async () => {
    const { db } = createTestDb();
    const prices = createPrices(db, { fetch: fakeFetch({ 'chart/NOPE': unknownTicker }), now: at('2026-10-07T10:00:00Z') });
    expect(await prices.quoteEur('NOPE')).toBeNull();
  });

  it('closeEurOn prend la dernière clôture avant la date', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({ 'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-10-02', 730], ['2026-10-05', 740]]) });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    expect(await prices.closeEurOn('SXR8.DE', '2026-10-04')).toMatchObject({ eur: 730, date: '2026-10-02' });
  });

  it('recherche', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({
      'finance/search': { quotes: [{ symbol: 'SXR8.DE', longname: 'iShares Core S&P 500', exchDisp: 'XETRA', typeDisp: 'ETF', isYahooFinance: true }, { index: 'x' }] },
    });
    const r = await createPrices(db, { fetch }).search('SXR8');
    expect(r).toEqual([{ ticker: 'SXR8.DE', name: 'iShares Core S&P 500', exchange: 'XETRA', type: 'ETF' }]);
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npx vitest run server/test/prices.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 4: Implémenter `server/src/services/prices.ts`** selon les règles ci-dessus.
Garder des fonctions internes courtes : `fetchChart(ticker, from, to)` (réseau + parsing, renvoie `{ name, currency, points } | 'unknown' | 'error'`), `storeChart`, `readStored(ticker, from)`, `convert(history)`.
La date du jour vient de `toISODate(now())`.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run server/test/prices.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/prices.ts server/test/prices.test.ts server/test/fixtures/yahoo.ts
git commit -m "feat(server): cours Yahoo avec cache, conversion en euros et repli sur le dernier cours connu"
```

---

### Task 4: Portefeuille et routes de base

**Files:**
- Create: `server/src/services/portfolio.ts`, `server/src/routes/invest.ts`, `server/test/portfolio.test.ts`
- Modify: `server/src/app.ts`, `server/test/helpers.ts`

**Interfaces:**
- Consumes: repos (Task 2), `Prices` (Task 3), `position`, `portfolioSeries`, `valueCents`, `simpleReturn`, `subQty`, `cmpQty`, `isZeroQty` (Task 1).
- Produces:
  ```ts
  // services/portfolio.ts
  export async function buildPortfolio(db: Db, prices: Prices, today: ISODate, range: PortfolioRange): Promise<PortfolioView>
  export function binanceState(db: Db): BinanceState     // lit readSettingKey(db, 'binance')
  export type BinanceStored = { apiKey: string; apiSecret: string; lastSyncAt: string | null; lastError: string | null };

  // routes/invest.ts
  export type InvestDeps = { prices?: Prices; fetch?: HttpFetch; exec?: Exec; now?: () => Date };
  export function investRoutes(deps: InvestDeps): Hono<AppEnv>
  ```
- `AppOptions` gagne `investDeps?: InvestDeps` ; `createApp` construit `createPrices(db, { fetch: investDeps?.fetch, now: investDeps?.now })` si `investDeps?.prices` est absent et monte `app.route('/api/invest', investRoutes({...}))`.
- `createTestApp(initialToday, opts)` accepte `opts.investDeps` et le transmet.

Règles de `buildPortfolio` :
- Pour chaque position : mouvements, `position(trades)`, quantité affichée = `syncedQuantity` pour `source = 'binance'`, sinon `position.quantity`.
- `unpricedQuantity` = `subQty(syncedQuantity, position.quantity)` si positif pour une position Binance, sinon `null`.
- Historique en euros depuis `min(date du premier mouvement, début de la plage)` ; `price` = dernier point ; `dayChangePct` = `simpleReturn(avant-dernier, dernier)`.
- `value = valueCents(quantity, price.eur)` ; `gain = value - costBasis` calculé sur la quantité couverte : `valueCents(position.quantity, price.eur) - costBasis` ; `gainPct = costBasis > 0 ? gain / costBasis : null`.
- Positions à quantité nulle et sans mouvement : exclues ; à quantité nulle avec mouvements : incluses en fin de liste (plus-value réalisée visible).
- Tri : valeur décroissante.
- Totaux : somme des `value` (repli sur `costBasis` si pas de cours), `invested` = somme des `costBasis`, `realized` = somme des `realized`.
- Série : `portfolioSeries` sur la plage (`1m` = 30 jours, `6m` = 182, `1y` = 365, `all` = depuis le premier mouvement, au plus 5 ans), un point par jour ; pour `all` et `1y`, ne garder qu'un point par semaine plus le dernier.
- `stale` = un des cours est périmé.

Routes de cette tâche (le reste vient aux Tasks 5 et 6) :

| Route | Validation | Effet |
|---|---|---|
| `GET /portfolio?range=` | `z.enum(['1m','6m','1y','all']).default('6m')` | `buildPortfolio` |
| `GET /search?q=` | `q` 1 à 60 caractères | `prices.search` |
| `POST /holdings` | `holdingInputSchema` | vérifie le ticker par `prices.quoteEur` (sinon 400 `unknown_ticker` « Ticker introuvable chez Yahoo ») ; crée la position `manual` et son premier mouvement dans une transaction ; 201 avec la position créée |
| `DELETE /holdings/:id` | id | refuse une position `binance` (400 `synced_holding` « Position synchronisée avec Binance ») ; 204 |
| `POST /holdings/:id/trades` | `tradeInputSchema` | refuse une vente supérieure à la quantité détenue à cette date (400 `oversell` « Vente supérieure à la quantité détenue ») ; 201 |
| `PATCH /trades/:id`, `DELETE /trades/:id` | `tradePatchSchema` / id | refuse un mouvement `binance` (400 `synced_trade` « Mouvement importé de Binance ») ; 200 / 204 |

- [ ] **Step 1: Écrire `server/test/portfolio.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { chart, fakeFetch } from './fixtures/yahoo';
import { createTestApp } from './helpers';

function setup() {
  const fetch = fakeFetch({
    'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2025-10-01', 600], ['2026-10-06', 720]], { date: '2026-10-07', price: 720 }),
    'finance/search': { quotes: [{ symbol: 'SXR8.DE', longname: 'iShares Core S&P 500', exchDisp: 'XETRA', typeDisp: 'ETF' }] },
  });
  return createTestApp('2026-10-07', { investDeps: { fetch, now: () => new Date('2026-10-07T10:00:00Z') } });
}

const firstTrade = { side: 'buy', date: '2025-10-01', quantity: '5', amount: 3000_00, fees: 1_00 };

describe('portefeuille', () => {
  it('portefeuille vide', async () => {
    const t = setup();
    const r = await t.call('GET', '/api/invest/portfolio');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ holdings: [], totals: { value: 0, invested: 0, gain: 0 }, binance: { configured: false } });
  });

  it('valorise une position manuelle', async () => {
    const t = setup();
    const c = await t.call('POST', '/api/invest/holdings', { platform: 'trade_republic', ticker: 'SXR8.DE', name: 'S&P 500', firstTrade });
    expect(c.status).toBe(201);
    const r = await t.call('GET', '/api/invest/portfolio?range=1y');
    const h = r.body.holdings[0];
    expect(h).toMatchObject({ quantity: '5', costBasis: 3001_00, value: 3600_00, gain: 599_00 });
    expect(h.gainPct).toBeCloseTo(599 / 3001);
    expect(r.body.totals).toMatchObject({ value: 3600_00, invested: 3001_00 });
    expect(r.body.series.at(-1)).toEqual({ date: '2026-10-07', value: 3600_00, invested: 3001_00 });
  });

  it('refuse un ticker inconnu et une vente trop grande', async () => {
    const t = setup();
    const bad = await t.call('POST', '/api/invest/holdings', { platform: 'other', ticker: 'NOPE', name: 'x', firstTrade });
    expect(bad).toMatchObject({ status: 400, body: { code: 'unknown_ticker' } });
    const c = await t.call('POST', '/api/invest/holdings', { platform: 'trade_republic', ticker: 'SXR8.DE', name: 'S&P 500', firstTrade });
    const sell = await t.call('POST', `/api/invest/holdings/${c.body.id}/trades`, { side: 'sell', date: '2026-01-01', quantity: '6', amount: 100_00 });
    expect(sell).toMatchObject({ status: 400, body: { code: 'oversell' } });
  });

  it('modifie et supprime un mouvement, supprime une position', async () => {
    const t = setup();
    const c = await t.call('POST', '/api/invest/holdings', { platform: 'trade_republic', ticker: 'SXR8.DE', name: 'S&P 500', firstTrade });
    const add = await t.call('POST', `/api/invest/holdings/${c.body.id}/trades`, { side: 'buy', date: '2026-01-02', quantity: '1', amount: 650_00 });
    expect((await t.call('PATCH', `/api/invest/trades/${add.body.id}`, { quantity: '2' })).body.quantity).toBe('2');
    expect((await t.call('DELETE', `/api/invest/trades/${add.body.id}`)).status).toBe(204);
    expect((await t.call('DELETE', `/api/invest/holdings/${c.body.id}`)).status).toBe(204);
  });

  it('recherche', async () => {
    const t = setup();
    const r = await t.call('GET', '/api/invest/search?q=sxr8');
    expect(r.body[0]).toMatchObject({ ticker: 'SXR8.DE' });
  });
});
```

- [ ] **Step 2: Vérifier l'échec** - Run: `npx vitest run server/test/portfolio.test.ts` ; Expected: FAIL.

- [ ] **Step 3: Implémenter** `services/portfolio.ts`, `routes/invest.ts` (structure de `routes/accounts.ts`, `validate` de `../validate`, erreurs via `AppError(message, 400, code)` de `../errors`), puis brancher `app.ts` et `helpers.ts`.
Pour `POST /holdings`, renvoyer la ligne `HoldingRow` créée ; `POST /holdings/:id/trades` et `PATCH /trades/:id` renvoient la `TradeRow`.

- [ ] **Step 4: Lancer** - Run: `npx vitest run server/test/portfolio.test.ts && npm test && npm run typecheck && npm run lint` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/portfolio.ts server/src/routes/invest.ts server/src/app.ts server/test/helpers.ts server/test/portfolio.test.ts
git commit -m "feat(server): portefeuille valorisé et routes des positions manuelles"
```

---

### Task 5: Synchronisation Binance

**Files:**
- Create: `server/src/bank/binance.ts`, `server/src/services/binance-sync.ts`, `server/test/binance.test.ts`, `server/test/fixtures/binance.ts`
- Modify: `server/src/routes/invest.ts`

**Interfaces:**
- Consumes: repos (Task 2), `Prices` (Task 3), `BinanceStored`, `binanceState` (Task 4), `CASH_ASSETS` (Task 1), `addQty`, `subQty`, `isZeroQty`, `valueCents`.
- Produces:
  ```ts
  // bank/binance.ts
  export const BINANCE_BASE = 'https://api.binance.com';
  export class BinanceError extends AppError {}            // status 502, code 'binance_error', message « Binance : <msg> »
  export type BinanceClientDeps = { fetch?: HttpFetch; now?: () => number };
  export function createBinanceClient(keys: { apiKey: string; apiSecret: string }, deps?: BinanceClientDeps): BinanceClient;
  export type BinanceClient = {
    restrictions(): Promise<Record<string, boolean | number>>;
    balances(): Promise<Map<string, string>>;              // spot + funding + earn flexible, additionnés, > 0
    pairs(): Promise<Set<string>>;                         // symboles TRADING de /api/v3/exchangeInfo
    myTrades(symbol: string): Promise<SpotTrade[]>;        // toutes les pages via fromId
    convertFlow(startMs: number, endMs: number): Promise<ConvertTrade[]>;   // fenêtres de 30 jours
    fiatBuys(startMs: number, endMs: number): Promise<FiatBuy[]>;           // fenêtres de 30 jours, status Completed
  };
  export type SpotTrade = { id: number; symbol: string; price: string; qty: string; quoteQty: string; commission: string; commissionAsset: string; time: number; isBuyer: boolean };
  export type ConvertTrade = { orderId: number | string; fromAsset: string; fromAmount: string; toAsset: string; toAmount: string; createTime: number; orderStatus: string };
  export type FiatBuy = { orderNo: string; sourceAmount: string; fiatCurrency: string; obtainAmount: string; cryptoCurrency: string; totalFee: string; status: string; createTime: number };

  // services/binance-sync.ts
  export type BinanceDeps = { fetch?: HttpFetch; now?: () => Date };
  export async function saveBinanceKeys(db: Db, keys: BinanceKeys, deps: BinanceDeps): Promise<BinanceState>;
  export function disconnectBinance(db: Db): void;
  export async function syncBinance(db: Db, prices: Prices, deps: BinanceDeps, opts?: { onlyIfStaleMinutes?: number }): Promise<BinanceSyncResult>;
  ```

Règles du client :
- Requête signée : paramètres + `timestamp` (= `now()`) + `recvWindow=10000`, `signature = createHmac('sha256', apiSecret).update(query).digest('hex')`, en-tête `X-MBX-APIKEY`.
- `GET /sapi/v1/account/apiRestrictions` ; `GET /api/v3/account?omitZeroBalances=true` (`balances[].free + locked`) ; `POST /sapi/v1/asset/get-funding-asset` (`[].free + locked + freeze`) ; `GET /sapi/v1/simple-earn/flexible/position?size=100` (`rows[].asset`, `totalAmount`).
  Les actifs préfixés `LD` sont ignorés.
- `GET /api/v3/exchangeInfo?permissions=SPOT` est public (non signé).
- `GET /api/v3/myTrades?symbol=&fromId=&limit=1000` jusqu'à moins de 1000 lignes.
- `GET /sapi/v1/convert/tradeFlow?startTime=&endTime=&limit=1000`, garder `orderStatus === 'SUCCESS'`.
- `GET /sapi/v1/fiat/payments?transactionType=0&beginTime=&endTime=`, garder `status === 'Completed'`.
- Corps d'erreur `{ code, msg }` ou HTTP non 2xx : `BinanceError`. Erreur réseau : `BinanceError('Binance injoignable')`.
  Code `-2015` ou `-2014` : message « Binance : clé API refusée (révoquée ou IP non autorisée) ».

Règles de la synchro :
- `saveBinanceKeys` : `restrictions()` ; refus (`AppError` 400 `binance_key_permissions`, « Cette clé peut trader ou retirer : crée une clé en lecture seule ») si une des clés `enableSpotAndMarginTrading`, `enableWithdrawals`, `enableInternalTransfer`, `permitsUniversalTransfer`, `enableMargin`, `enableFutures`, `enableVanillaOptions`, `enablePortfolioMarginTrading` vaut `true` ; refus si `enableReading !== true`.
  Puis `writeSettingKey(db, 'binance', { ...keys, lastSyncAt: null, lastError: null })`.
- `disconnectBinance` : `deleteBinanceHoldings` puis `writeSettingKey(db, 'binance', null)`.
- `syncBinance` :
  1. Pas de clé : `AppError` 400 `binance_not_configured`.
  2. `onlyIfStaleMinutes` et `lastSyncAt` plus récent : `{ skipped: true, holdings: 0, newTrades: 0, warnings: [] }`.
  3. Fenêtre des conversions et achats carte : depuis `lastSyncAt - 2 jours`, ou 3 ans en arrière à la première synchro.
  4. Actifs suivis = actifs des soldes hors `CASH_ASSETS` ∪ actifs crypto vus dans les conversions et achats.
  5. Pour chaque actif : ticker `${asset}-EUR` vérifié par `prices.quoteEur` ; sinon avertissement « <ASSET> : pas de cours en euros, ignoré ».
     Position créée si absente (`platform 'binance'`, `source 'binance'`, nom = `name` Yahoo sans le suffixe « EUR », `externalAsset`), seulement si sa valeur dépasse 1 € ou si elle a des mouvements ; `setSyncedQuantity` avec le solde (ou `'0'`).
  6. Mouvements, `addTrade(..., { source: 'binance', externalId })` pour dédoublonner :
     - spot, pour chaque paire `${asset}${q}` existante avec `q` dans `EUR`, `USDT`, `USDC` : achat si `isBuyer` sinon vente ; `amount` = `quoteQty` converti en euros (`EUR` direct ; `USDT`/`USDC` divisé par le taux du jour lu avec `prices.history('EURUSD=X', date)` puis `priceOn`, car `closeEurOn` convertirait le taux lui-même) ; commission dans l'actif : quantité nette (`subQty`) pour un achat ; commission dans la devise de cotation : convertie en frais ; commission en `BNB` : frais = commission × `closeEurOn('BNB-EUR', date)`, 0 si inconnu. `externalId = trade:${symbol}:${id}`.
     - conversion : de liquidité vers crypto = achat (`amount` = `fromAmount` en euros) ; de crypto vers liquidité = vente ; de crypto vers crypto = vente de l'une et achat de l'autre, au montant `toAmount × closeEurOn(toAsset-EUR, date)`. `externalId = convert:${orderId}:buy|sell`.
     - achat carte : achat de `obtainAmount` `cryptoCurrency`, `amount` = `sourceAmount - totalFee` en euros, `fees` = `totalFee`. `externalId = fiat:${orderNo}`.
  7. Fin : `lastSyncAt = now().toISOString()`, `lastError = null`. Sur `BinanceError` : `lastError = message`, puis relancer l'erreur.
  8. Résultat : nombre de positions synchronisées, nombre de mouvements insérés, avertissements.

Routes ajoutées à `routes/invest.ts` : `GET /binance` (`binanceState`), `PUT /binance` (`binanceKeysSchema` puis `saveBinanceKeys`), `DELETE /binance` (204), `POST /binance/sync` (`binanceSyncSchema`, corps facultatif).

- [ ] **Step 1: Écrire la fixture `server/test/fixtures/binance.ts`** : un faux `fetch` qui route par chemin (`/sapi/v1/account/apiRestrictions`, `/api/v3/account`, `/sapi/v1/asset/get-funding-asset`, `/sapi/v1/simple-earn/flexible/position`, `/api/v3/exchangeInfo`, `/api/v3/myTrades`, `/sapi/v1/convert/tradeFlow`, `/sapi/v1/fiat/payments`, plus les `chart/` Yahoo de `fixtures/yahoo.ts`), garde les URL et en-têtes appelés, et accepte des surcharges par test.
Valeurs par défaut : restrictions lecture seule ; spot `BTC 0.03`, `EUR 12`, `LDBTC 1` ; funding vide ; earn `BTC 0.01` ; paires `BTCEUR`, `BTCUSDT` ; un `myTrades` `BTCEUR` (id 1, achat de `0.02` pour `1500` EUR, commission `0.00002 BTC`, 2025-10-10) ; une conversion `EUR -> BTC` de `750` pour `0.01` (2025-12-01) ; un achat carte de `750` EUR, frais `15`, `0.01` BTC (2026-02-01) ; Yahoo `BTC-EUR` à 70 000, `EURUSD=X` à 1.1.

- [ ] **Step 2: Écrire `server/test/binance.test.ts`** couvrant :
  - signature : la requête vers `/api/v3/account` porte `X-MBX-APIKEY` et une `signature` égale au HMAC attendu calculé dans le test avec `createHmac` ;
  - `PUT /api/invest/binance` refuse une clé avec `enableSpotAndMarginTrading: true` (400 `binance_key_permissions`), accepte la lecture seule, et `GET /api/invest/binance` renvoie `{ configured: true, apiKeyHint: '<4 derniers>' }` sans jamais contenir le secret (vérifier `JSON.stringify(body)` ne contient ni la clé complète ni le secret) ;
  - `POST /api/invest/binance/sync` : une position BTC avec `quantity` `'0.04'` (spot 0.03 + earn 0.01, `LDBTC` ignoré, `EUR` ignoré), 3 mouvements, `costBasis` = 1500 + 750 + 750 = 3000 €, `unpricedQuantity` = `0.04 - (0.01998 + 0.01 + 0.01)` = `'0.00002'` ;
  - une deuxième synchro n'ajoute aucun mouvement (`newTrades: 0`) ;
  - `onlyIfStaleMinutes: 60` juste après : `skipped: true` ;
  - une erreur `-2015` enregistre `lastError` et renvoie 502 ; les positions déjà synchronisées restent ;
  - `DELETE /api/invest/binance` supprime la position BTC et l'état.

- [ ] **Step 3: Vérifier l'échec** - Run: `npx vitest run server/test/binance.test.ts` ; Expected: FAIL.

- [ ] **Step 4: Implémenter** `bank/binance.ts`, `services/binance-sync.ts` et les routes, en suivant les règles ci-dessus.

- [ ] **Step 5: Lancer** - Run: `npx vitest run server/test/binance.test.ts && npm test && npm run typecheck && npm run lint` ; Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/bank/binance.ts server/src/services/binance-sync.ts server/src/routes/invest.ts server/test/binance.test.ts server/test/fixtures/binance.ts
git commit -m "feat(server): synchronisation Binance en lecture seule (soldes, échanges, conversions, achats carte)"
```

---

### Task 6: Idées d'investissement

**Files:**
- Modify: `server/src/services/claude.ts`, `server/src/routes/invest.ts`, `server/src/index.ts`
- Create: `server/src/services/ideas.ts`, `server/test/ideas.test.ts`

**Interfaces:**
- Consumes: `Exec`, `execClaude`, `ClaudeError` (existants), repos idées (Task 2), `Prices` (Task 3), `ideaCandidateSchema`, `ideaBatchSchema`, `BENCHMARK_TICKER`, `simpleReturn`, `ideasSummary` (Task 1), `listHoldings` (Task 2).
- Produces:
  ```ts
  // services/claude.ts (refactor sans changement de comportement du tri)
  export async function runClaude(args: string[], timeoutMs: number, exec: Exec): Promise<unknown>  // renvoie structured_output, lève ClaudeError
  // services/ideas.ts
  export const IDEAS_TIMEOUT_MS = 600_000;
  export const WEEK_DAYS = 7;
  export type IdeasDeps = { exec?: Exec; prices: Prices; now?: () => Date; model?: string };
  export function buildIdeasPrompt(input: { today: ISODate; holdings: { name: string; ticker: string }[]; recent: { title: string; ticker: string }[] }): string;
  export function startIdeaRun(db: Db, deps: IdeasDeps, trigger: 'manual' | 'weekly'): { start: IdeaRunStart; done: Promise<void> };
  export async function closeDueIdeas(db: Db, prices: Prices, today: ISODate): Promise<void>;
  export async function buildIdeasView(db: Db, prices: Prices, today: ISODate): Promise<IdeasView>;
  export function toRunView(row: IdeaRunRow): IdeaRunView;
  ```

Règles :
- `runClaude` reprend de `runBatch` : codes 127 et 124, JSON illisible, « not logged in », `is_error`, et renvoie `structured_output`.
  `runBatch` l'utilise puis valide avec `suggestionResultSchema`. Les tests `claude.test.ts` existants doivent passer sans modification.
- Arguments : `['-p', '--tools', 'WebSearch', '--allowedTools', 'WebSearch', '--output-format', 'json', '--json-schema', JSON.stringify(ideasJsonSchema)]`, `--model` si `model`, puis le prompt.
  `ideasJsonSchema` est écrit à la main (comme `outputJsonSchema` du tri) : objet `{ ideas: array of { title, event, sourceUrl, reasoning: string[], pricedIn, ticker, assetName, whereToBuy: enum, horizon } }`, tous requis.
- Prompt (en français) : date du jour ; positions détenues ; idées des 28 derniers jours ; consignes :
  - chercher sur le web l'actualité des derniers jours et les événements datés à venir (fêtes, sorties, saisons, décisions, salons, météo, sport...) ;
  - proposer 3 à 5 idées, chacune partant d'un événement précis et sourcé (URL de l'article lu) ;
  - une déduction en 2 ou 3 étapes simples, du type « fête des nouilles → besoin de baguettes → fabricant de baguettes » ;
  - un actif coté précis, avec son ticker Yahoo Finance exact (suffixe de place : `.PA`, `.DE`, `.T`, `.KS`, `-EUR` pour une crypto, `=F` pour un contrat à terme) ;
  - un horizon (date `YYYY-MM-DD`) entre 7 jours et 1 an après aujourd'hui ;
  - `whereToBuy` : `trade_republic` (actions et ETF européens et américains), `binance` (cryptos), sinon `other` ;
  - « pricedIn » : dire honnêtement si le marché a probablement déjà intégré l'événement ;
  - ne pas reproposer un actif déjà détenu ni une idée récente ;
  - répondre uniquement avec le JSON demandé.
- `startIdeaRun` (synchrone jusqu'au lancement) :
  - fournée `running` existante : `{ start: { run: toRunView(en cours), started: false }, done: Promise.resolve() }` ;
  - `weekly` et dernière fournée réussie de moins de `WEEK_DAYS` jours : idem avec la dernière fournée ;
  - sinon `createRun`, puis lancement asynchrone de `execute` (non attendu par la route) ; `done` résout quand la fournée est finie, jamais rejetée.
- `execute` : `runClaude` avec `IDEAS_TIMEOUT_MS` ; `ideaBatchSchema` ; chaque élément passé à `ideaCandidateSchema.safeParse` (échec : rejet `{ ticker: élément.ticker ?? '?', reason: 'Format invalide' }`) ; horizon hors de [aujourd'hui + 7 j, aujourd'hui + 366 j] : rejet « Horizon hors limites » ; ticker en double dans la fournée : rejet « Doublon » ; `prices.quoteEur(ticker)` nul : rejet « Ticker introuvable chez Yahoo » ; cours de la référence nul : la fournée échoue (« Cours du S&P 500 indisponible »).
  Insertion des idées acceptées, `finishRun('done')`. Toute exception : `finishRun('failed', error: message)` (message de `ClaudeError` ou « Erreur inattendue »).
- `closeDueIdeas` : pour chaque idée ouverte dont `horizon < today`, `closeEurOn(ticker, horizon)` et `closeEurOn(BENCHMARK_TICKER, horizon)` ; si les deux existent, `closeIdea` avec `simpleReturn`.
- `buildIdeasView` : appelle `closeDueIdeas`, puis pour chaque idée ouverte `quoteEur(ticker)` et `quoteEur(BENCHMARK_TICKER)` (une seule fois) pour `return`, `benchReturn`, `priceDate` ; idées closes : valeurs figées, `priceDate = horizon`.
  `summary = ideasSummary(closes)` ; `lastRun = latestRun`.
- Routes : `GET /ideas` → `buildIdeasView` ; `POST /ideas/runs` (`ideaRunStartSchema`) → `startIdeaRun(...).start`, statut 202 si `started`, 200 sinon ; `GET /ideas/runs/:id` → `toRunView(getRun)`.
  `model` = `getSettings(db).claudeModel || undefined`.
- `server/src/index.ts` : après `openDb`, `failInterruptedRuns(db, new Date().toISOString())`.

- [ ] **Step 1: Écrire `server/test/ideas.test.ts`** avec un faux `exec` (comme `claude.test.ts`, fonction `ok(structured)`) et `fixtures/yahoo.ts` (`SXR8.DE` 700 puis 714, `BAG.PA` 10 puis 12, `NOPE` inconnu). Cas :
  - `buildIdeasPrompt` contient la date, les positions et les idées récentes ;
  - les arguments passés à `exec` commencent par `['-p', '--tools', 'WebSearch', '--allowedTools', 'WebSearch']` et contiennent `--json-schema` ;
  - une fournée avec une idée valide (`BAG.PA`), une au ticker inconnu (`NOPE`), une à l'horizon trop proche et un élément malformé : `await done`, fournée `done`, `acceptedCount: 1`, trois rejets avec leurs raisons ; l'idée a `startPriceEur` 12 si le cours courant est 12 ;
  - `POST /api/invest/ideas/runs` `weekly` juste après une fournée réussie : 200, `started: false` ; `manual` : 202 ;
  - deux lancements simultanés : le second renvoie `started: false` avec la fournée en cours ;
  - `exec` qui renvoie le code 124 : fournée `failed` avec « Claude a mis trop de temps à répondre » ;
  - clôture : avec `setToday` après l'horizon et des cours `BAG.PA` 15 / `SXR8.DE` 735 à l'horizon, `GET /api/invest/ideas` renvoie l'idée dans `closed` avec `return` ≈ 0.25 (départ 12) et `benchReturn` ≈ 0.05 (départ 700), et `summary.beatCount` = 1 ;
  - `failInterruptedRuns` est déjà testé en Task 2.

  Pour les tests de route, exposer `done` en injectant dans `InvestDeps` un `onRunStarted?: (done: Promise<void>) => void` que la route appelle ; les tests y capturent la promesse et l'attendent.

- [ ] **Step 2: Vérifier l'échec** - Run: `npx vitest run server/test/ideas.test.ts` ; Expected: FAIL.

- [ ] **Step 3: Refactor `claude.ts`** (extraire `runClaude`), puis Run: `npx vitest run server/test/claude.test.ts` ; Expected: PASS sans modifier ce test.

- [ ] **Step 4: Implémenter** `services/ideas.ts`, les routes et l'appel dans `index.ts`.

- [ ] **Step 5: Lancer** - Run: `npx vitest run server/test/ideas.test.ts && npm test && npm run typecheck && npm run lint` ; Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/claude.ts server/src/services/ideas.ts server/src/routes/invest.ts server/src/index.ts server/test/ideas.test.ts
git commit -m "feat(server): idées d'investissement par Claude avec recherche web, suivies face au S&P 500"
```

---

### Task 7: Client - navigation, hooks et portefeuille

**Files:**
- Modify: `client/src/components/layout/nav.ts`, `client/src/components/layout/BottomNav.module.css`, `client/src/router.tsx`, `client/src/api/hooks.ts`
- Create: `client/src/pages/Invest.tsx`, `client/src/pages/Invest.module.css`, `client/src/components/invest/PortfolioSummary.tsx`, `PortfolioChart.tsx`, `HoldingList.tsx`, `HoldingDialog.tsx`, `TradeDialog.tsx`, `AddHoldingDialog.tsx` (+ `.module.css` au besoin), `client/src/lib/invest.ts`, `client/src/lib/invest.test.ts`, `client/src/components/invest/HoldingList.test.tsx`

**Interfaces:**
- Consumes: routes `/api/invest/*` (Tasks 4 à 6), types `shared/api-types.ts` (Task 1), composants `@/components/ui` (`Amount`, `Button`, `Dialog`, `Field`, `Input`, `DateInput`, `MoneyInput`, `Segmented`, `Select`, `Skeleton`, `EmptyState`, `useToast`), `PageHeader`, `chart.module.css`, `ChartTooltip`, `axisEuros`.
- Produces (`hooks.ts`) :
  ```ts
  keys.portfolio = (range: PortfolioRange) => ['invest', 'portfolio', range] as const;
  keys.ideas = ['invest', 'ideas'] as const;
  keys.ideaRun = (id: number) => ['invest', 'run', id] as const;
  usePortfolio(range: PortfolioRange)
  useAssetSearch(query: string)                         // enabled si query.trim().length >= 2, staleTime 60 s
  useCreateHolding(opts?), useDeleteHolding(opts?)
  useAddTrade(opts?)    // vars: { holdingId: number } & TradeInput
  useUpdateTrade(opts?) // vars: { id: number } & TradePatch
  useDeleteTrade(opts?)
  useSaveBinance(opts?), useDisconnectBinance(opts?), useSyncBinance(opts?)  // vars sync: number | undefined (onlyIfStaleMinutes)
  useIdeas()
  useStartIdeaRun(opts?)  // vars: 'manual' | 'weekly'
  useIdeaRun(id: number | null)  // refetchInterval 3000 tant que status === 'running', puis invalide keys.ideas
  ```
  Toutes les mutations Investir invalident le préfixe `['invest']`.
- Produces (`lib/invest.ts`) : `formatPct(fraction: number | null, opts?: { signed?: boolean }): string` (« +12,3 % », « -4,0 % », « - » si null), `formatQty(q: string): string` (virgule décimale, au plus 8 décimales significatives), `gainTone(n: number | null): 'positive' | 'negative' | 'neutral'`.

Contenu de l'écran (première partie, le reste en Tasks 8 et 9) :
- `nav.ts` : `{ to: '/investir', label: 'Investir', icon: TrendingUp }` après Analyse ; `BottomNav.module.css` passe à `repeat(5, 1fr)`.
- `router.tsx` : `{ path: 'investir', lazy: () => import('@/pages/Invest').then((m) => ({ Component: m.InvestPage })) }`.
- `InvestPage` : `PageHeader` « Investir », sous-titre « Ton portefeuille, et des idées tirées de l'actualité. », actions : bouton « Ajouter une position ».
  Sections dans cet ordre : `PortfolioSummary`, `PortfolioChart`, `HoldingList`, `IdeasSection` (Task 9), `IdeasScore` (Task 9).
- `PortfolioSummary` : grand montant de la valeur totale (Bricolage Grotesque, `useCountUp` comme sur l'accueil), puis « Investi 6 000 € », plus-value en euros et en pourcentage colorée (`--positive` / `--negative`), plus-value réalisée si non nulle ; mention « cours du 5 oct. » en `--ink-mute` si `stale`.
- `PortfolioChart` : `Segmented` 1 mois / 6 mois / 1 an / Tout ; `LineChart` Recharts avec deux séries, « Valeur » en `--ink` plein et « Investi » en `--ink-mute` pointillé ; tooltip `ChartTooltip` ; légende comme `NetWorthLine`.
- `HoldingList` : une ligne par position, nom, puce de plateforme (`Badge`), quantité (`formatQty`) et ticker en `IBM Plex Mono` réduit, valeur à droite, plus-value et pourcentage dessous, variation du jour ; mention « 0,00002 BTC sans prix d'achat » si `unpricedQuantity`.
  Clic ou Entrée : `HoldingDialog`.
  État vide : `EmptyState` « Aucune position » avec le bouton « Ajouter une position ».
- `HoldingDialog` : en-tête nom + ticker, chiffres clés (quantité, PMP = coût / quantité, valeur, plus-value), liste des mouvements (date, Achat/Vente, quantité, montant, frais) ; mouvements manuels modifiables (ouvre `TradeDialog`) et supprimables ; bouton « Ajouter un achat » ; pour une position manuelle, « Supprimer la position » à gauche en rouge avec confirmation `window.confirm` remplacée par un second clic « Confirmer la suppression » (pas de `confirm` natif) ; mouvements Binance en lecture seule avec la mention « Importé de Binance ».
- `TradeDialog` : `Segmented` Achat / Vente, `DateInput`, quantité (`Input` `inputMode="decimal"`), `MoneyInput` montant payé (« Montant payé, hors frais »), `MoneyInput` frais (défaut 1,00 € si la position est Trade Republic, 0 sinon) ; affiche le prix unitaire calculé (« soit 600,00 € par part ») ; erreurs serveur sous le formulaire.
- `AddHoldingDialog` : champ de recherche (anti-rebond 300 ms) → liste de résultats `useAssetSearch` (nom, ticker, place, type) ; après choix : plateforme en `Segmented` (Trade Republic / Binance / Ailleurs), nom modifiable, puis les champs du premier achat (mêmes composants que `TradeDialog`, extraits dans un composant `TradeFields` partagé).

- [ ] **Step 1: Tests de `lib/invest.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatPct, formatQty, gainTone } from './invest';

describe('format invest', () => {
  it('formatPct', () => {
    expect(formatPct(0.1234, { signed: true })).toBe('+12,3 %');
    expect(formatPct(-0.04, { signed: true })).toBe('-4,0 %');
    expect(formatPct(null)).toBe('-');
  });
  it('formatQty', () => {
    expect(formatQty('0.04512')).toBe('0,04512');
    expect(formatQty('5')).toBe('5');
    expect(formatQty('0.123456789012')).toBe('0,12345679');
  });
  it('gainTone', () => {
    expect(gainTone(1)).toBe('positive');
    expect(gainTone(-1)).toBe('negative');
    expect(gainTone(0)).toBe('neutral');
    expect(gainTone(null)).toBe('neutral');
  });
});
```

Utiliser un vrai signe moins typographique ou le trait d'union selon `formatEuros` : relire `shared/money.ts` et aligner `formatPct` sur la même convention (et ajuster l'attendu du test en conséquence).

- [ ] **Step 2: Test de `HoldingList.test.tsx`** : rendu avec deux `HoldingView` (une manuelle, une Binance avec `unpricedQuantity: '0.00002'`) dans un `QueryClientProvider` et un `MemoryRouter` ; vérifie les noms, la valeur formatée, « 0,00002 BTC sans prix d'achat », et qu'un clic appelle `onOpen` avec l'id. État vide : le texte « Aucune position ».

- [ ] **Step 3: Vérifier l'échec**, implémenter hooks, lib, navigation, route, page et composants.
Styles : variables de `tokens.css` uniquement, sections séparées par l'espace et des filets, une seule surface en relief (le résumé), conforme à « Direction visuelle » de `2026-10-06-ux-redesign.md`.

- [ ] **Step 4: Lancer** - Run: `npm test && npm run typecheck && npm run lint` ; Expected: PASS.

- [ ] **Step 5: Vérifier dans le navigateur** : `npm run dev` dans le worktree avec `RUNWAY_DB=tmp/invest-e2e.db` (copie de `data/runway.db` du dépôt principal, jamais la vraie base), ajouter la position S&P 500 (rechercher « SXR8 »), un achat, ouvrir le détail, à 1440px et 390px, clair et sombre.

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "feat(client): écran Investir avec portefeuille, positions et saisie des achats"
```

---

### Task 8: Client - Binance

**Files:**
- Create: `client/src/components/invest/BinancePanel.tsx`, `BinancePanel.module.css`, `BinanceConnectDialog.tsx`, `client/src/components/invest/useAutoInvest.ts`
- Modify: `client/src/pages/Invest.tsx`

**Interfaces:**
- Consumes: `useSaveBinance`, `useDisconnectBinance`, `useSyncBinance`, `PortfolioView.binance` (Task 7).
- Produces: `useAutoInvest(): void` (appelé par `InvestPage`, étendu en Task 9).

Contenu :
- `BinancePanel`, sous la liste des positions :
  - non configuré : phrase « Relie Binance pour suivre tes cryptos automatiquement. » et bouton « Relier Binance » ;
  - configuré : « Binance · clé …abcd · synchronisé il y a 5 min » (`relativeDay` / `formatDateTime` de `lib/format.ts`), bouton « Synchroniser » (spinner pendant l'appel), menu « Déconnecter » (second clic de confirmation) ;
  - `lastError` : bandeau `--negative` avec le message et « Réessayer ».
- `BinanceConnectDialog` : étapes courtes pour créer la clé (« Binance → Profil → Gestion des API → Créer une API → clé générée par le système ; ne cocher que "Activer la lecture" ») ; champs « Clé API » et « Clé secrète » (`Input` `type="password"` pour le secret, police mono) ; erreur serveur affichée (`binance_key_permissions` explicite) ; succès : toast « Binance relié », puis synchro immédiate.
- `useAutoInvest` : à l'arrivée sur la page, une fois, si Binance est configuré : `useSyncBinance` avec `onlyIfStaleMinutes = 60`, silencieux sauf erreur (le bandeau s'en charge) et toast « N nouveaux mouvements Binance » si `newTrades > 0`.

- [ ] **Step 1: Test** `BinancePanel.test.tsx` : état non configuré (bouton « Relier Binance »), état configuré avec `lastError` (message et « Réessayer » visibles).
- [ ] **Step 2: Vérifier l'échec, implémenter.**
- [ ] **Step 3: Lancer** - Run: `npm test && npm run typecheck && npm run lint` ; Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add client/src
git commit -m "feat(client): liaison et synchronisation Binance dans l'écran Investir"
```

---

### Task 9: Client - idées et bilan

**Files:**
- Create: `client/src/components/invest/IdeasSection.tsx`, `IdeaCard.tsx`, `IdeasScore.tsx` (+ `.module.css`), `client/src/components/invest/IdeaCard.test.tsx`
- Modify: `client/src/pages/Invest.tsx`, `client/src/components/invest/useAutoInvest.ts`

**Interfaces:**
- Consumes: `useIdeas`, `useStartIdeaRun`, `useIdeaRun`, `IdeasView`, `IdeaView`, `PLATFORM_LABELS`, `BENCHMARK_NAME`, `formatPct`, `gainTone`.

Contenu :
- `IdeasSection` : titre « Idées », sous-titre « Tirées de l'actualité par Claude, suivies face au S&P 500. », bouton « Trouver des idées ».
  Pendant une fournée : ligne d'état « Claude lit l'actualité... » avec une animation discrète (désactivée si `prefers-reduced-motion`), bouton désactivé.
  À la fin : compte-rendu « 4 idées ajoutées · 1 écartée » ; les rejets dépliables (ticker et raison) ; en cas d'échec, le message d'erreur et « Réessayer ».
  Liste des idées ouvertes (`IdeaCard`), puis « Idées closes » repliable.
  État vide : « Pas encore d'idées » et le bouton.
- `IdeaCard` : titre ; l'événement et un lien « Source » (`target="_blank" rel="noreferrer"`, domaine affiché) ; la déduction en étapes reliées par « → » ; l'actif (nom, ticker en mono, puce « À acheter sur Trade Republic / Binance / ailleurs ») ; « D'ici le 28 oct. » ou « Close le 28 oct. » ; bloc « Déjà dans les prix ? » en `--ink-mute` ; performance : `formatPct(return)` coloré face à `formatPct(benchReturn)` « S&P 500 », et pour une idée close le verdict « A battu le S&P 500 » ou « N'a pas battu le S&P 500 ».
- `IdeasScore` (affiché s'il y a au moins une idée close) : « 3 idées sur 5 ont battu le S&P 500 », écart moyen, « 100 € sur chaque idée : 540 € investis → 583 €, contre 561 € sur le S&P 500 ».
- `useAutoInvest` : ajoute, une fois par visite, `useStartIdeaRun('weekly')` ; si la réponse a `started: true`, l'id de fournée alimente `useIdeaRun` pour l'état en cours.
  `IdeasSection` reprend aussi une fournée `running` trouvée dans `lastRun` au chargement.

- [ ] **Step 1: Test** `IdeaCard.test.tsx` : idée ouverte (déduction en étapes, lien source, performances), idée close battue (« A battu le S&P 500 ») et non battue.
- [ ] **Step 2: Vérifier l'échec, implémenter.**
- [ ] **Step 3: Lancer** - Run: `npm test && npm run typecheck && npm run lint` ; Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add client/src
git commit -m "feat(client): idées d'investissement, fournées et bilan face au S&P 500"
```

---

### Task 10: Vérification de bout en bout et finitions

**Files:** selon les défauts trouvés ; `README.md` (section « Investir »).

- [ ] **Step 1:** Copier la vraie base dans `tmp/invest-e2e.db` (jamais l'écrire), lancer `RUNWAY_DB=tmp/invest-e2e.db npm run dev` dans le worktree.
- [ ] **Step 2:** Avec Chrome DevTools MCP, à 1440px puis 390px, en clair puis en sombre : ajouter l'ETF S&P 500 de Trade Republic (3 000 € investis), vérifier la valeur et la plus-value face à l'appli Trade Republic de l'utilisateur ; ouvrir le détail ; ajouter et supprimer un achat ; clavier seul sur les dialogues.
- [ ] **Step 3:** Lancer une vraie fournée « Trouver des idées » : vérifier le compte-rendu, les liens sources, les tickers, la cohérence des cours de départ.
- [ ] **Step 4:** Binance : demander à l'utilisateur sa clé en lecture seule (ou le laisser la saisir lui-même dans l'écran) ; vérifier la synchro face à son solde Binance (environ 2 700 €) et le coût de revient (3 000 €).
- [ ] **Step 5:** Corriger chaque défaut visuel ou fonctionnel trouvé, avec un test quand c'est un défaut de logique.
- [ ] **Step 6:** README : paragraphe « Investir » (Trade Republic manuel, clé Binance en lecture seule, idées par Claude avec recherche web).
- [ ] **Step 7:** `npm test && npm run typecheck && npm run lint && npm run build` au vert, puis commit `docs: README de l'écran Investir` et commits `fix(...)` des corrections.
