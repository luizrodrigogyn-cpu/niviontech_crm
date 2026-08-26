import { getD1 } from '../../../db';

export const dynamic='force-dynamic';
const MAX_PAYLOAD_BYTES=2_500_000;

type SnapshotRow={payload:string;revision:number;updated_at:string;device_id:string};

function authenticatedUserId(request:Request){
  return request.headers.get('oai-authenticated-user-id')?.trim()||'';
}

async function ensureSchema(){
  const db=getD1();
  await db.prepare(`CREATE TABLE IF NOT EXISTS crm_snapshots (
    user_id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    device_id TEXT NOT NULL
  )`).run();
  return db;
}

function safePayload(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const entries=Object.entries(value as Record<string,unknown>);
  if(entries.length>120)return null;
  const payload:Record<string,string>={};
  for(const [key,item] of entries){
    if(!key.startsWith('niviontech_')||typeof item!=='string')return null;
    payload[key]=item;
  }
  const serialized=JSON.stringify(payload);
  return new TextEncoder().encode(serialized).byteLength<=MAX_PAYLOAD_BYTES?{payload,serialized}:null;
}

function response(body:unknown,status=200){
  return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
}

async function currentSnapshot(userId:string){
  const db=await ensureSchema();
  return db.prepare('SELECT payload, revision, updated_at, device_id FROM crm_snapshots WHERE user_id = ?').bind(userId).first<SnapshotRow>();
}

function publicSnapshot(row:SnapshotRow|null){
  if(!row)return null;
  try{return{payload:JSON.parse(row.payload),revision:row.revision,updatedAt:row.updated_at,deviceId:row.device_id}}catch{return null}
}

export async function GET(request:Request){
  const userId=authenticatedUserId(request);
  if(!userId)return response({error:'authentication_required'},401);
  return response({snapshot:publicSnapshot(await currentSnapshot(userId))});
}

export async function POST(request:Request){
  const userId=authenticatedUserId(request);
  if(!userId)return response({error:'authentication_required'},401);
  let body:Record<string,unknown>;
  try{body=await request.json()}catch{return response({error:'invalid_json'},400)}
  const safe=safePayload(body.payload);
  const deviceId=typeof body.deviceId==='string'?body.deviceId.slice(0,120):'unknown';
  const baseRevision=Math.max(0,Number(body.baseRevision)||0),force=body.force===true;
  if(!safe)return response({error:'invalid_payload'},400);
  const db=await ensureSchema(),existing=await db.prepare('SELECT payload, revision, updated_at, device_id FROM crm_snapshots WHERE user_id = ?').bind(userId).first<SnapshotRow>();
  if(existing&&!force&&existing.revision!==baseRevision)return response({error:'revision_conflict',snapshot:publicSnapshot(existing)},409);
  if(!existing&&baseRevision>0&&!force)return response({error:'revision_conflict',snapshot:null},409);
  const updatedAt=new Date().toISOString();
  if(existing){
    const nextRevision=existing.revision+1;
    const result=await db.prepare('UPDATE crm_snapshots SET payload = ?, revision = ?, updated_at = ?, device_id = ? WHERE user_id = ? AND revision = ?').bind(safe.serialized,nextRevision,updatedAt,deviceId,userId,existing.revision).run();
    if(!result.meta.changes)return response({error:'revision_conflict',snapshot:publicSnapshot(await currentSnapshot(userId))},409);
    return response({snapshot:{payload:safe.payload,revision:nextRevision,updatedAt,deviceId}});
  }
  try{
    await db.prepare('INSERT INTO crm_snapshots (user_id, payload, revision, updated_at, device_id) VALUES (?, ?, 1, ?, ?)').bind(userId,safe.serialized,updatedAt,deviceId).run();
    return response({snapshot:{payload:safe.payload,revision:1,updatedAt,deviceId}});
  }catch{
    return response({error:'revision_conflict',snapshot:publicSnapshot(await currentSnapshot(userId))},409);
  }
}
