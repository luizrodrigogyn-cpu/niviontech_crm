-- Limite de proteção zero-cost do Orbit Prospectar, isolado por organização e mês.
CREATE TABLE IF NOT EXISTS `crm_prospect_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`period` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`cap` integer DEFAULT 100 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `crm_prospect_usage_org_period_idx` ON `crm_prospect_usage` (`org_id`,`period`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `crm_prospect_usage_period_idx` ON `crm_prospect_usage` (`period`);
