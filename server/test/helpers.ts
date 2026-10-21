import type { Account, Envelope } from '@shared/schemas';
import { createApp } from '../src/app';
import type { Exec, StreamExec } from '../src/services/claude';
import { createClaudeTasks, type ClaudeTasks } from '../src/services/claude-tasks';
import type { PricesDeps } from '../src/services/prices';
import type { BankProvider } from '../src/bank/provider';
import { openDb, type Db } from '../src/db/client';
import { createAccount } from '../src/repos/accounts';
import { createEnvelope } from '../src/repos/envelopes';
import { createMerchantNamer, type MerchantNamer } from '../src/services/merchants';

export type TestContext = {
  db: Db;
  courant: Account;
  livret: Account;
  courses: Envelope;
  loisirs: Envelope;
};

/** Base mémoire avec un compte courant (1 000 €), un livret hors budget et deux enveloppes. */
export function createTestDb(): TestContext {
  const db = openDb(':memory:');
  const courant = createAccount(db, { name: 'Courant', initialBalance: 1000_00, onBudget: true });
  const livret = createAccount(db, { name: 'Livret', initialBalance: 0, onBudget: false });
  const courses = createEnvelope(db, { name: 'Courses', color: '#4f8a5b' });
  const loisirs = createEnvelope(db, { name: 'Loisirs', color: '#c2703d' });
  return { db, courant, livret, courses, loisirs };
}

/** Claude absent : aucun test ne lance le vrai binaire, même en tâche de fond. */
export const offlineExec: Exec = async () => ({ stdout: '', stderr: 'ENOENT', exitCode: 127 });

/** Nommeur de marchands silencieux, hors ligne par défaut, pour les applications de test. */
export function quietMerchantNamer(db: Db, exec: Exec = offlineExec, tasks?: ClaudeTasks): MerchantNamer {
  return createMerchantNamer(db, { exec, log: () => {}, tasks });
}

export type TestApp = TestContext & {
  app: ReturnType<typeof createApp>;
  today: string;
  setToday: (date: string) => void;
  merchantNamer: MerchantNamer;
  claudeTasks: ClaudeTasks;
  /** Requête JSON pratique : renvoie le statut et le corps décodé. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
};

export function createTestApp(initialToday = '2026-03-10', opts: { bankProvider?: BankProvider; investDeps?: PricesDeps & { onRunStarted?: (done: Promise<void>) => void }; exec?: Exec; askStream?: StreamExec; askSessionId?: () => string; merchantNamer?: MerchantNamer; claudeTasks?: ClaudeTasks; selfUrl?: string } = {}): TestApp {
  const ctx = createTestDb();
  let today = initialToday;
  const claudeTasks = opts.claudeTasks ?? createClaudeTasks();
  const merchantNamer = opts.merchantNamer ?? quietMerchantNamer(ctx.db, opts.exec ?? offlineExec, claudeTasks);
  const app = createApp({
    db: ctx.db,
    now: () => today,
    exec: opts.exec,
    askStream: opts.askStream,
    askSessionId: opts.askSessionId,
    merchantNamer,
    claudeTasks,
    selfUrl: opts.selfUrl,
    bankDeps: {
      provider: opts.bankProvider ? () => opts.bankProvider! : undefined,
      now: () => new Date(`${today}T10:00:00Z`),
    },
    // Jamais de réseau en test : Yahoo et Binance répondent 404 sauf faux `fetch` fourni.
    investDeps: opts.investDeps ?? { fetch: async () => new Response('{}', { status: 404 }) },
  });
  return {
    ...ctx,
    app,
    merchantNamer,
    claudeTasks,
    get today() {
      return today;
    },
    setToday: (d) => {
      today = d;
    },
    call: async (method, path, body) => {
      const res = await app.request(path, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
  };
}
