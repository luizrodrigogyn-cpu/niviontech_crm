export const SYNC_META_KEY='niviontech_sync_meta';
export const SYNC_DEVICE_KEY='niviontech_device_id';
const EXCLUDED_KEYS=new Set([SYNC_META_KEY,SYNC_DEVICE_KEY,'niviontech_last_backup','niviontech_local_organize_draft_text']);

function scrubCredentialFields(value){
  if(Array.isArray(value))return value.map(scrubCredentialFields);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['password','passwordHash','salt','password_hash','passwordSalt'].includes(key)).map(([key,item])=>[key,scrubCredentialFields(item)]));
}

function safeStoredValue(value){
  try{return JSON.stringify(scrubCredentialFields(JSON.parse(value)))}catch{return value}
}

export function collectSyncStorage(storage){
  const snapshot={};
  for(let index=0;index<storage.length;index++){
    const key=storage.key(index);
    if(key?.startsWith('niviontech_')&&!EXCLUDED_KEYS.has(key))snapshot[key]=safeStoredValue(String(storage.getItem(key)??''));
  }
  return Object.fromEntries(Object.entries(snapshot).sort(([left],[right])=>left.localeCompare(right)));
}

export function replaceSyncStorage(storage,snapshot={}){
  const removable=[];
  for(let index=0;index<storage.length;index++){
    const key=storage.key(index);
    if(key?.startsWith('niviontech_')&&!EXCLUDED_KEYS.has(key))removable.push(key);
  }
  removable.forEach(key=>storage.removeItem(key));
  Object.entries(snapshot).forEach(([key,value])=>{
    if(key.startsWith('niviontech_')&&!EXCLUDED_KEYS.has(key))storage.setItem(key,String(value));
  });
}

export function snapshotFingerprint(snapshot={}){
  const input=JSON.stringify(Object.fromEntries(Object.entries(snapshot).sort(([left],[right])=>left.localeCompare(right))));
  let hash=2166136261;
  for(let index=0;index<input.length;index++){hash^=input.charCodeAt(index);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(16).padStart(8,'0');
}

export function hasLocalCrmData(snapshot={}){
  return Boolean(snapshot.niviontech_owner||snapshot.niviontech_company||snapshot.niviontech_users);
}

export function resolveStartupSync({localSnapshot={},cloudSnapshot=null,meta=null}){
  const localFingerprint=snapshotFingerprint(localSnapshot);
  if(!cloudSnapshot)return{action:hasLocalCrmData(localSnapshot)?'upload':'noop',localFingerprint};
  const cloudFingerprint=snapshotFingerprint(cloudSnapshot.payload||{});
  if(!hasLocalCrmData(localSnapshot))return{action:hasLocalCrmData(cloudSnapshot.payload||{})?'download':'noop',localFingerprint,cloudFingerprint};
  if(!meta)return{action:localFingerprint===cloudFingerprint?'accept':'conflict',localFingerprint,cloudFingerprint};
  const revision=Number(meta.revision||0),cloudRevision=Number(cloudSnapshot.revision||0);
  if(cloudRevision>revision)return{action:localFingerprint===meta.fingerprint?'download':'conflict',localFingerprint,cloudFingerprint};
  if(cloudRevision<revision)return{action:'upload',localFingerprint,cloudFingerprint};
  return{action:localFingerprint===meta.fingerprint?'noop':'upload',localFingerprint,cloudFingerprint};
}
