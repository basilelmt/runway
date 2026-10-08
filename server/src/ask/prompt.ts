import type { ISODate } from '@shared/dates';
import { formatEuros } from '@shared/money';
import type { Account, Envelope } from '@shared/schemas';

/** Prompt système de Demander : rôle, schéma de la base et ses pièges, forme de la réponse. */
export function buildAskSystemPrompt({ today, envelopes, accounts }: { today: ISODate; envelopes: Envelope[]; accounts: Account[] }): string {
  const envList = envelopes
    .map((e) => `- ${e.id} : ${e.name}${e.monthlyTarget ? ` (budget ${formatEuros(e.monthlyTarget)} par mois)` : ''}${e.isSavings ? ' [épargne]' : ''}`)
    .join('\n');
  const accList = accounts.map((a) => `- ${a.id} : ${a.name}${a.onBudget ? '' : ' [hors budget]'}`).join('\n');
  return `Tu es l'assistant de Runway, l'application de budget personnel de l'utilisateur. Tu le tutoies, en français, avec des phrases courtes et concrètes. Nous sommes le ${today}.

Tu réponds à ses questions sur ses finances en interrogeant sa base SQLite avec l'outil query (lecture seule). Vérifie toujours les chiffres avec query avant de répondre ; n'invente jamais un montant. Si une requête échoue, corrige-la.

Schéma utile :
- transactions(id, kind, date 'YYYY-MM-DD', amount, label, note, account_id, to_account_id, envelope_id, from_envelope_id, status, recurring_rule_id)
  - amount est en centimes, toujours positif ; le sens vient de kind : 'expense' (dépense), 'income' (revenu), 'transfer' (virement du compte account_id vers to_account_id), 'allocation' (argent réparti vers envelope_id depuis from_envelope_id, ou depuis « À répartir » si NULL ; ce n'est pas une dépense).
  - status 'planned' = opération prévue pas encore passée : exclue des montants réels sauf question sur l'avenir.
  - Une dépense avec envelope_id NULL est « à ranger ».
- envelopes(id, name, monthly_target en centimes, sort_order, archived, is_savings) : les dépenses d'une enveloppe d'épargne sont de l'argent mis de côté, pas de la consommation.
- accounts(id, name, initial_balance, on_budget, archived) : solde = initial_balance + effets des opérations confirmées.
- recurring_rules(id, name, kind, amount, label, account_id, envelope_id, frequency 'daily'|'weekly'|'monthly'|'yearly', interval, day_of_month, start_date, end_date, active) : charges fixes et revenus récurrents.
- sorting_rules(id, pattern, envelope_id) : un libellé qui contient pattern va dans l'enveloppe.

Enveloppes actives :
${envList || '(aucune)'}

Comptes :
${accList || '(aucun)'}

Réponse :
- answer : 1 à 4 phrases, montants en euros au format français (1 234,56 €), sans Markdown.
- highlight : le chiffre principal tiré des données, en centimes, avec un libellé court ; null quand la réponse se résume à proposer une action (le montant d'une action proposée n'est jamais un highlight, il n'a pas encore eu lieu).
- chart : seulement si une série aide à comprendre (évolution, comparaison) ; donne une requête SQL agrégée (GROUP BY label, ORDER BY) qui renvoie exactement les colonnes label (texte, par exemple le mois 'YYYY-MM') et value (centimes), une ligne par point et 24 points au plus ; sinon null.
- actions : propose-en seulement si la question y invite ou si elle découle naturellement de ta réponse, 5 au plus :
  - sort : ranger des dépenses (transactionIds) dans une enveloppe (envelopeId), avec rulePattern (motif court et stable du libellé, sans date ni numéro) si une règle de tri aurait du sens, sinon null ;
  - move : déplacer amount (centimes) de fromEnvelopeId (null = « À répartir ») vers toEnvelopeId ;
  - budget : changer le budget mensuel d'une enveloppe (envelopeId, monthlyTarget en centimes, null pour le retirer) ;
  - recurring : créer une charge fixe (rule : name, kind 'expense'|'income'|'transfer', amount, label, accountId, envelopeId, toAccountId, fromEnvelopeId null, frequency, interval, dayOfMonth, startDate, endDate, active true).
  Rien n'est appliqué sans le clic de l'utilisateur : quand tu proposes une action, dis-le dans answer.`;
}

const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });

/**
 * Schéma de sortie imposé à Claude, écrit à la main comme celui du tri (`claude --json-schema` refuse les schémas
 * générés par zod). La réponse est revalidée avec `askAnswerSchema`, et chaque action avec `askActionSchema`.
 */
export const answerJsonSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    highlight: nullable({ type: 'object', properties: { label: { type: 'string' }, amount: { type: 'integer' } }, required: ['label', 'amount'] }),
    chart: nullable({ type: 'object', properties: { kind: { type: 'string', enum: ['bar', 'line'] }, title: { type: 'string' }, sql: { type: 'string' } }, required: ['kind', 'title', 'sql'] }),
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['sort', 'move', 'budget', 'recurring'] },
          transactionIds: { type: 'array', items: { type: 'integer' } },
          envelopeId: { type: 'integer' },
          rulePattern: nullable({ type: 'string' }),
          fromEnvelopeId: nullable({ type: 'integer' }),
          toEnvelopeId: { type: 'integer' },
          amount: { type: 'integer' },
          monthlyTarget: nullable({ type: 'integer' }),
          rule: { type: 'object' },
        },
        required: ['type'],
      },
    },
  },
  required: ['answer', 'highlight', 'chart', 'actions'],
};

/** Phrase courte affichée pendant qu'une requête tourne. */
export function stepText(sql: string): string {
  const s = sql.toLowerCase();
  if (/strftime|substr\(\s*date/.test(s)) return 'Je calcule mois par mois…';
  if (s.includes('recurring_rules')) return 'Je regarde tes charges fixes…';
  if (s.includes('transactions')) return 'Je consulte tes opérations…';
  if (s.includes('envelopes')) return 'Je regarde tes enveloppes…';
  if (s.includes('accounts')) return 'Je regarde tes comptes…';
  return 'Je vérifie dans tes données…';
}
