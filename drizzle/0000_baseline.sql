CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_type` text NOT NULL,
	`parent_id` text NOT NULL,
	`display_name` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `capo_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`type` text NOT NULL,
	`string_frets` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `composition_motifs` (
	`id` text PRIMARY KEY NOT NULL,
	`composition_id` text NOT NULL,
	`motif_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`section_name` text,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`motif_id`) REFERENCES `motifs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `composition_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`composition_id` text NOT NULL,
	`position_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `composition_setups` (
	`id` text PRIMARY KEY NOT NULL,
	`composition_id` text NOT NULL,
	`setup_id` text NOT NULL,
	`instrument_role` text,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`setup_id`) REFERENCES `setups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `compositions` (
	`id` text PRIMARY KEY NOT NULL,
	`human_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`tonal_center` text,
	`tempo` integer,
	`tempo_notes` text,
	`piece_map` text,
	`sections` text,
	`notes` text,
	`lyrics` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compositions_human_id_unique` ON `compositions` (`human_id`);--> statement-breakpoint
CREATE TABLE `instruments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`maker` text,
	`model` text,
	`family` text NOT NULL,
	`string_count` integer NOT NULL,
	`default_scale_length` real,
	`scale_length_unit` text DEFAULT 'in' NOT NULL,
	`per_string_speaking_lengths` text,
	`notes` text,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `motif_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`motif_id` text NOT NULL,
	`position_id` text NOT NULL,
	FOREIGN KEY (`motif_id`) REFERENCES `motifs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `motifs` (
	`id` text PRIMARY KEY NOT NULL,
	`human_id` text NOT NULL,
	`name` text NOT NULL,
	`setup_id` text,
	`tuning_id` text,
	`instrument_id` text,
	`function` text,
	`tab_data` text NOT NULL,
	`variations` text,
	`tags` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`setup_id`) REFERENCES `setups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tuning_id`) REFERENCES `tunings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `motifs_human_id_unique` ON `motifs` (`human_id`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`human_id` text,
	`name` text,
	`tuning_id` text,
	`setup_id` text,
	`string_count` integer NOT NULL,
	`base_fret` integer DEFAULT 1 NOT NULL,
	`frets` text NOT NULL,
	`fingers` text,
	`tags` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tuning_id`) REFERENCES `tunings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`setup_id`) REFERENCES `setups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `setups` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text,
	`tuning_id` text,
	`string_set_id` text,
	`capo_config_id` text,
	`name` text,
	`effective_pitches` text NOT NULL,
	`per_string_tension` text,
	`total_tension` real,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tuning_id`) REFERENCES `tunings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`string_set_id`) REFERENCES `string_sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`capo_config_id`) REFERENCES `capo_configurations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `string_products` (
	`id` text PRIMARY KEY NOT NULL,
	`manufacturer` text NOT NULL,
	`product_family` text,
	`nominal_gauge` real NOT NULL,
	`gauge_unit` text DEFAULT 'in' NOT NULL,
	`material` text,
	`core_construction` text,
	`winding_construction` text,
	`unit_weight` real,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `string_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text,
	`name` text NOT NULL,
	`installed_date` text,
	`string_assignments` text NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tunings` (
	`id` text PRIMARY KEY NOT NULL,
	`human_id` text NOT NULL,
	`name` text NOT NULL,
	`string_count` integer NOT NULL,
	`pitches` text NOT NULL,
	`tonal_center` text,
	`tags` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tunings_human_id_unique` ON `tunings` (`human_id`);