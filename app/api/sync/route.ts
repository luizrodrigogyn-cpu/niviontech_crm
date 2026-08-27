import { auth } from '@clerk/nextjs/server';
import { ensureSchema, getOrgRow, migrateOrgEncryption, publicSnapshot, resolveMembership, response, safePayload, saveAutomaticSnapshot } from '../../../db/org';
import { encryptPayload } from '../../../db/crypto';

export const dynamic = 'force-dynamic';

type SnapshotRow = { payload: string; revision: number; updated_at: string; device_id: string };

// IMPORTANTE: a sincronização é feita por ORGANIZAÇÃO (empresa), não por usuário individual.
// Todo membro autenticado da mesma organização lê e escreve o mesmo snapshot — é isso que faz
// a tela "Equipe e acessos" ter efeito real entre dispositivos diferentes.

export async function GET() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return response({ error: 'authentication_required' }, 401);
  const { orgId, role } = await resolveMembership(userId);
  const org = await migrateOrgEncryption(orgId);
  // revision 0 = organização provisionada mas nunca sincronizada de verdade; trate como "sem nuvem ainda"
  // para não disparar um falso conflito no primeiro acesso do dispositivo.
  const snapshot = org && org.revision > 0 ? await publicSnapshot(org) : null;
  return response({
    orgId,
    role,
    inviteCode: role === 'owner' ? org?.invite_code : undefined,
    snapshot,
  });
}

export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return response({ error: 'authentication_required' }, 401);
  const { orgId, role } = await resolveMembership(userId);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response({ error: 'invalid_json' }, 400);
  }
  const safe = safePayload(body.payload);
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 120) : 'unknown';
  const baseRevision = Math.max(0, Number(body.baseRevision) || 0);
  const force = body.force === true;
  if (!safe) return response({ error: 'invalid_payload' }, 400);

  const db = await ensureSchema();
  await migrateOrgEncryption(orgId);
  const existing = await db
    .prepare('SELECT payload, revision, updated_at, device_id FROM crm_orgs WHERE org_id = ?')
    .bind(orgId)
    .first<SnapshotRow>();

  if (existing && !force && existing.revision !== baseRevision) {
    return response({ error: 'revision_conflict', orgId, role, snapshot: await publicSnapshot(existing) }, 409);
  }

  if (existing?.revision) await saveAutomaticSnapshot(orgId, existing);

  const updatedAt = new Date().toISOString();
  const nextRevision = (existing?.revision ?? 0) + 1;
  const result = await db
    .prepare('UPDATE crm_orgs SET payload = ?, revision = ?, updated_at = ?, device_id = ? WHERE org_id = ? AND revision = ?')
    .bind(await encryptPayload(safe.payload), nextRevision, updatedAt, deviceId, orgId, existing?.revision ?? 0)
    .run();

  if (!result.meta.changes) {
    const current = await getOrgRow(orgId);
    return response({ error: 'revision_conflict', orgId, role, snapshot: await publicSnapshot(current ?? null) }, 409);
  }
  return response({ orgId, role, snapshot: { payload: safe.payload, revision: nextRevision, updatedAt, deviceId } });
}
