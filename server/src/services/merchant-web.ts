import { MERCHANT_DESCRIPTION_MAX, merchantWebResultSchema } from '@shared/schemas';
import type { MerchantDetail } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { merchants } from '../db/schema';
import { ConflictError } from '../errors';
import { getMerchant, sampleLabels } from '../repos/merchants';
import { getSettings } from '../repos/settings';
import { ClaudeError, execClaude, runClaude, type Exec } from './claude';

export const MERCHANT_WEB_TIMEOUT_MS = 120_000;

const outputJsonSchema = { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] };

/** Le prompt ne porte que la clé et des libellés bruts : jamais de montant, de date ni de compte. */
export function buildMerchantWebPrompt(key: string, labels: string[]): string {
  return `Tu identifies un marchand vu sur un relevé bancaire français, en cherchant sur le web.

Clé du marchand : ${JSON.stringify(key)}
Libellés bruts : ${labels.map((l) => JSON.stringify(l)).join(', ')}

Consignes :
- Cherche avec WebSearch le nom du marchand tiré de la clé ou du libellé, rien d'autre.
- Réponds par une phrase courte qui dit ce qu'est ce marchand : son type et, pour un commerce local, sa ville ou son quartier. Exemple : « Boutique de vêtements de seconde main, Paris (11e) ».
- ${MERCHANT_DESCRIPTION_MAX} caractères au plus, sans URL.
- Si rien de fiable ne correspond, laisse "description" vide : ne jamais deviner.
- Réponds uniquement avec le JSON demandé.`;
}

const inFlight = new Map<string, Promise<MerchantDetail>>();

/** Décrit un marchand d'après le web ; un appel en cours pour la même clé est partagé. */
export function describeMerchantOnWeb(db: Db, key: string, today: ISODate, deps: { exec?: Exec } = {}): Promise<MerchantDetail> {
  const current = inFlight.get(key);
  if (current) return current;
  const run = (async () => {
    const before = getMerchant(db, key, today);
    if (before.descriptionSource === 'user') throw new ConflictError('Ce marchand a déjà une description donnée à la main');
    const model = getSettings(db).claudeModel || undefined;
    const args = ['-p', '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch WebFetch', '--output-format', 'json', '--json-schema', JSON.stringify(outputJsonSchema)];
    if (model) args.push('--model', model);
    args.push(buildMerchantWebPrompt(key, sampleLabels(db, key, 3)));
    const parsed = merchantWebResultSchema.safeParse(await runClaude(args, MERCHANT_WEB_TIMEOUT_MS, deps.exec ?? execClaude));
    if (!parsed.success) throw new ClaudeError('Réponse de Claude invalide (format inattendu)', 'claude_invalid_output');
    const text = parsed.data.description.trim();
    const description = text.length > 0 && text.length <= MERCHANT_DESCRIPTION_MAX ? text : null;
    const now = new Date().toISOString();
    db.insert(merchants)
      .values({ key, description, descriptionSource: 'web', describedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: merchants.key, set: { description, descriptionSource: 'web', describedAt: now, updatedAt: now } })
      .run();
    return getMerchant(db, key, today);
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}
