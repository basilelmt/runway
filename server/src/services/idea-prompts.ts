import type { ISODate } from '@shared/dates';
import { IDEA_ANGLES, platforms, type IdeaAngle } from '@shared/invest';
import type { IdeaCandidate } from '@shared/schemas';

/** Variations de cours en fraction, null si l'historique ne remonte pas assez loin. */
export type MarketFacts = { perf1m: number | null; perf3m: number | null };

const ANGLE_FOCUS: Record<IdeaAngle, string> = {
  calendar:
    'Cherche les événements datés des semaines et mois à venir : sorties de produits, décisions réglementaires, salons, compétitions sportives, fêtes, saisons, publications de résultats, échéances politiques.',
  international:
    "Lis la presse étrangère hors anglophone dans sa langue (japonaise, coréenne, chinoise, taïwanaise, indienne, allemande, italienne, espagnole, nordique...) et cherche les sujets que la presse financière américaine n'a pas encore repris.",
  primary:
    "Va aux sources primaires plutôt qu'à la presse : communiqués d'entreprises, régulateurs (FDA, EMA, Commission européenne, autorités de la concurrence), appels d'offres publics, brevets, publications officielles et statistiques.",
  supply:
    "Suis les pénuries, les matières premières, la météo, la logistique et l'énergie, et remonte les chaînes d'approvisionnement jusqu'aux effets de second ordre : le fournisseur du fournisseur, le seul fabricant d'un composant critique.",
};

/** Schémas imposés à Claude, écrits à la main comme celui du tri (`--json-schema` refuse les schémas zod). */
export const researchJsonSchema = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          event: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          reasoning: { type: 'array', items: { type: 'string' } },
          ticker: { type: 'string' },
          assetName: { type: 'string' },
          whereToBuy: { type: 'string', enum: [...platforms] },
          horizon: { type: 'string' },
        },
        required: ['title', 'event', 'sources', 'reasoning', 'ticker', 'assetName', 'whereToBuy', 'horizon'],
      },
    },
  },
  required: ['ideas'],
};

export const reviewJsonSchema = {
  type: 'object',
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          verdict: { type: 'string', enum: ['kept', 'dropped'] },
          reason: { type: 'string' },
          pricedIn: { type: 'string' },
          risk: { type: 'string' },
        },
        required: ['ticker', 'verdict', 'reason', 'pricedIn', 'risk'],
      },
    },
  },
  required: ['reviews'],
};

export function buildResearchPrompt(input: {
  today: ISODate;
  angle: IdeaAngle;
  holdings: { name: string; ticker: string }[];
  recent: { title: string; ticker: string; dropped: boolean }[];
}): string {
  const label = IDEA_ANGLES.find((a) => a.key === input.angle)!.label;
  const holdings = input.holdings.length ? input.holdings.map((h) => `- ${h.name} (${h.ticker})`).join('\n') : '(aucune)';
  const recent = input.recent.length ? input.recent.map((i) => `- ${i.title} (${i.ticker})${i.dropped ? ', écartée' : ''}`).join('\n') : '(aucune)';
  return `Nous sommes le ${input.today}. Tu es l'un des ${IDEA_ANGLES.length} chercheurs qui aident un particulier français à trouver des idées d'investissement tirées de l'actualité.
Ton angle : ${label}. ${ANGLE_FOCUS[input.angle]}

Positions déjà détenues :
${holdings}

Idées déjà étudiées ces 4 dernières semaines :
${recent}

Consignes :
- Cherche sur le web (WebSearch) et lis les pages en entier (WebFetch) avant de t'appuyer dessus. Ne cite que des pages que tu as réellement lues.
- Propose 2 à 4 pistes. Ne te censure pas : un critique indépendant les passera ensuite au crible, ton travail est de trouver de la matière.
- Chaque piste part d'un événement précis. Mets dans "sources" les URL de toutes les pages lues qui l'appuient (au moins une).
- Cherche le bénéficiaire le moins évident : le fournisseur, le sous-traitant, le concurrent qui en profite, plutôt que le nom auquel tout le monde pense déjà.
- La déduction tient en 2 ou 3 étapes simples dans "reasoning", du type : "La fête des nouilles approche" → "Les gens vont acheter des baguettes" → "Le fabricant de baguettes va vendre plus".
- Vise un actif coté précis et donne son ticker Yahoo Finance exact, avec le suffixe de place : .PA (Paris), .DE (Xetra), .AS (Amsterdam), .L (Londres), .T (Tokyo), .KS (Séoul), rien pour les actions américaines, -EUR pour une crypto (BTC-EUR), =F pour un contrat à terme (GC=F).
- "horizon" : la date (YYYY-MM-DD) à laquelle juger l'idée, entre 7 jours et 1 an après aujourd'hui.
- "whereToBuy" : "trade_republic" pour les actions et ETF européens et américains, "binance" pour les cryptos, sinon "other".
- "title" : une phrase courte qui résume l'idée.
- Ne repropose ni un actif déjà détenu ni une idée déjà étudiée, sauf si un événement nouveau change la donne.
- Réponds uniquement avec le JSON demandé.`;
}

