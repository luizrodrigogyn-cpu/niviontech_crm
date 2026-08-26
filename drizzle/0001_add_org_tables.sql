-- Novo modelo de sincronização: por ORGANIZAÇÃO, não por usuário individual.
-- Esta migration é fornecida como referência manual. O recomendado é rodar
-- `npm run db:generate` (drizzle-kit) para gerar a migration oficial a partir
-- de db/schema.ts, o que também atualiza drizzle/meta corretamente.
--
-- Aplicação manual alternativa (Cloudflare D1):
--   wrangler d1 execute <NOME_DO_BANCO> --remote --file=drizzle/0001_add_org_tables.sql

CREATE TABLE IF NOT EXISTS `crm_orgs` (
	`org_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`device_id` text NOT NULL,
	`invite_code` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `crm_orgs_invite_code_idx` ON `crm_orgs` (`invite_code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crm_org_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text NOT NULL
);
--> statement-breakpoint
-- Dados antigos: a tabela `crm_snapshots` (por usuário) fica preservada e não é mais
-- usada pelo app. Depois de confirmar que a migração dos usuários piloto para o modelo
-- por organização funcionou, ela pode ser removida com:
--   DROP TABLE IF EXISTS `crm_snapshots`;
