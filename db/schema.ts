import { integer, sqliteTable, text, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Um registro por ORGANIZAÇÃO (empresa), não por usuário autenticado individual.
// Todos os membros da mesma empresa leem/escrevem o mesmo snapshot.
export const crmOrgs=sqliteTable('crm_orgs',{
  orgId:text('org_id').primaryKey(),
  payload:text('payload').notNull(),
  revision:integer('revision').notNull().default(1),
  updatedAt:text('updated_at').notNull(),
  deviceId:text('device_id').notNull(),
  inviteCode:text('invite_code').notNull(),
},table=>({
  inviteCodeIdx:uniqueIndex('crm_orgs_invite_code_idx').on(table.inviteCode),
}));

// Liga cada usuário autenticado (identidade da plataforma) a uma organização.
// Um usuário pertence a no máximo uma organização nesta versão.
export const crmOrgMembers=sqliteTable('crm_org_members',{
  userId:text('user_id').primaryKey(),
  orgId:text('org_id').notNull(),
  role:text('role').notNull().default('member'), // 'owner' | 'member'
  joinedAt:text('joined_at').notNull(),
});

export const crmMemberProfiles=sqliteTable('crm_member_profiles',{
  userId:text('user_id').primaryKey(),orgId:text('org_id').notNull(),email:text('email').notNull(),displayName:text('display_name').notNull(),profile:text('profile').notNull(),updatedAt:text('updated_at').notNull(),
});

export const crmOrgSnapshots=sqliteTable('crm_org_snapshots',{
  id:text('id').primaryKey(),orgId:text('org_id').notNull(),payload:text('payload').notNull(),revision:integer('revision').notNull(),createdAt:text('created_at').notNull(),deviceId:text('device_id').notNull(),
});

export const crmLoginAudit=sqliteTable('crm_login_audit',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),orgId:text('org_id').notNull(),sessionFingerprint:text('session_fingerprint').notNull(),activeSessions:integer('active_sessions').notNull(),createdAt:text('created_at').notNull(),
});
