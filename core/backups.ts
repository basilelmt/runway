/**
 * Logique pure des sauvegardes : nommage des fichiers et règle de conservation.
 * Aucun accès disque ici ; voir `server/src/services/backup.ts` pour la partie fichiers et SQLite.
 */

/** Raisons dont le suffixe de fichier est fixe et déclenché automatiquement par le serveur. */
const AUTO_REASONS = new Set(['demarrage', 'avant-migration', 'quotidienne']);

export const BACKUP_REASON_LABELS: Record<string, string> = {
  demarrage: 'Au démarrage',
  'avant-migration': 'Avant une migration',
  quotidienne: 'Quotidienne',
  manuelle: 'Manuelle',
  'avant-restauration': 'Avant une restauration',
};

/** Raison en clair ; une raison personnalisée (`db:backup -- "raison"`) s'affiche telle quelle. */
export function reasonLabel(reason: string): string {
  return BACKUP_REASON_LABELS[reason] ?? reason;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `runway-<AAAA-MM-JJ>T<HH-MM-SS>-<suffixe>.db`, en heure locale. */
export function formatBackupFilename(date: Date, reason: string): string {
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `runway-${y}-${mo}-${d}T${hh}-${mi}-${ss}-${reason}.db`;
}

const FILENAME_RE = /^runway-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-([a-z0-9-]+)\.db$/;

/** Inverse de `formatBackupFilename` ; `null` si le nom ne suit pas le format (ancienne copie manuelle). */
export function parseBackupFilename(name: string): { date: Date; reason: string } | null {
  const m = FILENAME_RE.exec(name);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return { date, reason: m[7]! };
}

/** Raison personnalisée de `npm run db:backup -- "raison"`, mise en kebab-case (accents retirés). */
export function kebabCase(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'manuelle';
}

export type RetentionEntry = { name: string; date: Date; reason: string };

/**
 * Fichiers à supprimer par la règle de conservation : tout ce qui a moins de 30 jours est gardé ;
 * au-delà, une seule sauvegarde par mois calendaire (la plus récente). Les raisons `manuelle` et
 * `avant-restauration`, et toute raison personnalisée (donc ni `demarrage`, `avant-migration` ni
 * `quotidienne`), ne sont jamais proposées à la suppression.
 */
export function backupsToDelete(entries: RetentionEntry[], now: Date): string[] {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - THIRTY_DAYS_MS;
  const eligible = entries.filter((e) => AUTO_REASONS.has(e.reason) && e.date.getTime() < cutoff);

  const bestOfMonth = new Map<string, RetentionEntry>();
  for (const e of eligible) {
    const key = `${e.date.getFullYear()}-${e.date.getMonth()}`;
    const current = bestOfMonth.get(key);
    if (!current || e.date.getTime() > current.date.getTime()) bestOfMonth.set(key, e);
  }

  return eligible.filter((e) => bestOfMonth.get(`${e.date.getFullYear()}-${e.date.getMonth()}`)?.name !== e.name).map((e) => e.name);
}
