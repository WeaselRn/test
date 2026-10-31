CREATE INDEX `customers_created_idx` ON `customers` (`created_at`);--> statement-breakpoint
CREATE INDEX `payments_created_idx` ON `payments` (`created_at`);--> statement-breakpoint
CREATE INDEX `subscriptions_created_idx` ON `subscriptions` (`created_at`);--> statement-breakpoint
CREATE INDEX `subscriptions_start_idx` ON `subscriptions` (`start_date`);