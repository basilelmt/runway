CREATE TABLE `fundings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_transaction_id` integer NOT NULL,
	`month` text NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`shortfall_count` integer DEFAULT 0 NOT NULL,
	`dismissed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`source_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fundings_source_transaction_id_unique` ON `fundings` (`source_transaction_id`);--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `triggers_funding` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `funds_next_month` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `funding_id` integer REFERENCES fundings(id) ON DELETE cascade;