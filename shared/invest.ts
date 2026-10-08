export const BENCHMARK_TICKER = 'SXR8.DE';
export const BENCHMARK_NAME = 'S&P 500 (iShares, en euros)';
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
