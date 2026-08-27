import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveMembership, response, upsertMemberProfile } from '../../../../db/org';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return response({ error: 'authentication_required' }, 401);
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || '';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || email.split('@')[0] || 'Usuário';
  const metadata = user.publicMetadata as { niviontechOrgId?: string; niviontechRole?: string };
  const membership = await resolveMembership(userId, {
    preferredOrgId: metadata.niviontechOrgId,
    preferredRole: metadata.niviontechOrgId ? 'member' : 'owner',
  });
  const profile = membership.role === 'owner' ? 'Proprietário/Admin' : metadata.niviontechRole || 'Colaborador comercial';
  await upsertMemberProfile({ userId, orgId: membership.orgId, email, name, profile });
  return response({ userId, orgId: membership.orgId, role: membership.role, profile, name, email });
}
