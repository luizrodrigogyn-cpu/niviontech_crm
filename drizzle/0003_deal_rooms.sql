CREATE TABLE IF NOT EXISTS `crm_deal_rooms` (
  `token` text PRIMARY KEY NOT NULL,
  `org_id` text NOT NULL,
  `payload` text NOT NULL,
  `access_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `view_count` integer DEFAULT 0 NOT NULL,
  `last_viewed_at` text,
  `failed_attempts` integer DEFAULT 0 NOT NULL,
  `locked_until` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `crm_deal_rooms_org_idx` ON `crm_deal_rooms` (`org_id`,`created_at` DESC);
