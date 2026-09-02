import { getD1 } from './index';
import { decryptPayload, encryptPayload, encryptText, isEncrypted, sanitizeCrmPayload } from './crypto';

export const MAX_PAYLOAD_BYTES = 2_500_000;

export type OrgRow = { org_id: string; payload: string; revision: number; updated_at: string; device_id: string; invite_code: string };
export type MemberRow = { user_id: string; org_id: string; role: string; joined_at: string };

export function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}

export function safePayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 120) return null;
  const payload: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (!key.startsWith('niviontech_') || typeof item !== 'string') return null;
    payload[key] = item;
  }
  const clean = sanitizeCrmPayload(payload);
  const serialized = JSON.stringify(clean);
  return new TextEncoder().encode(serialized).byteLength <= MAX_PAYLOAD_BYTES ? { payload: clean, serialized } : null;
}

type SnapshotFields = { payload: string; revision: number; updated_at: string; device_id: string };

export async function publicSnapshot(row: SnapshotFields | null) {
  if (!row) return null;
  try {
    return { payload: await decryptPayload(row.payload), revision: row.revision, updatedAt: row.updated_at, deviceId: row.device_id };
  } catch {
    return null;
  }
}

function randomInviteCode() {
  // Código curto, fácil de ditar/digitar (sem caracteres ambíguos: 0/O, 1/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function ensureSchema() {
  const db = getD1();
  await db.prepare(`CREATE TABLE IF NOT EXISTS crm_orgs (
    org_id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    device_id TEXT NOT NULL,
    invite_code TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS crm_orgs_invite_code_idx ON crm_orgs (invite_code)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS crm_org_members (
    user_id TEXT PRIMARY KEY NOT NULL,
    org_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS crm_member_profiles (
    user_id TEXT PRIMARY KEY NOT NULL,
    org_id TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    profile TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS crm_org_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    org_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    device_id TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS crm_org_snapshots_org_idx ON crm_org_snapshots (org_id, revision DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS crm_org_members_org_idx ON crm_org_members (org_id, user_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS crm_member_profiles_org_idx ON crm_member_profiles (org_id, user_id)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS crm_login_audit (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    session_fingerprint TEXT NOT NULL,
    active_sessions INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS crm_login_audit_user_idx ON crm_login_audit (user_id, created_at DESC)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS crm_deal_room_access_events (
    id TEXT PRIMARY KEY NOT NULL,
    token TEXT NOT NULL,
    event_status TEXT NOT NULL,
    code_prefix TEXT,
    created_at TEXT NOT NULL,
    ip_hash TEXT,
    user_agent_hash TEXT,
    details TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS crm_deal_room_access_events_token_idx ON crm_deal_room_access_events (token, created_at DESC)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS crm_deal_rooms (
    token TEXT PRIMARY KEY NOT NULL,
    org_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    access_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    view_count INTEGER NOT NULL DEFAULT 0,
    last_viewed_at TEXT,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS crm_deal_rooms_org_idx ON crm_deal_rooms (org_id, created_at DESC)`).run();
  return db;
}

async function createOrgForUser(userId: string) {
  const db = await ensureSchema();
  const orgId = crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  // Colisão de invite code é praticamente impossível (33^8 combinações), mas tenta de novo se acontecer.
  for (let attempt = 0; attempt < 5; attempt++) {
    const inviteCode = randomInviteCode();
    try {
      // revision começa em 0: sinaliza "organização criada, mas sem nenhum dado sincronizado ainda".
      // Isso mantém o primeiro login indistinguível de "sem nuvem" para a lógica de bootstrap do cliente,
      // evitando um falso "conflito" entre o dispositivo novo e um snapshot vazio.
      await db.prepare(
        'INSERT INTO crm_orgs (org_id, payload, revision, updated_at, device_id, invite_code) VALUES (?, ?, 0, ?, ?, ?)'
      ).bind(orgId, await encryptPayload({}), updatedAt, 'server', inviteCode).run();
      await db.prepare(
        'INSERT INTO crm_org_members (user_id, org_id, role, joined_at) VALUES (?, ?, ?, ?)'
      ).bind(userId, orgId, 'owner', updatedAt).run();
      return { orgId, role: 'owner' as const };
    } catch {
      // provável colisão de invite_code único; tenta outro código
      continue;
    }
  }
  throw new Error('could_not_provision_org');
}

