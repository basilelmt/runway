-- Custom SQL migration file, put your code below! --
-- Certains relevés alignent la fin du libellé (numéro de carte) avec une longue suite d'espaces,
-- ce qui se voit comme un grand vide dans l'interface. SQLite n'a pas de regexp : on compacte les
-- espaces en répétant replace('  ', ' ') assez de fois pour réduire une suite de 64 espaces à un seul
-- (64 -> 32 -> 16 -> 8 -> 4 -> 2 -> 1, soit six passes), puis on retire les espaces de bord avec trim().
-- La clé marchand (merchant_key) n'est pas touchée : elle compacte déjà les espaces à son propre calcul.

UPDATE `transactions`
SET `label` = trim(replace(replace(replace(replace(replace(replace(`label`, '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '))
WHERE `label` != trim(replace(replace(replace(replace(replace(replace(`label`, '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
--> statement-breakpoint
UPDATE `transactions`
SET `note` = trim(replace(replace(replace(replace(replace(replace(`note`, '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '))
WHERE `note` IS NOT NULL
  AND `note` != trim(replace(replace(replace(replace(replace(replace(`note`, '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
--> statement-breakpoint
UPDATE `recurring_rules`
SET `label` = trim(replace(replace(replace(replace(replace(replace(`label`, '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '))
WHERE `label` != trim(replace(replace(replace(replace(replace(replace(`label`, '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
