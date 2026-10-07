import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { runReadOnlyQuery } from './query';

/** Serveur MCP de Runway : un seul outil, une requête SQL en lecture seule. */
export function createRunwayMcpServer(db: Database.Database): McpServer {
  const server = new McpServer({ name: 'runway', version: '1.0.0' });
  server.registerTool(
    'query',
    {
      description: 'Exécute une requête SQL de lecture (SELECT ou WITH) sur la base SQLite de Runway. Renvoie au plus 200 lignes en JSON.',
      inputSchema: { sql: z.string().describe('Une seule instruction SELECT ou WITH') },
    },
    async ({ sql }) => {
      try {
        return { content: [{ type: 'text', text: JSON.stringify(runReadOnlyQuery(db, sql)) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Erreur SQL : ${(err as Error).message}` }], isError: true };
      }
    },
  );
  return server;
}
