import type { Overview } from '@shared/api-types';

/** Le budget réclame une action : de l'argent attend d'être réparti dans des enveloppes qui en manquent, trop a été réparti, ou les enveloppes prévoient plus que le revenu. */
export function budgetNeedsAttention(overview: Pick<Overview, 'toAllocate' | 'month'>): boolean {
  return overview.toAllocate < 0 || (overview.toAllocate > 0 && overview.month.toFund > 0) || budgetOverIncome(overview.month) > 0;
}

/** Ce que les budgets mensuels des enveloppes prévoient au-delà du revenu attendu ; 0 sans revenu récurrent connu. */
export function budgetOverIncome(month: Pick<Overview['month'], 'income' | 'planned'>): number {
  return month.income > 0 ? Math.max(0, month.planned - month.income) : 0;
}

/** Part du mois écoulée à `today` (1 le dernier jour). */
export function monthProgress(today: string, monthEnd: string): number {
  const day = Number(today.slice(8, 10));
  const days = Number(monthEnd.slice(8, 10));
  return day / days;
}
