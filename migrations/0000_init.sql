CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`meta` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `billing_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`run_date` text NOT NULL,
	`actor_id` text,
	`status` text NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`details` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `billing_runs_started_idx` ON `billing_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `billing_runs_actor_idx` ON `billing_runs` (`actor_id`);--> statement-breakpoint
CREATE TABLE `cancellation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`reason` text NOT NULL,
	`comment` text,
	`offered_alternative` text,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cancellation_requests_sub_idx` ON `cancellation_requests` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `cancellation_requests_customer_idx` ON `cancellation_requests` (`customer_id`);--> statement-breakpoint
CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`type` text NOT NULL,
	`entity` text,
	`entity_id` text,
	`summary` text NOT NULL,
	`actor_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `customer_activity_customer_idx` ON `customer_activity` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `customer_activity_actor_idx` ON `customer_activity` (`actor_id`);--> statement-breakpoint
CREATE TABLE `customer_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `customer_notes_customer_idx` ON `customer_notes` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_notes_author_idx` ON `customer_notes` (`author_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`company_name` text,
	`contact_name` text NOT NULL,
	`phone` text,
	`billing_address` text,
	`tax_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_user_uq` ON `customers` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_uq` ON `customers` (`email`);--> statement-breakpoint
CREATE INDEX `customers_contact_idx` ON `customers` (`contact_name`);--> statement-breakpoint
CREATE TABLE `discount_products` (
	`discount_id` text NOT NULL,
	`product_id` text NOT NULL,
	PRIMARY KEY(`discount_id`, `product_id`),
	FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discount_products_product_idx` ON `discount_products` (`product_id`);--> statement-breakpoint
CREATE TABLE `discount_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`discount_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` integer NOT NULL,
	`released_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discount_redemptions_discount_idx` ON `discount_redemptions` (`discount_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `discount_redemptions_invoice_uq` ON `discount_redemptions` (`invoice_id`,`discount_id`);--> statement-breakpoint
CREATE TABLE `discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`min_purchase` integer DEFAULT 0 NOT NULL,
	`min_quantity` integer DEFAULT 0 NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`usage_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`scope` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discounts_dates_idx` ON `discounts` (`starts_on`,`ends_on`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`rule` text NOT NULL,
	`severity` text NOT NULL,
	`fingerprint` text NOT NULL,
	`customer_id` text,
	`subscription_id` text,
	`invoice_id` text,
	`payment_id` text,
	`amount_at_risk` integer DEFAULT 0 NOT NULL,
	`expected` integer,
	`actual` integer,
	`explanation` text NOT NULL,
	`suggestion` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution_note` text,
	`resolved_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `findings_fingerprint_uq` ON `findings` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `findings_kind_status_idx` ON `findings` (`kind`,`status`,`severity`);--> statement-breakpoint
CREATE INDEX `findings_customer_idx` ON `findings` (`customer_id`);--> statement-breakpoint
CREATE INDEX `findings_subscription_idx` ON `findings` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `findings_invoice_idx` ON `findings` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `findings_payment_idx` ON `findings` (`payment_id`);--> statement-breakpoint
CREATE INDEX `findings_resolved_by_idx` ON `findings` (`resolved_by`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`product_id` text,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`discount_amount` integer DEFAULT 0 NOT NULL,
	`tax_amount` integer DEFAULT 0 NOT NULL,
	`amount` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invoice_lines_invoice_idx` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_lines_product_idx` ON `invoice_lines` (`product_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`subscription_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text NOT NULL,
	`subtotal` integer NOT NULL,
	`discount_total` integer DEFAULT 0 NOT NULL,
	`tax_total` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`amount_paid` integer DEFAULT 0 NOT NULL,
	`customer_snapshot` text,
	`billing_run_id` text,
	`sent_at` text,
	`confirmed_at` text,
	`paid_at` text,
	`cancelled_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_uq` ON `invoices` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_sub_period_uq` ON `invoices` (`subscription_id`,`period_start`);--> statement-breakpoint
