CREATE TABLE `holding_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`side` text NOT NULL,
	`date` text NOT NULL,
	`quantity` text NOT NULL,
	`amount` integer NOT NULL,
	`fees` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `holding_trades_holding_idx` ON `holding_trades` (`holding_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `holding_trades_external_idx` ON `holding_trades` (`external_id`);--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_asset` text,
	`synced_quantity` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holdings_external_idx` ON `holdings` (`source`,`external_asset`);--> statement-breakpoint
CREATE TABLE `idea_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`accepted_count` integer DEFAULT 0 NOT NULL,
	`rejected` text DEFAULT '[]' NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`created_on` text NOT NULL,
	`title` text NOT NULL,
	`event` text NOT NULL,
	`source_url` text NOT NULL,
	`reasoning` text NOT NULL,
	`priced_in` text NOT NULL,
	`ticker` text NOT NULL,
	`asset_name` text NOT NULL,
	`where_to_buy` text NOT NULL,
	`horizon` text NOT NULL,
	`start_price_eur` real NOT NULL,
	`bench_start_price_eur` real NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`final_return` real,
	`bench_final_return` real,
	FOREIGN KEY (`run_id`) REFERENCES `idea_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ideas_status_idx` ON `ideas` (`status`);--> statement-breakpoint
CREATE TABLE `price_tickers` (
	`ticker` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`history_from` text NOT NULL,
	`refreshed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prices` (
	`ticker` text NOT NULL,
	`date` text NOT NULL,
	`close` real NOT NULL,
	`currency` text NOT NULL,
	`fetched_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`ticker`, `date`)
);
