import { and, asc, desc, eq, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import { merchantFallbackName } from '@core/merchants';
import type { MerchantDetail } from '@shared/api-types';
import { addDays, type ISODate } from '@shared/dates';
import type { MerchantRename } from '@shared/schemas';
import type { Db } from '../db/client';
import { merchants, transactions } from '../db/schema';
import { NotFoundError } from '../errors';

/** Au plus autant de lignes par insertion, loin de la limite de variables de SQLite. */
const INSERT_CHUNK = 500;

/** Crée la ligne des clés nouvelles, sans nom (`INSERT OR IGNORE`) : Claude les nommera. */
export function ensureMerchants(db: Db, keys: Iterable<string | null>): void {
  const fresh = [...new Set([...keys].filter((k): k is string => k !== null))];
  const updatedAt = new Date().toISOString();
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    db.insert(merchants)
      .values(fresh.slice(i, i + INSERT_CHUNK).map((key) => ({ key, updatedAt })))
      .onConflictDoNothing()
      .run();
  }
}

/** Clés portées par au moins une opération et sans nom, les plus fréquentes d'abord, hors `exclude`. */
export function listUnnamedKeys(db: Db, limit: number, exclude: Iterable<string> = []): string[] {
  const excluded = [...exclude];
  const where = excluded.length > 0 ? and(isNull(merchants.name), notInArray(merchants.key, excluded)) : isNull(merchants.name);
  return db
    .select({ key: merchants.key })
    .from(merchants)
    .innerJoin(transactions, eq(transactions.merchantKey, merchants.key))
    .where(where)
    .groupBy(merchants.key)
    .orderBy(desc(sql`count(*)`), asc(merchants.key))
    .limit(limit)
    .all()
    .map((r) => r.key);
}

/** Jusqu'à `limit` libellés bruts différents portant cette clé. */
export function sampleLabels(db: Db, key: string, limit: number): string[] {
  return db
    .selectDistinct({ label: transactions.label })
    .from(transactions)
    .where(eq(transactions.merchantKey, key))
    .orderBy(asc(transactions.label))
    .limit(limit)
    .all()
    .map((r) => r.label);
}

/** Noms déjà donnés, sans doublon : Claude les réutilise plutôt que d'en inventer un proche. */
export function listMerchantNames(db: Db): string[] {
  return db
    .selectDistinct({ name: merchants.name })
    .from(merchants)
    .where(isNotNull(merchants.name))
    .orderBy(asc(merchants.name))
    .all()
    .map((r) => r.name!);
}

/** Écrit les noms de Claude là où personne n'a encore nommé le marchand ; renvoie le nombre de marchands nommés. */
export function setClaudeNames(db: Db, names: { key: string; name: string }[]): number {
  const updatedAt = new Date().toISOString();
  return db.transaction((tx) => {
    let named = 0;
    for (const { key, name } of names) {
      named += tx
        .update(merchants)
        .set({ name, source: 'claude', updatedAt })
        .where(and(eq(merchants.key, key), isNull(merchants.source)))
        .run().changes;
    }
    return named;
  });
}

/** Marchands portés par au moins une opération, et combien ont un nom. */
export function merchantStats(db: Db): { total: number; named: number } {
  const row = db
    .select({
      total: sql<number>`count(distinct ${transactions.merchantKey})`,
      named: sql<number>`count(distinct case when ${merchants.name} is not null then ${transactions.merchantKey} end)`,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.key, transactions.merchantKey))
    .get();
  return { total: row?.total ?? 0, named: row?.named ?? 0 };
}

export function getMerchant(db: Db, key: string, today: ISODate): MerchantDetail {
  const since = addDays(today, -365);
  const stats = db
    .select({
      n: sql<number>`count(*)`,
      first: sql<string | null>`min(${transactions.date})`,
      total: sql<number>`coalesce(sum(case when ${transactions.status} = 'confirmed' and ${transactions.date} > ${since} and ${transactions.date} <= ${today}
        then case when ${transactions.kind} = 'income' then ${transactions.amount} else -${transactions.amount} end end), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.merchantKey, key))
    .get();
  const count = stats?.n ?? 0;
  const row = db.select().from(merchants).where(eq(merchants.key, key)).get();
  if (!row && count === 0) throw new NotFoundError('Marchand introuvable');
  const label = row?.name ? '' : sampleLabels(db, key, 1)[0] ?? '';
  return {
    key,
    name: row?.name ?? merchantFallbackName(key, label),
    source: row?.source ?? null,
    transactionCount: count,
    description: row?.description ?? null,
    descriptionSource: row?.descriptionSource ?? null,
    describedAt: row?.describedAt ?? null,
    total12Months: stats?.total ?? 0,
    firstDate: stats?.first ?? null,
  };
}

/**
 * Nom choisi par l'utilisateur (source `user`, jamais écrasé par Claude) ; un nom vide remet le marchand à nommer par Claude.
 * Une description non vide devient `user` ; vide, elle est rendue au passage de fond ; absente, elle ne change pas.
 */
export function renameMerchant(db: Db, key: string, input: MerchantRename, today: ISODate): MerchantDetail {
  getMerchant(db, key, today);
  const updatedAt = new Date().toISOString();
  const naming = input.name === '' ? { name: null, source: null } : { name: input.name, source: 'user' as const };
  const describing =
    input.description === undefined
      ? {}
      : input.description === ''
        ? { description: null, descriptionSource: null, describedAt: null }
        : { description: input.description, descriptionSource: 'user' as const, describedAt: updatedAt };
  const values = { ...naming, ...describing, updatedAt };
  db.insert(merchants).values({ key, ...values }).onConflictDoUpdate({ target: merchants.key, set: values }).run();
  return getMerchant(db, key, today);
}

/** Tous les marchands, pour l'export JSON. */
export function listMerchants(db: Db) {
  return db.select().from(merchants).orderBy(asc(merchants.key)).all();
}