/** Variation en texte pour le critique : « +12,3 % », ou « inconnue ». */
export function pctText(n: number | null): string {
  if (n === null) return 'inconnue';
  const v = (Math.round(n * 1000) / 10).toFixed(1).replace('.', ',');
  return `${n > 0 ? '+' : ''}${v} %`;
}

const factsLine = (m: MarketFacts) => `${pctText(m.perf1m)} sur 1 mois, ${pctText(m.perf3m)} sur 3 mois.`;

export function buildReviewPrompt(input: {
  today: ISODate;
  bench: MarketFacts;
  candidates: (Pick<IdeaCandidate, 'ticker' | 'assetName' | 'title' | 'event' | 'sources' | 'reasoning' | 'horizon'> & { market: MarketFacts })[];
}): string {
  const pistes = input.candidates
    .map(
      (c) => `### ${c.ticker} - ${c.assetName}
Titre : ${c.title}
Événement : ${c.event}
Sources :
${c.sources.map((s) => `- ${s}`).join('\n')}
Déduction :
${c.reasoning.map((s, i) => `${i + 1}. ${s}`).join('\n')}
Horizon : ${c.horizon}
Cours : ${factsLine(c.market)}`,
    )
    .join('\n\n');
  return `Nous sommes le ${input.today}. Tu es le critique. Des chercheurs ont proposé des pistes d'investissement tirées de l'actualité à un particulier français. Ton rôle est de le protéger des mauvaises idées, pas de lui en trouver de bonnes.

Référence, S&P 500 : ${factsLine(input.bench)}

Pistes :

${pistes}

Consignes :
- Pour chaque piste, cherche activement pourquoi elle est mauvaise : information déjà largement reprise par la presse financière, cours qui a déjà bougé, effet trop petit par rapport à la taille de l'entreprise, déduction fragile, source douteuse ou mal lue.
- Vérifie les sources toi-même (WebFetch) et cherche si l'information circule déjà largement (WebSearch).
- "verdict" : "kept" seulement s'il y a une vraie raison de penser que le marché n'a pas encore intégré l'événement et que l'effet sur l'actif peut être sensible d'ici l'horizon. Sinon "dropped". Dans le doute, "dropped".
- Ne retenir aucune piste est une réponse normale et fréquente.
- "reason" : la raison principale du verdict, en une phrase.
- "pricedIn" : le marché a-t-il déjà intégré l'événement dans le cours ? Une ou deux phrases, en t'appuyant sur les variations de cours ci-dessus.
- "risk" : ce qui peut le plus probablement faire perdre de l'argent sur cette piste, en une phrase.
- Rends un verdict pour chaque piste, avec son ticker exact.
- Réponds uniquement avec le JSON demandé.`;
}
