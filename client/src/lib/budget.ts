import type { Overview, WatchedEnvelope } from '@shared/api-types';
import { formatEuros } from '@shared/money';

/** Le budget réclame une action : de l'argent attend d'être réparti dans des enveloppes qui en manquent, trop a été réparti, ou les enveloppes prévoient plus que le revenu. */
export function budgetNeedsAttention(overview: Pick<Overview, 'toAllocate' | 'month'>): boolean {
  return overview.toAllocate < 0 || (overview.toAllocate > 0 && overview.month.toFund > 0) || budgetOverIncome(overview.month) > 0;
}

/** Ce que les budgets mensuels des enveloppes prévoient au-delà du revenu attendu ; 0 sans revenu récurrent connu. */
export function budgetOverIncome(month: Pick<Overview['month'], 'income' | 'planned'>): number {
  return month.income > 0 ? Math.max(0, month.planned - month.income) : 0;
}


export type WatchTodo = { text: string; detail?: string; tone?: 'alert' };

/** Ligne « À faire » des enveloppes à surveiller, ou null s'il n'y en a aucune. */
export function watchTodo(watch: WatchedEnvelope[]): WatchTodo | null {
  const first = watch[0];
  if (!first) return null;
  if (watch.length > 1) {
    const todo: WatchTodo = { text: `${watch.length} enveloppes à surveiller`, detail: watch.map((w) => w.name).join(', ') };
    return watch.some((w) => w.kind === 'over') ? { ...todo, tone: 'alert' } : todo;
  }
  if (first.kind === 'over') return { text: `${first.name} dépassée de ${formatEuros(first.amount)}`, tone: 'alert' };
  return { text: first.amount === 0 ? `Plus rien de libre dans ${first.name}` : `Plus que ${formatEuros(first.amount)} dans ${first.name}` };
}
