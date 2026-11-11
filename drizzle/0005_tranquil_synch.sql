CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`hits` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiry_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
ALTER TABLE `mailboxes` DROP COLUMN `renew_count`;--> statement-breakpoint
DELETE FROM `settings` WHERE `key` IN ('mail.tempMaxLifetimeMinutes','mail.tempTtlMinutes');