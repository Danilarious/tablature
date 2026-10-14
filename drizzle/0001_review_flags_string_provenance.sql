CREATE TABLE `review_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`flag_type` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
ALTER TABLE `string_products` ADD `catalog_id` text;--> statement-breakpoint
ALTER TABLE `string_products` ADD `unit_weight_source` text;--> statement-breakpoint
ALTER TABLE `string_products` ADD `source_note` text;--> statement-breakpoint
ALTER TABLE `string_products` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `string_products` ADD `verified_at` text;