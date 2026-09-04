import { auth } from '@clerk/nextjs/server';
import { ensureSchema, getMemberAccessIdentity, getOrgRow, migrateOrgEncryption, publicSnapshot, resolveMembership, response, safePayload, saveAutomaticSnapshot } from '../../../db/org';
import { decryptPayload, encryptPayload } from '../../../db/crypto';

export const dynamic = 'force-dynamic';

type SnapshotRow = { payload: string; revision: number; updated_at: string; device_id: string };

const COLLECTION_KEYS = {
  deals: 'niviontech_pipeline', clients: 'niviontech_clients', activities: 'niviontech_activities',
  proposals: 'niviontech_proposals', plans: 'niviontech_closing_plans', cadences: 'niviontech_cadences',
};
const SELLER_SHARED_KEYS = new Set(['niviontech_company','niviontech_catalog','niviontech_pipeline_config','niviontech_custom_pipeline_stages','niviontech_workspace_theme']);
function list(payload: Record<string,string>, key: string) { try { const value=JSON.parse(payload[key]||'[]'); return Array.isArray(value)?value:[]; } catch { return []; } }
function same(left: unknown, right: unknown) { return String(left||'').trim().toLocaleLowerCase('pt-BR')===String(right||'').trim().toLocaleLowerCase('pt-BR'); }
function owns(record: Record<string,unknown>, name: string) {
  const owner = record.owner || record.ownerName || record.assignee || record.responsible;
  return Boolean(String(name || '').trim() && String(owner || '').trim() && same(owner, name));
}
function sellerScope(payload: Record<string,string>, name: string) {
  const deals=list(payload,COLLECTION_KEYS.deals).filter(item=>owns(item,name));
  const ids=new Set(deals.map(item=>String(item.id))),clients=new Set(deals.map(item=>String(item.client)));
  const output:Record<string,string>={}; for(const [key,value] of Object.entries(payload))if(SELLER_SHARED_KEYS.has(key))output[key]=value;
  output[COLLECTION_KEYS.deals]=JSON.stringify(deals.map(({paymentStatus,receivedAmount,receivedAt,...deal})=>deal));
  output[COLLECTION_KEYS.clients]=JSON.stringify(list(payload,COLLECTION_KEYS.clients).filter(item=>owns(item,name)||clients.has(String(item.name))));
  output[COLLECTION_KEYS.activities]=JSON.stringify(list(payload,COLLECTION_KEYS.activities).filter(item=>owns(item,name)||clients.has(String(item.client))));
  output[COLLECTION_KEYS.proposals]=JSON.stringify(list(payload,COLLECTION_KEYS.proposals).filter(item=>ids.has(String(item.dealId))||clients.has(String(item.client))));
  output[COLLECTION_KEYS.plans]=JSON.stringify(list(payload,COLLECTION_KEYS.plans).filter(item=>ids.has(String(item.dealId))));
  output[COLLECTION_KEYS.cadences]=JSON.stringify(list(payload,COLLECTION_KEYS.cadences).filter(item=>ids.has(String(item.dealId))||clients.has(String(item.client))));
  return output;
}
function mergeSellerChanges(full:Record<string,string>, submitted:Record<string,string>, name:string){
  const next={...full},existingDeals=list(full,COLLECTION_KEYS.deals),incomingDeals=list(submitted,COLLECTION_KEYS.deals),ownedIds=new Set(existingDeals.filter(item=>owns(item,name)).map(item=>String(item.id)));
  next[COLLECTION_KEYS.deals]=JSON.stringify([...existingDeals.filter(item=>!owns(item,name)),...incomingDeals.filter(item=>ownedIds.has(String(item.id))||owns(item,name))]);
  const activeDeals=list(next,COLLECTION_KEYS.deals).filter(item=>owns(item,name)),ids=new Set(activeDeals.map(item=>String(item.id))),clients=new Set(activeDeals.map(item=>String(item.client)));
  const rules: Array<[string, (item: Record<string, unknown>) => boolean]> = [
    [COLLECTION_KEYS.clients,item=>owns(item,name)||clients.has(String(item.name))],[COLLECTION_KEYS.activities,item=>owns(item,name)||clients.has(String(item.client))],
    [COLLECTION_KEYS.proposals,item=>ids.has(String(item.dealId))||clients.has(String(item.client))],[COLLECTION_KEYS.plans,item=>ids.has(String(item.dealId))],
    [COLLECTION_KEYS.cadences,item=>ids.has(String(item.dealId))||clients.has(String(item.client))],
  ];
  for(const [key,predicate] of rules)next[key]=JSON.stringify([...list(full,key).filter(item=>!predicate(item)),...list(submitted,key).filter(predicate)]);
  return next;
}

