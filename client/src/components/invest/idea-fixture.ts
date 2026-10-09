import type { IdeaView } from '@shared/api-types';

/** Idée ouverte, d'avant la critique (pas de risque ni de contexte de marché) : fixture partagée des tests. */
export const openIdea: IdeaView = {
  id: 1,
  createdOn: '2026-10-07',
  title: 'La fête des nouilles fait vendre des baguettes',
  event: 'La fête des nouilles a lieu le 20 octobre.',
  sources: ['https://www.exemple.fr/fete', 'https://news.exemple.jp/men'],
  risk: null,
  marketContext: null,
  reasoning: ['La fête des nouilles approche', 'Les gens vont acheter des baguettes', 'Le fabricant de baguettes va vendre plus'],
  pricedIn: 'En partie.',
  ticker: 'BAG.PA',
  assetName: 'Baguettes SA',
  whereToBuy: 'trade_republic',
  horizon: '2026-10-28',
  startPriceEur: 12,
  status: 'open',
  return: 0.083,
  benchReturn: 0.01,
  priceDate: '2026-10-10',
};
