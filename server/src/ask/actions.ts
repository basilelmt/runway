import { inArray } from 'drizzle-orm';
import type { AskActionView } from '@shared/api-types';
import { askActionSchema, type Account, type AskAction, type Envelope } from '@shared/schemas';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import { listAccounts } from '../repos/accounts';
import { listEnvelopes } from '../repos/envelopes';

/** Valide les actions proposées par Claude et les enrichit pour l'affichage ; les invalides sont écartées. */
export function validateActions(db: Db, raw: unknown[]): { actions: AskActionView[]; rejected: number } {
  const envelopes = new Map(listEnvelopes(db).map((e) => [e.id, e]));
  const accounts = new Map(listAccounts(db).map((a) => [a.id, a]));
  const actions: AskActionView[] = [];
  for (const item of raw) {
    const parsed = askActionSchema.safeParse(item);
    const view = parsed.success ? enrich(db, parsed.data, envelopes, accounts) : null;
    if (view) actions.push(view);
  }
  return { actions, rejected: raw.length - actions.length };
}

function enrich(db: Db, action: AskAction, envelopes: Map<number, Envelope>, accounts: Map<number, Account>): AskActionView | null {
  switch (action.type) {
    case 'sort': {
      const env = envelopes.get(action.envelopeId);
      const ids = [...new Set(action.transactionIds)];
      const rows = db.select({ kind: transactions.kind, amount: transactions.amount }).from(transactions).where(inArray(transactions.id, ids)).all();
      if (!env || rows.length !== ids.length || rows.some((r) => r.kind !== 'expense')) return null;
      return { type: 'sort', transactionIds: ids, envelopeId: env.id, envelopeName: env.name, rulePattern: action.rulePattern, count: ids.length, total: rows.reduce((s, r) => s + r.amount, 0) };
    }
    case 'move': {
      const to = envelopes.get(action.toEnvelopeId);
      const from = action.fromEnvelopeId === null ? null : envelopes.get(action.fromEnvelopeId);
      if (!to || from === undefined || from?.id === to.id) return null;
      return { type: 'move', fromEnvelopeId: from?.id ?? null, fromName: from?.name ?? 'À répartir', toEnvelopeId: to.id, toName: to.name, amount: action.amount };
    }
    case 'budget': {
      const env = envelopes.get(action.envelopeId);
      if (!env) return null;
      return { type: 'budget', envelopeId: env.id, envelopeName: env.name, monthlyTarget: action.monthlyTarget, current: env.monthlyTarget };
    }
    case 'recurring': {
      const { rule } = action;
      const account = rule.accountId == null ? undefined : accounts.get(rule.accountId);
      if (!account) return null;
      if (rule.envelopeId != null && !envelopes.has(rule.envelopeId)) return null;
      if (rule.toAccountId != null && !accounts.has(rule.toAccountId)) return null;
      return { type: 'recurring', rule, accountName: account.name };
    }
  }
}