/** Resolve a organização do usuário autenticado, criando uma nova (como dono) se ele ainda não pertence a nenhuma. */
export async function resolveMembership(userId: string, options: { preferredOrgId?: string; preferredRole?: 'owner' | 'member' } = {}) {
  const db = await ensureSchema();
  const existing = await db.prepare('SELECT user_id, org_id, role, joined_at FROM crm_org_members WHERE user_id = ?').bind(userId).first<MemberRow>();
  if (existing) return { orgId: existing.org_id, role: existing.role as 'owner' | 'member' };
  if (options.preferredOrgId) {
    const org = await getOrgRow(options.preferredOrgId);
    if (!org) throw new Error('invited_org_not_found');
    const role = options.preferredRole || 'member';
    await db.prepare('INSERT INTO crm_org_members (user_id, org_id, role, joined_at) VALUES (?, ?, ?, ?)').bind(userId, org.org_id, role, new Date().toISOString()).run();
    return { orgId: org.org_id, role };
  }
  return createOrgForUser(userId);
}

export async function upsertMemberProfile(profile: { userId: string; orgId: string; email: string; name: string; profile: string }) {
  const db = await ensureSchema();
  const encryptedEmail = await encryptText(profile.email);
  const encryptedName = await encryptText(profile.name);
  await db.prepare(`INSERT INTO crm_member_profiles (user_id, org_id, email, display_name, profile, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET org_id=excluded.org_id,email=excluded.email,display_name=excluded.display_name,profile=excluded.profile,updated_at=excluded.updated_at`)
    .bind(profile.userId, profile.orgId, encryptedEmail, encryptedName, profile.profile, new Date().toISOString()).run();
}

export async function saveAutomaticSnapshot(orgId: string, row: { payload: string; revision: number; device_id: string }) {
  const db = await ensureSchema();
  await db.prepare('INSERT INTO crm_org_snapshots (id, org_id, payload, revision, created_at, device_id) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), orgId, isEncrypted(row.payload) ? row.payload : await encryptPayload(JSON.parse(row.payload)), row.revision, new Date().toISOString(), row.device_id).run();
  await db.prepare(`DELETE FROM crm_org_snapshots WHERE org_id = ? AND id NOT IN (
    SELECT id FROM crm_org_snapshots WHERE org_id = ? ORDER BY revision DESC LIMIT 30
  )`).bind(orgId, orgId).run();
}

export async function getOrgRow(orgId: string) {
  const db = await ensureSchema();
  return db.prepare('SELECT org_id, payload, revision, updated_at, device_id, invite_code FROM crm_orgs WHERE org_id = ?').bind(orgId).first<OrgRow>();
}

export async function getOrgByInviteCode(inviteCode: string) {
  const db = await ensureSchema();
  return db.prepare('SELECT org_id, payload, revision, updated_at, device_id, invite_code FROM crm_orgs WHERE invite_code = ?').bind(inviteCode).first<OrgRow>();
}

export async function migrateOrgEncryption(orgId: string) {
  const db = await ensureSchema();
  const org = await getOrgRow(orgId);
  if (org && !isEncrypted(org.payload)) {
    const encrypted = await encryptPayload(JSON.parse(org.payload));
    await db.prepare('UPDATE crm_orgs SET payload = ? WHERE org_id = ?').bind(encrypted, orgId).run();
    org.payload = encrypted;
  }
  const snapshots = await db.prepare('SELECT id, payload FROM crm_org_snapshots WHERE org_id = ?').bind(orgId).all<{ id: string; payload: string }>();
  for (const row of snapshots.results || []) {
    if (!isEncrypted(row.payload)) await db.prepare('UPDATE crm_org_snapshots SET payload = ? WHERE id = ?').bind(await encryptPayload(JSON.parse(row.payload)), row.id).run();
  }
  return org;
}

export async function recordLoginAudit(input: { userId: string; orgId: string; sessionId: string; activeSessions: number }) {
  const db = await ensureSchema();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.sessionId));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  await db.prepare('INSERT INTO crm_login_audit (id, user_id, org_id, session_fingerprint, active_sessions, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), input.userId, input.orgId, fingerprint, input.activeSessions, new Date().toISOString()).run();
}
