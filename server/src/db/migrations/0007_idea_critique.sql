ALTER TABLE `idea_runs` ADD `phase` text;--> statement-breakpoint
ALTER TABLE `idea_runs` ADD `candidate_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `idea_runs` ADD `failed_angles` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `sources` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `verdict` text;--> statement-breakpoint
ALTER TABLE `ideas` ADD `critique` text;--> statement-breakpoint
ALTER TABLE `ideas` ADD `risk` text;--> statement-breakpoint
ALTER TABLE `ideas` ADD `angle` text;--> statement-breakpoint
ALTER TABLE `ideas` ADD `perf_1m` real;--> statement-breakpoint
ALTER TABLE `ideas` ADD `perf_3m` real;--> statement-breakpoint
ALTER TABLE `ideas` ADD `bench_perf_1m` real;--> statement-breakpoint
ALTER TABLE `ideas` ADD `bench_perf_3m` real;--> statement-breakpoint
UPDATE `ideas` SET `sources` = json_array(`source_url`);