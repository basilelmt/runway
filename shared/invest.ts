import type { IdeaView } from './api-types';

export const BENCHMARK_TICKER = 'SXR8.DE';
export const BENCHMARK_NAME = 'S&P 500';
export const platforms = ['trade_republic', 'binance', 'other'] as const;
export type Platform = (typeof platforms)[number];
export const PLATFORM_LABELS: Record<Platform, string> = { trade_republic: 'Trade Republic', binance: 'Binance', other: 'Ailleurs' };
/** Actifs Binance qui ne sont pas des investissements (liquidités). */
export const CASH_ASSETS = new Set(['EUR', 'USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD', 'USDP']);

/** Les quatre chercheurs d'une fournée d'idées, chacun avec son angle. */
export const IDEA_ANGLES = [
  { key: 'calendar', label: 'Calendrier' },
  { key: 'international', label: 'International' },
  { key: 'primary', label: 'Sources primaires' },
  { key: 'supply', label: 'Approvisionnement' },
] as const;
export type IdeaAngle = (typeof IDEA_ANGLES)[number]['key'];
export const ideaAngleKeys = IDEA_ANGLES.map((a) => a.key) as [IdeaAngle, ...IdeaAngle[]];

/** Gain moyen des idées (100 € sur chacune) et celui du S&P 500 sur les mêmes périodes ; null sans idée cotée. */
export function ideasTotal(ideas: IdeaView[]): { count: number; ideas: number; bench: number } | null {
  const priced = ideas.filter((i): i is IdeaView & { return: number; benchReturn: number } => i.return !== null && i.benchReturn !== null);
  if (priced.length === 0) return null;
  const avg = (pick: (i: (typeof priced)[number]) => number) => priced.reduce((s, i) => s + pick(i), 0) / priced.length;
  return { count: priced.length, ideas: avg((i) => i.return), bench: avg((i) => i.benchReturn) };
}
