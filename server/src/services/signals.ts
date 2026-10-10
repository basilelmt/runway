import { detectConsentExpiring, detectNewRecurring, detectPriceChanges, detectSyncErrors, detectUnusualExpenses, type DetectedSignal } from '@core/signals';
import type { ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { listConnections } from '../repos/bank';
import { listRules } from '../repos/recurring-rules';
import { insertSignal, listAllSignals, reactivateSignal, resolveSignal } from '../repos/signals';
import { allTransactions } from '../repos/transactions';

/**
 * Relance la détection de tous les types de signaux et met la table à jour : les signaux dont la clé est
 * nouvelle sont créés, ceux dont la condition ne tient plus sont résolus, les résolus dont la condition revient
 * (charge mise en pause ou supprimée) repassent actifs. Seul un signal écarté ne revient jamais.
 * Idempotent : deux passages sans changement de données produisent le même résultat.
 */
export function detectSignals(db: Db, today: ISODate, now: Date = new Date()): void {
  const transactions = allTransactions(db);
  const rules = listRules(db);
  const connections = listConnections(db);

  const detected: DetectedSignal[] = [
    ...detectUnusualExpenses(transactions, rules, today),
    ...detectNewRecurring(transactions, rules, today),
    ...detectPriceChanges(transactions, rules, today),
    ...detectConsentExpiring(connections, today),
    ...detectSyncErrors(connections, now),
  ];

  const existing = listAllSignals(db);
  const byKey = new Map(existing.map((row) => [row.key, row]));
  const activeKeys = new Set(detected.map((d) => d.key));
  const nowIso = now.toISOString();

  db.transaction((tx) => {
    const t = tx as unknown as Db;
    for (const d of detected) {
      const row = byKey.get(d.key);
      if (!row) insertSignal(t, { kind: d.kind, key: d.key, payload: d.payload, createdAt: nowIso });
      else if (row.dismissedAt === null && row.resolvedAt !== null) reactivateSignal(t, row.id, d.payload);
    }
    for (const row of existing) {
      if (row.dismissedAt === null && row.resolvedAt === null && !activeKeys.has(row.key)) resolveSignal(t, row.id, nowIso);
    }
  });
}
