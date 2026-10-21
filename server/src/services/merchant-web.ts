import { MERCHANT_DESCRIPTION_MAX, merchantWebResultSchema } from '@shared/schemas';
import type { ClaudeTaskView, MerchantDetail } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { merchants } from '../db/schema';
import { ConflictError } from '../errors';
import { getMerchant, sampleLabels } from '../repos/merchants';
import { getSettings } from '../repos/settings';
import { ClaudeError, execClaude, runClaude, type Exec } from './claude';
import type { ClaudeTasks } from './claude-tasks';

export const MERCHANT_WEB_TIMEOUT_MS = 120_000;
const WEB_TOOLS = 'WebSearch,WebFetch';

const outputJsonSchema = { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] };

/**
 * Le prompt ne porte que la clé, des libellés bruts et, si l'utilisateur l'a donnée dans les réglages,
 * sa région : jamais de montant, de date ni de compte.
 */
export function buildMerchantWebPrompt(key: string, labels: string[], homeArea = ''): string {
  // Sans région, un petit commerce au nom courant (« Le Kairn ») peut être confondu avec un homonyme à l'autre bout du pays.
  const area = homeArea
    ? `
L’utilisateur vit en ${homeArea} : quand plusieurs commerces portent ce nom, préfère celui de cette région, et tu peux l’ajouter à ta recherche.
`
    : '';
  return `Tu identifies un marchand vu sur un relevé bancaire français, en cherchant sur le web.

Clé du marchand : ${JSON.stringify(key)}
Libellés bruts : ${labels.map((l) => JSON.stringify(l)).join(', ')}
${area}
Consignes :
- Cherche avec WebSearch le nom du marchand tiré de la clé ou du libellé (avec la région ci-dessus s'il y en a une), rien d'autre.
- Réponds par une phrase courte qui dit ce qu'est ce marchand : son type et, pour un commerce local, sa ville ou son quartier. Exemple : « Boutique de vêtements de seconde main, Paris (11e) ».
- ${MERCHANT_DESCRIPTION_MAX} caractères au plus, sans URL.
- Si rien de fiable ne correspond, laisse "description" vide : ne jamais deviner.
- Réponds uniquement avec le JSON demandé.`;
}

/** Décrit un marchand d'après le web. Le contrôle 409 (déjà décrit à la main) est fait par l'appelant. */
export function describeMerchantOnWeb(db: Db, key: string, today: ISODate, deps: { exec?: Exec } = {}): Promise<MerchantDetail> {
  return (async () => {
    const settings = getSettings(db);
    const model = settings.claudeModel || undefined;
    const args = ['-p', '--tools', WEB_TOOLS, '--allowedTools', WEB_TOOLS, '--output-format', 'json', '--json-schema', JSON.stringify(outputJsonSchema)];
    if (model) args.push('--model', model);
    args.push(buildMerchantWebPrompt(key, sampleLabels(db, key, 3), settings.homeArea));
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
  })();
}

/** Lance la recherche web en fond et renvoie sa tâche ; une recherche en cours pour la même clé est réutilisée. */
export function startMerchantWebSearch(db: Db, key: string, today: ISODate, tasks: ClaudeTasks, deps: { exec?: Exec } = {}): ClaudeTaskView {
  const running = tasks.find('merchant_web', key);
  if (running) return running;
  const merchant = getMerchant(db, key, today);
  if (merchant.descriptionSource === 'user') throw new ConflictError('Ce marchand a déjà une description donnée à la main');
  const id = tasks.start('merchant_web', `Claude cherche ${merchant.name} sur le web`, key, merchant.name);
  describeMerchantOnWeb(db, key, today, deps).then(
    (m) => tasks.finish(id, m.description ?? 'Rien trouvé sur le web'),
    (e: unknown) => tasks.fail(id, e instanceof Error ? e.message : String(e)),
  );
  return tasks.find('merchant_web', key)!;
}
