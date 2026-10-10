import type { Db } from './client';

/**
 * Porteur de connexion : les routes et tâches de fond lisent `current()` à chaque usage au lieu de
 * garder un `Db` figé, pour qu'une restauration puisse remplacer la connexion sans redémarrer le serveur.
 */
export type DbHolder = {
  current(): Db;
  replace(db: Db): void;
  /**
   * Vrai pendant une restauration : l'API répond 503 et les tâches de fond (synchro bancaire, nommage des
   * marchands) sautent leur tour, plutôt que d'écrire dans une base sur le point d'être remplacée.
   */
  isRestoring(): boolean;
  setRestoring(value: boolean): void;
};

export function createDbHolder(db: Db): DbHolder {
  let current = db;
  let restoring = false;
  return {
    current: () => current,
    replace: (next) => {
      current = next;
    },
    isRestoring: () => restoring,
    setRestoring: (value) => {
      restoring = value;
    },
  };
}

export function isDbHolder(value: Db | DbHolder): value is DbHolder {
  return typeof (value as DbHolder).current === 'function';
}

/** Normalise un `Db` brut (tests, usages simples) ou un porteur déjà construit en porteur. */
export function toDbHolder(value: Db | DbHolder): DbHolder {
  return isDbHolder(value) ? value : createDbHolder(value);
}
