import { and, eq, inArray, isNull } from 'drizzle-orm';
import { MERCHANT_KINDS, merchantKeyFor } from '@core/merchants';
import type { MerchantStatus } from '@shared/api-types';
import { merchantNamesResultSchema } from '@shared/schemas';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import { toDbHolder, type DbHolder } from '../db/holder';
import { ensureMerchants, listKeysToProcess, listMerchantNames, merchantStats, sampleLabels, setClaudeResults } from '../repos/merchants';
import { getSettings } from '../repos/settings';
import { ClaudeError, execClaude, runClaude, type Exec } from './claude';

/**
 * Calcule la clé des dépenses et revenus qui n'en ont pas (opérations d'avant la migration 0010) et crée leurs marchands.
 * Idempotent : une fois fait, seules les opérations dont la clé calculée est nulle sont relues, sans rien écrire.
 */
export function backfillMerchantKeys(db: Db): number {
  const rows = db
    .select({ id: transactions.id, kind: transactions.kind, label: transactions.label })
    .from(transactions)
    .where(and(inArray(transactions.kind, [...MERCHANT_KINDS]), isNull(transactions.merchantKey)))
    .all();
  return db.transaction((tx) => {
    const keys = new Set<string>();
    let updated = 0;
    for (const row of rows) {
      const key = merchantKeyFor(row.kind, row.label);
      if (key === null) continue;
      tx.update(transactions).set({ merchantKey: key }).where(eq(transactions.id, row.id)).run();
      keys.add(key);
      updated++;
    }
    ensureMerchants(tx as unknown as Db, keys);
    return updated;
  });
}

export const MERCHANT_BATCH_SIZE = 150;
export const MERCHANT_EXAMPLES = 3;
export const MERCHANT_TIMEOUT_MS = 300_000;

/** Schéma de sortie imposé à Claude, écrit à la main comme celui du tri ; revalidé avec `merchantNamesResultSchema`. */
const merchantNamesJsonSchema = {
  type: 'object',
  properties: {
    names: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } },
        required: ['key', 'name', 'description'],
      },
    },
  },
  required: ['names'],
};

export type MerchantPromptInput = { merchants: { key: string; examples: string[] }[]; knownNames: string[] };

export function buildMerchantPrompt(input: MerchantPromptInput): string {
  const known = input.knownNames.length ? input.knownNames.map((n) => `- ${n}`).join('\n') : '(aucun)';
  const list = input.merchants.map((m) => `- clé ${JSON.stringify(m.key)} ; exemples : ${m.examples.map((e) => JSON.stringify(e)).join(', ')}`).join('\n');
  return `Tu donnes un nom lisible et une courte description aux marchands d'un relevé bancaire français.

Chaque marchand est identifié par une clé tirée du libellé bancaire, avec quelques libellés bruts en exemple.

Noms déjà donnés (réutilise exactement l'un d'eux quand c'est le même marchand) :
${known}

Marchands à nommer :
${list}

Consignes :
- Donne le nom court que l'utilisateur dirait : « Carrefour Express », « Bolt », « SNCF », « Monoprix ».
- Casse normale, pas tout en majuscules.
- Sans ville ni numéro de magasin, sauf si c'est le seul nom disponible.
- Pour un virement à une personne, le prénom et le rôle s'il est clair : « Léo (coloc) ».
- Si le libellé est tronqué et que le marchand n'est pas reconnaissable, garde les mots lisibles en casse normale : « LE PAIN DE LA » devient « Le Pain de la ».
- Réponds pour chaque clé, en recopiant la clé à l'identique dans "key".
- Dans "description", une phrase courte qui dit ce qu'est ce marchand : « Chaîne de fast-food », « Éditeur de jeux vidéo (League of Legends) », « Boulangerie ».
- Ajoute la ville ou le quartier si le libellé en donne un : « BK K0010 PARIS » donne « Chaîne de fast-food, Paris ».
- Pour une personne : la relation si elle est claire, sinon « Virement à un particulier ».
- 140 caractères au plus.
- Si tu ne reconnais pas le marchand, laisse "description" vide : ne jamais deviner.
- Réponds uniquement avec le JSON demandé.`;
}

