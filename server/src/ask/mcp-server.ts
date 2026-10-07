import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRunwayMcpServer } from './mcp';
import { openReadOnly } from './query';

// Lancé par `claude` depuis Demander (voir ask.ts) : la base est ouverte en lecture seule, Claude ne peut rien écrire.
const path = process.env.RUNWAY_DB;
if (!path) throw new Error('RUNWAY_DB manquant');
await createRunwayMcpServer(openReadOnly(path)).connect(new StdioServerTransport());
