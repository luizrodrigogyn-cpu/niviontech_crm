CREATE INDEX IF NOT EXISTS `crm_org_members_org_idx` ON `crm_org_members` (`org_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `crm_member_profiles_org_idx` ON `crm_member_profiles` (`org_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crm_login_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `org_id` text NOT NULL,
  `session_fingerprint` text NOT NULL,
  `active_sessions` integer NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `crm_login_audit_user_idx` ON `crm_login_audit` (`user_id`,`created_at` DESC);
