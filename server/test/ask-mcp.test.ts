import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createRunwayMcpServer } from '../src/ask/mcp';

async function connect() {
  const db = new Database(':memory:');
  db.exec('create table t (a integer); insert into t values (1), (2), (3);');
  db.pragma('query_only = ON');
  const server = createRunwayMcpServer(db);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return client;
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

describe('serveur MCP runway', () => {
  it('expose query et renvoie les lignes en JSON', async () => {
    const client = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(['query']);
    const res = (await client.callTool({ name: 'query', arguments: { sql: 'select sum(a) as total from t' } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0]!.text)).toEqual({ rows: [{ total: 6 }], truncated: false });
  });

  it('renvoie les erreurs SQL comme résultat d’outil', async () => {
    const client = await connect();
    const res = (await client.callTool({ name: 'query', arguments: { sql: 'delete from t' } })) as ToolResult;
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/^Erreur SQL/);
  });
});
