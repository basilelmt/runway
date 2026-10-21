import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { monthReview } from '@core/review';
import type { IdeasView, PortfolioView } from '@shared/api-types';
import { ideasTotal } from '@shared/invest';
import { monthKey, type ISODate } from '@shared/dates';
import { schema } from '../db/client';
import { listReviews } from '../repos/reviews';
import { loadState } from '../services/state';
import { runReadOnlyQuery } from './query';

const error = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });
const DATA_UNAVAILABLE = 'Données d’investissement indisponibles';

/** Fonction qui appelle l'API HTTP de Runway (le serveur qui a lancé ce process) et renvoie le JSON, ou lève si le statut n'est pas ok. */
export type ApiFetch = (path: string) => Promise<unknown>;

/** Date du premier mouvement d'achat d'une position, triée par date ; null sans achat connu. */
function firstBuyDate(trades: PortfolioView['holdings'][number]['trades']): string | null {
  const buys = trades.filter((t) => t.side === 'buy').map((t) => t.date);
  return buys.length ? buys.reduce((min, d) => (d < min ? d : min)) : null;
}

/**
 * Serveur MCP de Runway : une requête SQL en lecture seule, les chiffres du Bilan d'un mois, et les chiffres
 * d'Investir (portefeuille, idées) lus depuis l'API du serveur qui a lancé ce process (ce process tourne à part,
 * base en lecture seule, il ne peut pas rafraîchir les cours lui-même).
 */
export function createRunwayMcpServer(conn: Database.Database, today: ISODate, { api }: { api: ApiFetch | null } = { api: null }): McpServer {
  const db = drizzle(conn, { schema });
  const server = new McpServer({ name: 'runway', version: '1.0.0' });
  server.registerTool(
    'query',
    {
      description: 'Exécute une requête SQL de lecture (SELECT ou WITH) sur la base SQLite de Runway. Renvoie au plus 200 lignes en JSON.',
      inputSchema: { sql: z.string().describe('Une seule instruction SELECT ou WITH') },
    },
    async ({ sql }) => {
      try {
        return { content: [{ type: 'text', text: JSON.stringify(runReadOnlyQuery(conn, sql)) }] };
      } catch (err) {
        return error(`Erreur SQL : ${(err as Error).message}`);
      }
    },
  );
  server.registerTool(
    'month_summary',
    {
      description:
        "Chiffres du Bilan d'un mois, calculés comme dans l'app : revenus (income), dépensé remboursements déduits (spent), mis de côté (saved), puis par enveloppe hors épargne le budget, le dépensé et l'écart (gap positif = dépassement). Montants en centimes.",
      inputSchema: { month: z.string().describe('Mois au format YYYY-MM, au plus le mois en cours') },
    },
    async ({ month }) => {
      if (!/^\d{4}-\d{2}$/.test(month) || month > monthKey(today)) return error('Mois invalide : YYYY-MM, au plus le mois en cours');
      const state = loadState(db, today);
      const review = monthReview({ ...state, reviews: listReviews(db) }, state.rules, month, today);
      const envelopes = review.envelopes.map(({ envelopeId, name, budget, spent, gap }) => ({ envelopeId, name, budget, spent, gap }));
      return { content: [{ type: 'text', text: JSON.stringify({ month, figures: review.figures, envelopes }) }] };
    },
  );
  server.registerTool(
    'portfolio',
    {
      description:
        "Portefeuille d'Investir : les mêmes chiffres que l'écran (positions réelles, pas les idées). Montants en centimes ; gainPct et dayChangePct sont des fractions (0,05 = +5 %), null sans cours. totals donne value (valeur actuelle), invested (coût de revient encore détenu), gain, gainPct et realized (plus-values déjà encaissées) sur tout le portefeuille. stale est vrai si un cours affiché n'a pas pu être rafraîchi. Chaque position donne platform, ticker, name, source ('manual' ou 'binance'), quantity, costBasis (PMP de la quantité détenue), value, gain, gainPct, dayChangePct, realized, unpricedQuantity et missingQuantity (écarts entre les mouvements connus et le solde synchronisé, null sinon), firstBuy (date du premier achat, null sinon) et tradeCount (nombre de mouvements). Pour une valeur, un gain ou une performance d'Investir, appelle cet outil plutôt que de recalculer en SQL.",
      inputSchema: {},
    },
    async () => {
      if (!api) return error(DATA_UNAVAILABLE);
      try {
        const data = (await api('/api/invest/portfolio?range=1m')) as PortfolioView;
        const holdings = data.holdings.map((h) => ({
          id: h.id,
          platform: h.platform,
          ticker: h.ticker,
          name: h.name,
          source: h.source,
          quantity: h.quantity,
          costBasis: h.costBasis,
          value: h.value,
          gain: h.gain,
          gainPct: h.gainPct,
          dayChangePct: h.dayChangePct,
          realized: h.realized,
          unpricedQuantity: h.unpricedQuantity,
          missingQuantity: h.missingQuantity,
          firstBuy: firstBuyDate(h.trades),
          tradeCount: h.trades.length,
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ today: data.today, totals: data.totals, stale: data.stale, holdings }) }] };
      } catch (err) {
        return error(`Portefeuille indisponible : ${(err as Error).message}`);
      }
    },
  );
  server.registerTool(
    'ideas',
    {
      description:
        "Idées d'investissement d'Investir : des pistes suivies en théorique, pas des positions (aucun argent n'est réellement investi). return et benchReturn sont des fractions (0,05 = +5 %) depuis la date de l'idée, null sans cours ; priceDate donne la date du cours utilisé. open liste les idées en cours, closed les idées closes ; chacune donne id, createdOn, title, ticker, assetName, whereToBuy, horizon, status, return, benchReturn, priceDate, risk. summary ne porte que sur les idées closes (historique) : closedCount, beatCount (ont battu le S&P 500), avgExcess (écart moyen idée - référence), hundredEach (100 € sur chacune des idées closes) et filter (retenues contre écartées par le critique). openAverage est la phrase affichée dans l'app « En moyenne, les N idées en cours font X %, contre Y % pour le S&P 500 » : count idées ouvertes cotées, ideas et bench la moyenne simple de leurs return et benchReturn, comme si 100 € avaient été mis sur chacune, sans aucun montant réellement investi ; null sans idée cotée. Pour une performance ou une comparaison des idées, appelle cet outil plutôt que de recalculer en SQL.",
      inputSchema: {},
    },
    async () => {
      if (!api) return error(DATA_UNAVAILABLE);
      try {
        const data = (await api('/api/invest/ideas')) as IdeasView;
        const pick = (i: IdeasView['open'][number]) => ({
          id: i.id,
          createdOn: i.createdOn,
          title: i.title,
          ticker: i.ticker,
          assetName: i.assetName,
          whereToBuy: i.whereToBuy,
          horizon: i.horizon,
          status: i.status,
          return: i.return,
          benchReturn: i.benchReturn,
          priceDate: i.priceDate,
          risk: i.risk,
        });
        return { content: [{ type: 'text', text: JSON.stringify({ open: data.open.map(pick), openAverage: ideasTotal(data.open), closed: data.closed.map(pick), summary: data.summary }) }] };
      } catch (err) {
        return error(`Idées indisponibles : ${(err as Error).message}`);
      }
    },
  );
  return server;
}
