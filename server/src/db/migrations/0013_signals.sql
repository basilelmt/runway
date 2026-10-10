CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`payload` text NOT NULL,
	`dismissed_at` text,
	`resolved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signals_key_unique` ON `signals` (`key`);--> statement-breakpoint
ALTER TABLE `bank_connections` ADD `consecutive_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bank_connections` ADD `first_failure_at` text;--> statement-breakpoint
ALTER TABLE `bank_connections` ADD `last_success_at` text;