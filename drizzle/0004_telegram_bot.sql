CREATE TABLE `telegram_link_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `telegram_link_tokens_user_idx` ON `telegram_link_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `telegram_links` (
	`telegram_user_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`telegram_username` text,
	`telegram_first_name` text,
	`linked_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_user_id_unique` ON `telegram_links` (`user_id`);--> statement-breakpoint
CREATE TABLE `telegram_sessions` (
	`telegram_user_id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`active_message_id` integer,
	`state_json` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_updates` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`claimed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `telegram_updates_claimed_idx` ON `telegram_updates` (`claimed_at`);