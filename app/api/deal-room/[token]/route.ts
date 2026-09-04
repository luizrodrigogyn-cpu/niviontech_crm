import { ensureSchema, response } from '../../../../db/org';
import { decryptText } from '../../../../db/crypto';
import type { D1Database } from '@cloudflare/workers-types';

export const dynamic = 'force-dynamic';
const encoder = new TextEncoder();
const MAX_INVALID_ATTEMPTS = 5;

type RoomRow = {
  token: string;
  payload: string;
  access_hash: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  failed_attempts: number;
  locked_until: string | null;
};

async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeAccessCode(value: unknown) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function normalizeRoomToken(value: string) {
  const token = String(value || '').trim();
  return /^[0-9a-f]{32}$/i.test(token) ? token : '';
}

function active(row: RoomRow | null) {
  return Boolean(row && !row.revoked_at && new Date(row.expires_at).getTime() > Date.now());
}

function isLocked(row: RoomRow | null) {
  return Boolean(row?.locked_until && new Date(row.locked_until).getTime() > Date.now());
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function timingSafeEquals(left: string, right: string) {
  return timingSafeEqual(left, right);
}

async function hashText(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function clientIpFromRequest(request: Request) {
  const direct = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || '';
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return String((forwarded || direct || 'unknown').split(',')[0] || 'unknown').trim();
}

async function recordRoomAccessEvent(
  db: D1Database,
  token: string,
  eventStatus: string,
  request: Request,
  options: { details?: string } = {},
) {
  try {
    const [ipHash, uaHash] = await Promise.all([
      hashText(clientIpFromRequest(request)),
      hashText(request.headers.get('user-agent') || 'ua-missing'),
    ]);
    await db
      .prepare(
        'INSERT INTO crm_deal_room_access_events (id, token, event_status, code_prefix, created_at, ip_hash, user_agent_hash, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        crypto.randomUUID(),
        token,
        eventStatus,
        null,
        new Date().toISOString(),
        ipHash,
        uaHash,
        options.details || null,
      )
      .run();
  } catch {
    // Não interrompe fluxo do acesso por falha de telemetria.
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const normalizedToken = normalizeRoomToken(token);
  if (!normalizedToken) return response({ error: 'invalid_token' }, 400);
  const db = await ensureSchema();
  const row = await db
    .prepare('SELECT token, expires_at, revoked_at, view_count FROM crm_deal_rooms WHERE token = ?')
    .bind(normalizedToken)
    .first<RoomRow>();
  if (!row) {
    await recordRoomAccessEvent(db, normalizedToken, 'not_found', _request, { details: 'room_not_found' });
    return response({ error: 'not_found' }, 404);
  }
  if (!active(row)) {
    await recordRoomAccessEvent(db, normalizedToken, 'room_unavailable', _request, { details: 'inactive_room' });
  }
  await recordRoomAccessEvent(db, normalizedToken, 'room_view_check', _request, { details: 'status_query' });
  return response({ active: active(row), expiresAt: row.expires_at, viewCount: Number(row.view_count || 0) });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const normalizedToken = normalizeRoomToken(token);
  if (!normalizedToken) return response({ error: 'invalid_token' }, 400);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response({ error: 'invalid_json' }, 400);
  }

  const code = normalizeAccessCode(body.accessCode);
  const db = await ensureSchema();
  const row = await db
    .prepare(
      'SELECT token, payload, access_hash, expires_at, revoked_at, view_count, failed_attempts, locked_until FROM crm_deal_rooms WHERE token = ?',
    )
    .bind(normalizedToken)
    .first<RoomRow>();

  if (!row) {
    await recordRoomAccessEvent(db, normalizedToken, 'not_found', request, { details: 'room_not_found' });
    return response({ error: 'not_found' }, 404);
  }

  if (!active(row)) {
    await recordRoomAccessEvent(db, normalizedToken, 'room_unavailable', request, { details: 'inactive_room' });
    return response({ error: 'room_unavailable' }, 410);
  }

  if (isLocked(row)) {
    await recordRoomAccessEvent(db, normalizedToken, 'temporarily_locked', request, { details: 'active_lockout' });
    return response({ error: 'temporarily_locked' }, 429);
  }
  if (row!.locked_until) {
    await db.prepare('UPDATE crm_deal_rooms SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE token = ?').bind(new Date().toISOString(), normalizedToken).run();
    row!.failed_attempts = 0;
    row!.locked_until = null;
  }

  const providedDigest = await digest(`${normalizedToken}:${code}`);
  if (code.length !== 6 || !timingSafeEquals(providedDigest, row!.access_hash)) {
    const now = new Date().toISOString();
    const lockUntil = new Date(Date.now() + 15 * 60_000).toISOString();
    await db
      .prepare('UPDATE crm_deal_rooms SET failed_attempts = failed_attempts + 1, locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE NULL END, updated_at = ? WHERE token = ?')
      .bind(MAX_INVALID_ATTEMPTS, lockUntil, now, normalizedToken)
      .run();
    const attemptState = await db.prepare('SELECT failed_attempts, locked_until FROM crm_deal_rooms WHERE token = ?').bind(normalizedToken).first<{failed_attempts:number;locked_until:string|null}>();
    const lockedUntil = attemptState?.locked_until || null;
    const eventStatus = lockedUntil ? 'temporarily_locked' : 'invalid_code';
    await recordRoomAccessEvent(db, normalizedToken, eventStatus, request, {
      details: lockedUntil ? 'lockout_threshold_reached' : `code_mismatch_attempt_${Number(attemptState?.failed_attempts || 0)}`,
    });

    return response({ error: lockedUntil ? 'temporarily_locked' : 'invalid_code' }, lockedUntil ? 429 : 403);
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      'UPDATE crm_deal_rooms SET view_count = view_count + 1, last_viewed_at = ?, updated_at = ?, failed_attempts = 0, locked_until = NULL WHERE token = ?',
    )
    .bind(now, now, normalizedToken)
    .run();

  await recordRoomAccessEvent(db, normalizedToken, 'success', request, { details: 'access_granted' });

  return response({
    payload: JSON.parse(await decryptText(row!.payload)),
    viewCount: Number(row!.view_count || 0) + 1,
    expiresAt: row!.expires_at,
  });
}
