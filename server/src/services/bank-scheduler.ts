import { toISODate } from '@shared/dates';
import type { Settings } from '@shared/schemas';
import type { PsuInfo } from '../bank/enable-banking';
import type { BankProvider } from '../bank/provider';
import type { Db } from '../db/client';
import { toDbHolder, type DbHolder } from '../db/holder';
import { getSettings } from '../repos/settings';
import { defaultBankProvider, isBankConfigured, runSync } from './bank-sync';

/** La synchro de fond se présente comme un accès avec l'utilisateur absent : pas d'IP ni de navigateur réels. */
const BACKGROUND_PSU: PsuInfo = { ip: '127.0.0.1', userAgent: 'Runway (tâche de fond)' };

/**
 * Au-delà de ce délai depuis la dernière synchro réussie (toutes origines confondues), la tâche de fond
 * resynchronise. 6 h parce que la DSP2 limite à 4 accès par jour sans l'utilisateur présent : à ce rythme,
 * la tâche de fond seule ne dépasse jamais 4 accès par tranche de 24 h.
 */
export const BACKGROUND_SYNC_STALE_MINUTES = 360;
/** Fréquence des tentatives : la plupart ne feront rien, `onlyIfStaleMinutes` les filtre. */
export const BACKGROUND_SYNC_INTERVAL_MS = 30 * 60_000;

export type BankSchedulerDeps = {
  /** `Db` figé (tests) ou porteur de connexion remplaçable (production, pour la restauration). */
  db: Db | DbHolder;
  /** Fabrique du fournisseur, injectable pour les tests. Par défaut, le vrai Enable Banking. */
  provider?: (settings: Settings, psu: PsuInfo) => BankProvider;
  now?: () => Date;
  intervalMs?: number;
  /** Désactive la tâche sans y toucher : recette, tests, worktrees qui pointent sur la vraie base. */
  enabled?: () => boolean;
  /** Appelé après chaque tentative (même sautée ou sans connexion), pour relancer la détection de signaux. */
  onResult?: (result: Awaited<ReturnType<typeof runSync>>) => void;
  /** Erreur inattendue (ni du fournisseur, ni applicative) pendant une tentative : la tâche continue malgré tout. */
  onError?: (err: unknown) => void;
};

/** Vrai sauf si `RUNWAY_BACKGROUND_SYNC=0`, utile pour la recette et les worktrees sur la vraie base. */
function envEnabled(): boolean {
  return process.env.RUNWAY_BACKGROUND_SYNC !== '0';
}

/**
 * Lance la synchronisation bancaire en tâche de fond : tout de suite, puis toutes les 30 minutes, avec
 * `onlyIfStaleMinutes: 360`. Partage le verrou de `runSync` : une synchro manuelle déjà en cours n'est jamais
 * doublée. Les tests ne l'appellent pas (c'est `index.ts`, le vrai démarrage du serveur, qui le fait).
 */
export function startBackgroundSync(deps: BankSchedulerDeps): { stop: () => void } {
  const enabled = deps.enabled ?? envEnabled;
  const makeProvider = deps.provider ?? defaultBankProvider;
  const now = deps.now ?? (() => new Date());
  const holder = toDbHolder(deps.db);

  if (!enabled()) return { stop: () => {} };

  async function tick() {
    try {
      // Relit le porteur à chaque tentative, pas une connexion figée au démarrage : une restauration ne doit
      // jamais écrire sur une connexion fermée.
      const db = holder.current();
      const settings = getSettings(db);
      if (!isBankConfigured(settings)) return;
      const provider = makeProvider(settings, BACKGROUND_PSU);
      const current = now();
      const result = await runSync(db, provider, { today: toISODate(current), now: current, onlyIfStaleMinutes: BACKGROUND_SYNC_STALE_MINUTES });
      deps.onResult?.(result);
    } catch (err) {
      deps.onError?.(err);
    }
  }

  void tick();
  const timer = setInterval(tick, deps.intervalMs ?? BACKGROUND_SYNC_INTERVAL_MS);
  return { stop: () => clearInterval(timer) };
}
