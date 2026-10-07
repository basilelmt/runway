-- Le budget mensuel d'une enveloppe (monthly_target) remplace les règles récurrentes d'allocation.
-- Les allocations déjà passées sont conservées, détachées de leur règle.
UPDATE `transactions` SET `recurring_rule_id` = NULL WHERE `recurring_rule_id` IN (SELECT `id` FROM `recurring_rules` WHERE `kind` = 'allocation');--> statement-breakpoint
DELETE FROM `recurring_rules` WHERE `kind` = 'allocation';