/**
 * Nomme et décrit les marchands à traiter (sans nom ou jamais décrits) par lots de 150, les plus fréquents d'abord, jusqu'à épuisement.
 * Une clé déjà demandée dans ce run n'est jamais redemandée, même si Claude ne l'a rien répondu :
 * sinon une clé jamais traitée resterait en tête de liste et priverait les suivantes, moins fréquentes.
 * N'écrit le nom que là où personne ne l'a donné, et la description que là où elle n'est ni `web` ni `user`.
 * Lève une `ClaudeError` si Claude échoue.
 */
export async function nameMerchants(db: Db, deps: { exec?: Exec } = {}): Promise<number> {
  const exec = deps.exec ?? execClaude;
  const model = getSettings(db).claudeModel || undefined;
  let total = 0;
  const tried = new Set<string>();
  for (;;) {
    const keys = listKeysToProcess(db, MERCHANT_BATCH_SIZE, tried);
    if (keys.length === 0) return total;
    for (const key of keys) tried.add(key);
    const prompt = buildMerchantPrompt({
      merchants: keys.map((key) => ({ key, examples: sampleLabels(db, key, MERCHANT_EXAMPLES) })),
      knownNames: listMerchantNames(db),
    });
    const args = ['-p', '--tools', '', '--output-format', 'json', '--json-schema', JSON.stringify(merchantNamesJsonSchema)];
    if (model) args.push('--model', model);
    args.push(prompt);

    const parsed = merchantNamesResultSchema.safeParse(await runClaude(args, MERCHANT_TIMEOUT_MS, exec));
    if (!parsed.success) throw new ClaudeError('Réponse de Claude invalide (format inattendu)', 'claude_invalid_output');
    const asked = new Set(keys);
    const results = parsed.data.names
      .filter(({ key }) => asked.has(key))
      .map(({ key, name, description }) => ({ key, name: name.trim(), description: description.trim() }));
    // Une clé demandée mais absente de la réponse compte aussi comme essayée.
    for (const key of keys) if (!results.some((r) => r.key === key)) results.push({ key, name: '', description: '' });
    total += setClaudeResults(db, results, new Date().toISOString());
  }
}

export type MerchantNamer = {
  /** Lance un nommage en tâche de fond ; pendant une exécution, en programme un seul de plus à la fin. */
  request: () => void;
  status: () => MerchantStatus;
  /** Résolue quand plus rien ne tourne ni n'est programmé. */
  idle: () => Promise<void>;
};

/**
 * Nommeur en mémoire : une seule exécution à la fois, sans jamais bloquer l'appelant.
 * Une erreur est journalisée et gardée pour l'écran des Réglages, jusqu'au prochain succès.
 */
export function createMerchantNamer(db: Db | DbHolder, deps: { exec?: Exec; log?: (message: string) => void } = {}): MerchantNamer {
  const holder = toDbHolder(db);
  const log = deps.log ?? ((message: string) => console.warn(message));
  let current: Promise<void> | null = null;
  let pending = false;
  let lastError: string | null = null;

  const start = () => {
    pending = false;
    // setImmediate : request() doit rendre la main avant que nameMerchants ne touche la base,
    // sinon son premier appel synchrone (avant son premier await) s'exécute dans la pile de l'appelant
    // (import, synchro bancaire) et entre en concurrence avec ses propres requêtes.
    current = new Promise<void>((resolve) => {
      setImmediate(() => {
        // Restauration en cours : ce tour est sauté (la prochaine demande reprendra les marchands sans nom).
        const run = holder.isRestoring() ? Promise.resolve() : nameMerchants(holder.current(), { exec: deps.exec });
        run
          .then(() => {
            lastError = null;
          })
          .catch((err: unknown) => {
            lastError = err instanceof Error ? err.message : String(err);
            log(`[marchands] Nommage par Claude impossible : ${lastError}`);
          })
          .finally(() => {
            current = null;
            if (pending) start();
            resolve();
          });
      });
    });
  };

  return {
    request: () => {
      if (current) pending = true;
      else start();
    },
    status: () => ({ ...merchantStats(holder.current()), running: current !== null, lastError }),
    idle: async () => {
      while (current) await current;
    },
  };
}
