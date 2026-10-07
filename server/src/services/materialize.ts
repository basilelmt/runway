import { expandRule } from '@core/recurrence';
import { addDays, type ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { listRules, setLastGenerated } from '../repos/recurring-rules';
import { createTransaction, existsForRuleAndDate } from '../repos/transactions';

/**
 * Crée en base les occurrences dues (jusqu'à `today` inclus) de chaque règle active.
 * Elles sont "prévues" en attendant le relevé qui les confirme.
 * Idempotent : une règle n'est rejouée qu'après `lastGeneratedDate`.
 */
export function materializeDue(db: Db, today: ISODate): number {
  let created = 0;
  db.transaction((tx) => {
    for (const rule of listRules(tx as unknown as Db)) {
      if (!rule.active) continue;
      const from = rule.lastGeneratedDate ? addDays(rule.lastGeneratedDate, 1) : rule.startDate;
      if (from > today) continue;
      const dates = expandRule(rule, from, today);
      for (const date of dates) {
        if (existsForRuleAndDate(tx as unknown as Db, rule.id, date)) continue;
        createTransaction(tx as unknown as Db, {
          kind: rule.kind,
          date,
          amount: rule.amount,
          label: rule.label,
          accountId: rule.accountId,
          toAccountId: rule.toAccountId,
          envelopeId: rule.envelopeId,
          fromEnvelopeId: rule.fromEnvelopeId,
          status: 'planned',
          recurringRuleId: rule.id,
        });
        created++;
      }
      setLastGenerated(tx as unknown as Db, rule.id, today);
    }
  });
  return created;
}
