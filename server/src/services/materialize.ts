import { occurrenceKey, settledEarly } from '@core/matching';
import { expandRule } from '@core/recurrence';
import { addDays, type ISODate } from '@shared/dates';
import type { Transaction } from '@shared/schemas';
import type { Db } from '../db/client';
import { listRules, setLastGenerated } from '../repos/recurring-rules';
import { allTransactions, createTransaction, existsForRuleAndDate, updateTransaction } from '../repos/transactions';

/**
 * Crée en base les occurrences dues (jusqu'à `today` inclus) de chaque règle active.
 * Elles sont "prévues" en attendant le relevé qui les confirme.
 * Une occurrence déjà payée en avance (voir `settledEarly`) n'est pas recréée : l'opération réelle est rattachée à la règle.
 * Idempotent : une règle n'est rejouée qu'après `lastGeneratedDate`.
 */
export function materializeDue(db: Db, today: ISODate): number {
  let created = 0;
  // Chargées seulement si une occurrence est due, pour reconnaître celles déjà payées en avance.
  let transactions: Transaction[] | undefined;
  db.transaction((tx) => {
    for (const rule of listRules(tx as unknown as Db)) {
      if (!rule.active) continue;
      const from = rule.lastGeneratedDate ? addDays(rule.lastGeneratedDate, 1) : rule.startDate;
      if (from > today) continue;
      const dates = expandRule(rule, from, today);
      if (dates.length > 0) transactions ??= allTransactions(tx as unknown as Db);
      const settled = settledEarly(dates.map((date) => ({ rule, date })), transactions ?? []);
      for (const date of dates) {
        if (existsForRuleAndDate(tx as unknown as Db, rule.id, date)) continue;
        const paidId = settled.get(occurrenceKey(rule.id, date));
        if (paidId !== undefined) {
          updateTransaction(tx as unknown as Db, paidId, { recurringRuleId: rule.id });
          transactions = transactions!.map((t) => (t.id === paidId ? { ...t, recurringRuleId: rule.id } : t));
          continue;
        }
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
