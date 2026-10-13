import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ISODate } from '@shared/dates';
import { createRunwayMcpServer } from './mcp';
import { openReadOnly } from './query';

// Lancé par `claude` depuis Demander (voir ask.ts) : la base est ouverte en lecture seule, Claude ne peut rien écrire.
// La date du jour vient du serveur, pour suivre une date simulée en recette.
const path = process.env.RUNWAY_DB;
const today = process.env.RUNWAY_TODAY;
if (!path) throw new Error('RUNWAY_DB manquant');
if (!today) throw new Error('RUNWAY_TODAY manquant');
await createRunwayMcpServer(openReadOnly(path), today as ISODate).connect(new StdioServerTransport());
