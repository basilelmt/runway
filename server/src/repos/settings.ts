import { eq } from 'drizzle-orm';
import { settingsSchema, type Settings } from '@shared/schemas';
import type { Db } from '../db/client';
import { settings } from '../db/schema';

export function getSettings(db: Db): Settings {
  const rows = db.select().from(settings).all();
  const raw: Record<string, unknown> = {};
  for (const row of rows) raw[row.key] = JSON.parse(row.value);
  return settingsSchema.parse(raw);
}

export function saveSettings(db: Db, input: Settings): Settings {
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(input)) {
      tx.insert(settings)
        .values({ key, value: JSON.stringify(value) })
        .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
        .run();
    }
  });
  return getSettings(db);
}

/** Valeur brute d'une clé hors du schéma des réglages (état interne, secrets jamais renvoyés au client). */
export function readSettingKey<T>(db: Db, key: string): T | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : null;
}

export function writeSettingKey(db: Db, key: string, value: unknown): void {
  if (value === null) {
    db.delete(settings).where(eq(settings.key, key)).run();
    return;
  }
  const json = JSON.stringify(value);
  db.insert(settings).values({ key, value: json }).onConflictDoUpdate({ target: settings.key, set: { value: json } }).run();
}
