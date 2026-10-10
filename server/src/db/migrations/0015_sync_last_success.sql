-- Connexions antérieures à 0013 : sans dernière synchro réussie connue, le signal sync_error ne savait pas depuis
-- quand la synchro échouait. Une connexion sans erreur en cours a réussi sa dernière tentative.
UPDATE `bank_connections` SET `last_success_at` = `last_sync_at` WHERE `last_error` IS NULL AND `last_success_at` IS NULL AND `last_sync_at` IS NOT NULL;
