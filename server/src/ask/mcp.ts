import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { monthReview } from '@core/review';
import { monthKey, type ISODate } from '@shared/dates';
import { schema } from '../db/client';
import { listReviews } from '../repos/reviews';
import { loadState } from '../services/state';
import { runReadOnlyQuery } from './query';

const error = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

/** Serveur MCP de Runway : une requête SQL en lecture seule, et les chiffres du Bilan d'un mois jusqu'à celui de `today`. */
export function createRunwayMcpServer(conn: Database.Database, today: ISODate): McpServer {
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
  return server;
}
