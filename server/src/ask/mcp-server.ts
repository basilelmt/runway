import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ISODate } from '@shared/dates';
import type { ApiFetch } from './mcp';
import { createRunwayMcpServer } from './mcp';
import { openReadOnly } from './query';

// Lancé par `claude` depuis Demander (voir ask.ts) : la base est ouverte en lecture seule, Claude ne peut rien écrire.
// La date du jour vient du serveur, pour suivre une date simulée en recette.
const path = process.env.RUNWAY_DB;
const today = process.env.RUNWAY_TODAY;
if (!path) throw new Error('RUNWAY_DB manquant');
if (!today) throw new Error('RUNWAY_TODAY manquant');

// Ce process ne peut pas rafraîchir les cours (base en lecture seule) : portfolio et ideas passent par l'API du
// serveur qui l'a lancé. Sans RUNWAY_API (tests, ou serveur lancé sans selfUrl), les deux outils répondent une erreur.
const apiUrl = process.env.RUNWAY_API ?? '';
const api: ApiFetch | null = apiUrl
  ? async (apiPath) => {
      const res = await fetch(`${apiUrl}${apiPath}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    }
  : null;

await createRunwayMcpServer(openReadOnly(path), today as ISODate, { api }).connect(new StdioServerTransport());
