import { auth } from '@clerk/nextjs/server';
import { ensureSchema, getOrgByInviteCode, publicSnapshot, response } from '../../../../db/org';

export const dynamic = 'force-dynamic';

// Um colega usa o código de convite mostrado em "Equipe e acessos" para entrar na MESMA
// organização do dono da conta — a partir daqui os dois compartilham o mesmo snapshot de dados.
export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return response({ error: 'authentication_required' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response({ error: 'invalid_json' }, 400);
  }
  const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim().toUpperCase() : '';
  if (!inviteCode) return response({ error: 'invite_code_required' }, 400);

  const db = await ensureSchema();
  const org = await getOrgByInviteCode(inviteCode);
  if (!org) return response({ error: 'invite_not_found' }, 404);

  const existingMembership = await db
    .prepare('SELECT org_id, role FROM crm_org_members WHERE user_id = ?')
    .bind(userId)
    .first<{ org_id: string; role: string }>();

  if (existingMembership && existingMembership.org_id !== org.org_id) {
    // MVP: um usuário pertence a uma única organização. Evita reatribuir silenciosamente
    // um dono/membro de uma empresa para outra por engano.
    return response({ error: 'already_in_another_org' }, 409);
  }

  if (!existingMembership) {
    await db
      .prepare('INSERT INTO crm_org_members (user_id, org_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind(userId, org.org_id, 'member', new Date().toISOString())
      .run();
  }

  const snapshot = org.revision > 0 ? await publicSnapshot(org) : null;
  return response({ orgId: org.org_id, role: existingMembership?.role ?? 'member', snapshot });
}