CREATE INDEX `invoices_status_due_idx` ON `invoices` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `invoices_customer_idx` ON `invoices` (`customer_id`);--> statement-breakpoint
CREATE INDEX `invoices_issue_idx` ON `invoices` (`issue_date`);--> statement-breakpoint
CREATE INDEX `invoices_billing_run_idx` ON `invoices` (`billing_run_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`user_id` text,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`entity` text,
	`entity_id` text,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `notifications_entity_idx` ON `notifications` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_tokens_hash_uq` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_idx` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `payment_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`step` text NOT NULL,
	`notification_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_reminders_invoice_step_uq` ON `payment_reminders` (`invoice_id`,`step`);--> statement-breakpoint
CREATE INDEX `payment_reminders_notification_idx` ON `payment_reminders` (`notification_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text,
	`customer_id` text,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`paid_on` text NOT NULL,
	`reference` text,
	`note` text,
	`recorded_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payments_invoice_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `payments_customer_idx` ON `payments` (`customer_id`);--> statement-breakpoint
CREATE INDEX `payments_paid_on_idx` ON `payments` (`paid_on`);--> statement-breakpoint
CREATE INDEX `payments_recorded_by_idx` ON `payments` (`recorded_by`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`billing_period` text NOT NULL,
	`min_quantity` integer DEFAULT 1 NOT NULL,
	`available_from` text NOT NULL,
	`available_to` text,
	`auto_close` integer DEFAULT false NOT NULL,
	`closable` integer DEFAULT true NOT NULL,
	`pausable` integer DEFAULT false NOT NULL,
	`renewable` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plans_status_idx` ON `plans` (`status`);--> statement-breakpoint
CREATE TABLE `product_taxes` (
	`product_id` text NOT NULL,
	`tax_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `tax_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tax_id`) REFERENCES `taxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_taxes_tax_idx` ON `product_taxes` (`tax_id`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`attribute` text NOT NULL,
	`value` text NOT NULL,
	`extra_price` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_variants_product_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_uq` ON `product_variants` (`product_id`,`attribute`,`value`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`sales_price` integer NOT NULL,
	`cost_price` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `products_active_idx` ON `products` (`is_active`);--> statement-breakpoint
CREATE TABLE `quotation_template_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `quotation_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `qt_lines_template_idx` ON `quotation_template_lines` (`template_id`);--> statement-breakpoint
CREATE INDEX `qt_lines_product_idx` ON `quotation_template_lines` (`product_id`);--> statement-breakpoint
CREATE INDEX `qt_lines_variant_idx` ON `quotation_template_lines` (`variant_id`);--> statement-breakpoint
CREATE TABLE `quotation_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plan_id` text NOT NULL,
	`validity_days` integer DEFAULT 30 NOT NULL,
	`payment_term_days` integer DEFAULT 15 NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quotation_templates_plan_idx` ON `quotation_templates` (`plan_id`);--> statement-breakpoint
CREATE INDEX `quotation_templates_creator_idx` ON `quotation_templates` (`created_by`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `renewal_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`due_on` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`renewal_subscription_id` text,
	`assignee_id` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`renewal_subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `renewal_tasks_sub_uq` ON `renewal_tasks` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `renewal_tasks_status_due_idx` ON `renewal_tasks` (`status`,`due_on`);--> statement-breakpoint
CREATE INDEX `renewal_tasks_renewal_idx` ON `renewal_tasks` (`renewal_subscription_id`);--> statement-breakpoint
CREATE INDEX `renewal_tasks_assignee_idx` ON `renewal_tasks` (`assignee_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscription_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`tax_id` text,
	`discount_id` text,
	`amount` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tax_id`) REFERENCES `taxes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `subscription_lines_sub_idx` ON `subscription_lines` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `subscription_lines_product_idx` ON `subscription_lines` (`product_id`);--> statement-breakpoint
CREATE INDEX `subscription_lines_variant_idx` ON `subscription_lines` (`variant_id`);--> statement-breakpoint
CREATE INDEX `subscription_lines_tax_idx` ON `subscription_lines` (`tax_id`);--> statement-breakpoint
CREATE INDEX `subscription_lines_discount_idx` ON `subscription_lines` (`discount_id`);--> statement-breakpoint
CREATE TABLE `subscription_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor_id` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sub_history_sub_idx` ON `subscription_status_history` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `sub_history_actor_idx` ON `subscription_status_history` (`actor_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`customer_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`template_id` text,
	`renewed_from_id` text,
	`status` text NOT NULL,
	`start_date` text NOT NULL,
	`expiry_date` text,
	`billed_periods` integer DEFAULT 0 NOT NULL,
	`next_invoice_date` text,
	`payment_term_days` integer DEFAULT 15 NOT NULL,
	`quote_valid_until` text,
	`closed_reason` text,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `quotation_templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_number_uq` ON `subscriptions` (`number`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_idx` ON `subscriptions` (`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_customer_idx` ON `subscriptions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_plan_idx` ON `subscriptions` (`plan_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_template_idx` ON `subscriptions` (`template_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_renewed_from_idx` ON `subscriptions` (`renewed_from_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_next_invoice_idx` ON `subscriptions` (`status`,`next_invoice_date`);--> statement-breakpoint
CREATE INDEX `subscriptions_expiry_idx` ON `subscriptions` (`expiry_date`);--> statement-breakpoint
CREATE TABLE `taxes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`rate` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);