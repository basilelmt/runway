CREATE TABLE `merchants` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text,
	`source` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `merchant_key` text;--> statement-breakpoint
CREATE INDEX `transactions_merchant_idx` ON `transactions` (`merchant_key`);