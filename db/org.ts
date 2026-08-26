import { getD1 } from './index';

export const MAX_PAYLOAD_BYTES = 2_500_000;

export type OrgRow = { org_id: string; payload: string; revision: number; updated_at: string; device_id: string; invite_code: string };
export type MemberRow = { user_id: string; org_id: string; role: string; joined_at: string };

export function authenticatedUserId(request: Request) {
  return request.headers.get('oai-authenticated-user-id')?.trim() || '';
}

export function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
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
  const serialized = JSON.stringify(payload);
  return new TextEncoder().encode(serialized).byteLength <= MAX_PAYLOAD_BYTES ? { payload, serialized } : null;
}

type SnapshotFields = { payload: string; revision: number; updated_at: string; device_id: string };

export function publicSnapshot(row: SnapshotFields | null) {
  if (!row) return null;
  try {
    return { payload: JSON.parse(row.payload), revision: row.revision, updatedAt: row.updated_at, deviceId: row.device_id };
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
      ).bind(orgId, '{}', updatedAt, 'server', inviteCode).run();
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
export async function resolveMembership(userId: string) {
  const db = await ensureSchema();
  const existing = await db.prepare('SELECT user_id, org_id, role, joined_at FROM crm_org_members WHERE user_id = ?').bind(userId).first<MemberRow>();
  if (existing) return { orgId: existing.org_id, role: existing.role as 'owner' | 'member' };
  return createOrgForUser(userId);
}

export async function getOrgRow(orgId: string) {
  const db = await ensureSchema();
  return db.prepare('SELECT org_id, payload, revision, updated_at, device_id, invite_code FROM crm_orgs WHERE org_id = ?').bind(orgId).first<OrgRow>();
}

export async function getOrgByInviteCode(inviteCode: string) {
  const db = await ensureSchema();
  return db.prepare('SELECT org_id, payload, revision, updated_at, device_id, invite_code FROM crm_orgs WHERE invite_code = ?').bind(inviteCode).first<OrgRow>();
}
