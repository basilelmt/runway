import { desc, eq } from 'drizzle-orm';
import type { ImportRecord } from '@shared/schemas';
import type { Db } from '../db/client';
import { imports } from '../db/schema';

export function listImports(db: Db): ImportRecord[] {
  return db.select().from(imports).orderBy(desc(imports.importedAt), desc(imports.id)).all();
}

export function lastImportForAccount(db: Db, accountId: number): ImportRecord | null {
  return db.select().from(imports).where(eq(imports.accountId, accountId)).orderBy(desc(imports.importedAt), desc(imports.id)).get() ?? null;
}

export function createImport(
  db: Db,
  input: { fileName: string; accountId: number; rowCount: number; newCount: number; duplicateCount: number; matchedCount: number },
): ImportRecord {
  return db.insert(imports).values(input).returning().get();
}
