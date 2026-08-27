export const authDomain=Object.freeze({name:'auth',label:'Acesso e sessão segura'});

export function withoutLocalCredentials(user={}){
  const clean={...user};
  ['password','passwordHash','salt','password_hash','passwordSalt'].forEach(key=>delete clean[key]);
  return clean;
}

export function migrateClerkIdentity(storage,sessionStorage,identity={}){
  let previous={};
  try{previous=JSON.parse(storage.getItem('niviontech_owner'))||{}}catch{}
  const owner=withoutLocalCredentials({...previous,id:'owner',clerkUserId:identity.userId,orgId:identity.orgId,name:identity.name||previous.name||'Proprietário',email:String(identity.email||previous.email||'').toLowerCase(),role:'Proprietário/Admin',profile:identity.profile||'Proprietário/Admin',visibility:'all',status:'active',onboardingComplete:previous.onboardingComplete??Boolean(storage.getItem('niviontech_company'))});
  storage.setItem('niviontech_owner',JSON.stringify(owner));
  let users=[];
  try{users=JSON.parse(storage.getItem('niviontech_users'))||[]}catch{}
  const cleaned=Array.isArray(users)?users.map(withoutLocalCredentials):[];
  const index=cleaned.findIndex(user=>user.id==='owner'||String(user.email||'').toLowerCase()===owner.email);
  if(index>=0)cleaned[index]={...cleaned[index],...owner};else cleaned.unshift(owner);
  storage.setItem('niviontech_users',JSON.stringify(cleaned));
  sessionStorage.setItem('niviontech_session',owner.id);
  storage.setItem('niviontech_auth_migrated_at',new Date().toISOString());
  return owner;
}
