-- Le budget d'une enveloppe devient : ses charges fixes ramenées au mois + un complément saisi à la main.
-- L'ancien budget devient le complément, moins les charges qu'il couvrait déjà (même calcul que monthlyEquivalent).
ALTER TABLE `envelopes` RENAME COLUMN `monthly_target` TO `monthly_extra`;--> statement-breakpoint
WITH `charges` AS (
  SELECT `envelope_id`, SUM(CAST(ROUND(CASE `frequency`
    WHEN 'daily' THEN `amount` * 365.0 / 12 / MAX(1, `interval`)
    WHEN 'weekly' THEN `amount` * 52.0 / 12 / MAX(1, `interval`)
    WHEN 'monthly' THEN `amount` * 1.0 / MAX(1, `interval`)
    WHEN 'yearly' THEN `amount` / 12.0 / MAX(1, `interval`)
  END) AS INTEGER)) AS `total`
  FROM `recurring_rules`
  WHERE `kind` = 'expense' AND `active` = 1 AND `envelope_id` IS NOT NULL
    AND (`end_date` IS NULL OR `end_date` >= date('now', 'start of month'))
  GROUP BY `envelope_id`
)
UPDATE `envelopes`
SET `monthly_extra` = CASE
  WHEN `monthly_extra` - COALESCE((SELECT `total` FROM `charges` WHERE `charges`.`envelope_id` = `envelopes`.`id`), 0) >= 100
    THEN `monthly_extra` - COALESCE((SELECT `total` FROM `charges` WHERE `charges`.`envelope_id` = `envelopes`.`id`), 0)
  ELSE NULL
END
WHERE `monthly_extra` IS NOT NULL;
