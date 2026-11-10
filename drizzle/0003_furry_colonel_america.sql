CREATE INDEX `account_provider_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `mailboxes_user_created_idx` ON `mailboxes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_received_idx` ON `messages` (`received_at`);--> statement-breakpoint
CREATE INDEX `messages_unread_idx` ON `messages` (`mailbox_id`) WHERE "messages"."is_read" = 0;--> statement-breakpoint
CREATE INDEX `sent_resend_idx` ON `sent_emails` (`resend_email_id`);--> statement-breakpoint
CREATE INDEX `sent_created_idx` ON `sent_emails` (`created_at`);