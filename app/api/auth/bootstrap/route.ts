import { auth, clerkClient } from '@clerk/nextjs/server';
import { migrateOrgEncryption, recordLoginAudit, resolveMembership, response, updateMemberAccessRole, upsertMemberProfile } from '../../../../db/org';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { isAuthenticated, userId, sessionId } = await auth();
  if (!isAuthenticated || !userId || !sessionId) return response({ error: 'authentication_required' }, 401);
  const client = await clerkClient();
  const maxActiveSessions = Math.max(1, Math.min(10, Number(process.env.MAX_ACTIVE_SESSIONS || 3)));
  const sessions = await client.sessions.getSessionList({ userId, status: 'active', limit: 100 });
  if (sessions.totalCount > maxActiveSessions) {
    const removable = sessions.data.filter(session => session.id !== sessionId).slice(maxActiveSessions - 1);
    await Promise.all(removable.map(session => client.sessions.revokeSession(session.id)));
  }
  const user = await client.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || '';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || email.split('@')[0] || 'Usuário';
  const metadata = user.publicMetadata as { niviontechOrgId?: string; niviontechRole?: string };
  const membership = await resolveMembership(userId, {
    preferredOrgId: metadata.niviontechOrgId,
    preferredRole: metadata.niviontechOrgId ? 'member' : 'owner',
  });
  const profile = membership.role === 'owner' ? 'Proprietário/Admin' : metadata.niviontechRole || 'Colaborador comercial';
  const accessRole = await updateMemberAccessRole(userId, profile);
  await migrateOrgEncryption(membership.orgId);
  await upsertMemberProfile({ userId, orgId: membership.orgId, email, name, profile });
  const activeSessions = Math.min(sessions.totalCount, maxActiveSessions);
  await recordLoginAudit({ userId, orgId: membership.orgId, sessionId, activeSessions });
  return response({ userId, orgId: membership.orgId, role: accessRole, profile, name, email, activeSessions, maxActiveSessions });
}
