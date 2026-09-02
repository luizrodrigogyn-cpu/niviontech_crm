import { auth } from '@clerk/nextjs/server';
import { ensureSchema, resolveMembership, response } from '../../../db/org';
import { encryptText } from '../../../db/crypto';

export const dynamic='force-dynamic';
const encoder=new TextEncoder();
async function digest(value:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')}
function safeRoomPayload(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))return null;const text=JSON.stringify(value);return encoder.encode(text).byteLength<=180_000?text:null}

function normalizeAccessCode(value:unknown){
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function sanitizeToken(value: string) {
  return String(value || '').slice(0, 64);
}

export async function POST(request:Request){
  const {isAuthenticated,userId}=await auth();if(!isAuthenticated||!userId)return response({error:'authentication_required'},401);
  const {orgId}=await resolveMembership(userId);let body:Record<string,unknown>;try{body=await request.json()}catch{return response({error:'invalid_json'},400)}
  const payload=safeRoomPayload(body.payload);
  const code=normalizeAccessCode(body.accessCode);
  const days=Math.max(1,Math.min(30,Number(body.expiresInDays)||7));
  if(!payload||code.length!==6)return response({error:'invalid_room'},400);
  const db=await ensureSchema(),token=crypto.randomUUID().replace(/-/g,''),createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+days*86400000);
  await db.prepare('INSERT INTO crm_deal_rooms (token, org_id, payload, access_hash, expires_at, created_at, updated_at, view_count) VALUES (?, ?, ?, ?, ?, ?, ?, 0)').bind(token,orgId,await encryptText(payload),await digest(`${token}:${code}`),expiresAt.toISOString(),createdAt.toISOString(),createdAt.toISOString()).run();
  return response({token,url:`/sala/#${sanitizeToken(token)}`,expiresAt:expiresAt.toISOString()});
}

export async function DELETE(request:Request){
  const {isAuthenticated,userId}=await auth();if(!isAuthenticated||!userId)return response({error:'authentication_required'},401);
  const {orgId}=await resolveMembership(userId);let body:Record<string,unknown>;try{body=await request.json()}catch{return response({error:'invalid_json'},400)}
  const token=String(body.token||'').slice(0,64),db=await ensureSchema(),now=new Date().toISOString();
  await db.prepare('UPDATE crm_deal_rooms SET revoked_at = ?, updated_at = ? WHERE token = ? AND org_id = ?').bind(now,now,token,orgId).run();return response({revoked:true});
}
