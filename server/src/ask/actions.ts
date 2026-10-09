import { inArray } from 'drizzle-orm';
import type { AskActionView, BudgetedEnvelope } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { askActionSchema, type Account, type AskAction } from '@shared/schemas';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import { listAccounts } from '../repos/accounts';
import { listBudgetedEnvelopes } from '../services/state';

/**
 * Valide les actions proposées par Claude et les enrichit pour l'affichage ; les invalides sont écartées
 * silencieusement. `reasons` liste les motifs des refus destinés à l'utilisateur (ex. budget sous les
 * charges fixes) : c'est à l'appelant (`runAsk`) de les transmettre, dans `notices` de la réponse.
 */
export function validateActions(db: Db, raw: unknown[], today: ISODate): { actions: AskActionView[]; reasons: string[] } {
  const envelopes = new Map(listBudgetedEnvelopes(db, today).map((e) => [e.id, e]));
  const accounts = new Map(listAccounts(db).map((a) => [a.id, a]));
  const actions: AskActionView[] = [];
  const reasons: string[] = [];
  for (const item of raw) {
    const parsed = askActionSchema.safeParse(item);
    const view = parsed.success ? enrich(db, parsed.data, envelopes, accounts) : null;
    if (typeof view === 'string') reasons.push(view);
    else if (view) actions.push(view);
  }
  return { actions, reasons };
}

/** Vue enrichie de l'action, raison d'un refus à expliquer, ou null pour une action simplement invalide. */
function enrich(db: Db, action: AskAction, envelopes: Map<number, BudgetedEnvelope>, accounts: Map<number, Account>): AskActionView | string | null {
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
      return { type: 'move', fromEnvelopeId: from?.id ?? null, fromName: from?.name ?? 'Pas encore réparti', toEnvelopeId: to.id, toName: to.name, amount: action.amount };
    }
    case 'budget': {
      const env = envelopes.get(action.envelopeId);
      if (!env) return null;
      const target = action.monthlyTarget;
      if (target !== null && target < env.monthlyCharges) {
        return `Le budget de ${env.name} ne peut pas descendre sous ses charges fixes (${formatEuros(env.monthlyCharges)})`;
      }
      // Claude parle en budget total ; l'enveloppe ne stocke que ce qui s'ajoute aux charges.
      const extra = target === null ? 0 : target - env.monthlyCharges;
      return {
        type: 'budget',
        envelopeId: env.id,
        envelopeName: env.name,
        monthlyTarget: target,
        monthlyExtra: extra > 0 ? extra : null,
        charges: env.monthlyCharges,
        current: env.monthlyBudget,
      };
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