function mergeManagerChanges(full: Record<string, string>, submitted: Record<string, string>) {
  const next = { ...submitted };
  // Gestores operam toda a frente comercial, mas identidade da empresa,
  // usuários e plano continuam sob controle exclusivo do proprietário.
  for (const key of ['niviontech_company', 'niviontech_owner', 'niviontech_users']) {
    if (key in full) next[key] = full[key];
    else delete next[key];
  }
  return next;
}

// A sincronização pertence à organização, com recorte e gravação autorizados por perfil.

export async function GET() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return response({ error: 'authentication_required' }, 401);
  const { orgId, role } = await resolveMembership(userId);
  const org = await migrateOrgEncryption(orgId);
  // revision 0 = organização provisionada mas nunca sincronizada de verdade; trate como "sem nuvem ainda"
  // para não disparar um falso conflito no primeiro acesso do dispositivo.
  let snapshot = org && org.revision > 0 ? await publicSnapshot(org) : null;
  if(snapshot&&role==='seller'){const identity=await getMemberAccessIdentity(userId);snapshot={...snapshot,payload:sellerScope(snapshot.payload,identity.name)}}
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
  // “force” apenas resolve a revisão concorrente. O recorte autorizado por perfil
  // continua sendo aplicado abaixo, portanto nunca amplia o que o usuário pode gravar.
  const force = body.force === true;
  if (!safe) return response({ error: 'invalid_payload' }, 400);

  const db = await ensureSchema();
  await migrateOrgEncryption(orgId);
  const identity=role==='seller'?await getMemberAccessIdentity(userId):null;
  const existing = await db
    .prepare('SELECT payload, revision, updated_at, device_id FROM crm_orgs WHERE org_id = ?')
    .bind(orgId)
    .first<SnapshotRow>();

  if (existing && !force && existing.revision !== baseRevision) {
    const current = await publicSnapshot(existing);
    const snapshot = current && role === 'seller'
      ? { ...current, payload: sellerScope(current.payload, identity?.name || '') }
      : current;
    return response({ error: 'revision_conflict', orgId, role, snapshot }, 409);
  }

  if (existing?.revision) await saveAutomaticSnapshot(orgId, existing);

  const fullPayload=existing?await decryptPayload(existing.payload):{};
  const payloadToSave=role==='seller'
    ? mergeSellerChanges(fullPayload,safe.payload,identity?.name||'')
    : role==='manager'
      ? mergeManagerChanges(fullPayload,safe.payload)
      : safe.payload;
  const updatedAt = new Date().toISOString();
  const nextRevision = (existing?.revision ?? 0) + 1;
  const result = await db
    .prepare('UPDATE crm_orgs SET payload = ?, revision = ?, updated_at = ?, device_id = ? WHERE org_id = ? AND revision = ?')
    .bind(await encryptPayload(payloadToSave), nextRevision, updatedAt, deviceId, orgId, existing?.revision ?? 0)
    .run();

  if (!result.meta.changes) {
    const current = await getOrgRow(orgId);
    const visible = await publicSnapshot(current ?? null);
    const snapshot = visible && role === 'seller'
      ? { ...visible, payload: sellerScope(visible.payload, identity?.name || '') }
      : visible;
    return response({ error: 'revision_conflict', orgId, role, snapshot }, 409);
  }
  return response({ orgId, role, snapshot: { payload: role==='seller'?sellerScope(payloadToSave,identity?.name||''):payloadToSave, revision: nextRevision, updatedAt, deviceId } });
}
