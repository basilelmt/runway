import { daysBetween, type ISODate } from '@shared/dates';
import type { Transaction } from '@shared/schemas';

export type ImportedRow = { index: number; date: ISODate; signedAmount: number };

/** Montant signé d'une opération prévue, vu depuis le compte importé (`accountId`). */
function plannedSignedAmount(t: Transaction): number {
  switch (t.kind) {
    case 'expense':
    case 'transfer':
      return -t.amount;
    case 'income':
      return t.amount;
    case 'allocation':
      return 0;
  }
}

/**
 * Associe des lignes importées à des opérations prévues du même compte :
 * même montant signé, date à ±tolerance jours, la plus proche gagne, chaque prévue au plus une fois.
 * Renvoie `index de ligne -> id de prévue`.
 */
export function matchPlanned(rows: ImportedRow[], planned: Transaction[], toleranceDays = 5): Map<number, number> {
  const candidates: { index: number; plannedId: number; distance: number }[] = [];
  for (const row of rows) {
    for (const p of planned) {
      if (p.status !== 'planned' || plannedSignedAmount(p) !== row.signedAmount) continue;
      const distance = Math.abs(daysBetween(p.date, row.date));
      if (distance <= toleranceDays) candidates.push({ index: row.index, plannedId: p.id, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.index - b.index);

  const result = new Map<number, number>();
  const used = new Set<number>();
  for (const c of candidates) {
    if (result.has(c.index) || used.has(c.plannedId)) continue;
    result.set(c.index, c.plannedId);
    used.add(c.plannedId);
  }
  return result;
}
