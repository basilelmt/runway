CREATE TABLE `advances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expense_id` integer NOT NULL,
	`person` text NOT NULL,
	`amount` integer NOT NULL,
	`refund_id` integer,
	`settled_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refund_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `advances_expense_idx` ON `advances` (`expense_id`);--> statement-breakpoint
CREATE INDEX `advances_refund_idx` ON `advances` (`refund_id`);