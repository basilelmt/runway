import { Hono } from 'hono';
import type { SuggestResponse } from '@shared/api-types';
import { sortingApplySchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import type { Db } from '../db/client';
import { listEnvelopes } from '../repos/envelopes';
import { getSettings } from '../repos/settings';
import { createSortingRule, listSortingRules } from '../repos/sorting-rules';
import { listTransactions, updateTransaction } from '../repos/transactions';
import { runClaudeSort, type Exec } from '../services/claude';
import { validate } from '../validate';

export function sortingRoutes(deps: { exec?: Exec } = {}) {
  return new Hono<AppEnv>()
    .post('/suggest', async (c) => {
      const db = c.get('db');
      const envelopes = listEnvelopes(db);
      const unsorted = listTransactions(db, { unsorted: true, limit: 1000 });
      const examples = listTransactions(db, { kind: 'expense', limit: 300 })
        .filter((t) => t.envelopeId != null)
        .slice(0, 40)
        .map((t) => ({ label: t.label, envelopeId: t.envelopeId! }));
      const model = getSettings(db).claudeModel || undefined;

      const result = await runClaudeSort(
        {
          transactions: unsorted.map(({ id, date, label, amount }) => ({ id, date, label, amount })),
          envelopes: envelopes.map(({ id, name }) => ({ id, name })),
          rules: listSortingRules(db).map(({ pattern, envelopeId }) => ({ pattern, envelopeId })),
          examples,
          model,
        },
        deps,
      );

      const nameOf = new Map(envelopes.map((e) => [e.id, e.name]));
      const response: SuggestResponse = {
        suggestions: result.suggestions.map((s) => ({ ...s, envelopeName: s.envelopeId === null ? null : nameOf.get(s.envelopeId) ?? null })),
        rules: result.rules,
      };
      return c.json(response);
    })
    .post('/apply', validate('json', sortingApplySchema), (c) => {
      const db = c.get('db');
      const { assignments, rules } = c.req.valid('json');
      const applied = db.transaction((tx) => {
        const t = tx as unknown as Db;
        for (const a of assignments) updateTransaction(t, a.transactionId, { envelopeId: a.envelopeId });
        const created = rules.map((r) => createSortingRule(t, r));
        return { assigned: assignments.length, rulesCreated: created.length };
      });
      return c.json(applied);
    });
}
