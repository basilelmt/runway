CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`initial_balance` integer DEFAULT 0 NOT NULL,
	`on_budget` integer DEFAULT true NOT NULL,
	`bank_account_number` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_unique` ON `accounts` (`name`);--> statement-breakpoint
CREATE TABLE `envelopes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#4f8a5b' NOT NULL,
	`monthly_target` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `envelopes_name_unique` ON `envelopes` (`name`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`account_id` integer NOT NULL,
	`imported_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`row_count` integer NOT NULL,
	`new_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`matched_count` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recurring_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`label` text NOT NULL,
	`account_id` integer,
	`to_account_id` integer,
	`envelope_id` integer,
	`from_envelope_id` integer,
	`frequency` text NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`day_of_month` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`last_generated_date` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sorting_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pattern` text NOT NULL,
	`envelope_id` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`label` text NOT NULL,
	`note` text,
	`account_id` integer,
	`to_account_id` integer,
	`envelope_id` integer,
	`from_envelope_id` integer,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`recurring_rule_id` integer,
	`import_id` integer,
	`fingerprint` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_rule_id`) REFERENCES `recurring_rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_envelope_idx` ON `transactions` (`envelope_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_fingerprint_idx` ON `transactions` (`fingerprint`);