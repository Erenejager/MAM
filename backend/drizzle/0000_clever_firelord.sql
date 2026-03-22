CREATE TABLE `asset_custom_values` (
	`asset_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` text,
	PRIMARY KEY(`asset_id`, `field_id`),
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `custom_fields`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`original_filename` text NOT NULL,
	`filepath` text NOT NULL,
	`file_size` integer,
	`status` text DEFAULT 'ingesting',
	`file_hash` text,
	`duration_seconds` real,
	`width` integer,
	`height` integer,
	`codec` text,
	`bitrate` integer,
	`frame_rate` real,
	`metadata_status` text DEFAULT 'pending',
	`thumbnail_path` text,
	`thumbnail_status` text DEFAULT 'pending',
	`transcript_path` text,
	`transcript_text` text,
	`transcription_status` text DEFAULT 'pending',
	`transcription_error` text,
	`search_index_status` text DEFAULT 'pending',
	`title` text,
	`description` text,
	`tags` text DEFAULT '[]',
	`created_at` text DEFAULT '(datetime(''now''))',
	`updated_at` text DEFAULT '(datetime(''now''))'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_file_hash_unique` ON `assets` (`file_hash`);--> statement-breakpoint
CREATE TABLE `custom_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`field_type` text DEFAULT 'text',
	`created_at` text DEFAULT '(datetime(''now''))'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_fields_name_unique` ON `custom_fields` (`name`);