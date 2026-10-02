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
