import {authDomain} from './modules/auth.js';
import {onboardingDomain} from './modules/onboarding.js';
import {pipelineDomain,validateNegotiation,applyWonDealRules,applyLostDealRules,commercialPipelineStages,findStaleDeals,getStaleDealDays,saveStaleDealDays,calculateDealHealth} from './modules/pipeline.js';
import {clientsDomain,mergeClientData,validateClientRegistration} from './modules/clients.js';
import {activitiesDomain,todayISO,formatDate,rankTodayActivities} from './modules/activities.js';
import {proposalsDomain,proposalStatusLabel} from './modules/proposals.js';
import {receiptsDomain,applyReceiptRules,createProvisionalReceipt} from './modules/receipts.js';
import {reportsDomain} from './modules/reports.js';
import {teamDomain} from './modules/team.js';
import {organizeDomain,analyzeConversationText,createHandoffSummary} from './modules/organize.js';
import {SYNC_META_KEY,SYNC_DEVICE_KEY,collectSyncStorage,replaceSyncStorage,snapshotFingerprint,resolveStartupSync} from './modules/sync.js';

const domainModules=Object.freeze([authDomain,onboardingDomain,pipelineDomain,clientsDomain,activitiesDomain,proposalsDomain,receiptsDomain,reportsDomain,teamDomain,organizeDomain]);

const STORAGE={owner:'niviontech_owner',company:'niviontech_company'};
const NEW_MENU_ITEMS=['organize'];
const SESSION='niviontech_session';
const USERS_KEY='niviontech_users';
const PIPELINE_KEY='niviontech_pipeline';
const CLIENTS_KEY='niviontech_clients';
const ACTIVITIES_KEY='niviontech_activities';
const PROPOSALS_KEY='niviontech_proposals';
const PIPELINE_CONFIG_KEY='niviontech_pipeline_config';

function createStore(key,initialData,{normalize,afterSave}={}){
  return{
    get(){
      try{
        const data=JSON.parse(localStorage.getItem(key))||initialData;
        return normalize?normalize(data):data;
      }catch{
        return initialData;
      }
    },
    save(data){
      localStorage.setItem(key,JSON.stringify(data));
      if(afterSave)afterSave(data);
    }
  };
}
const $=selector=>document.querySelector(selector);




const outcomeStages=[{id:'won',label:'Ganhou'},{id:'after-sales',label:'Pós-venda'},{id:'lost',label:'Perdido'}];
function withOutcomeStages(stages=[]){const result=stages.map(stage=>Array.isArray(stage)?{id:stage[0],label:stage[1]}:{...stage});outcomeStages.forEach(stage=>{if(!result.some(item=>item.id===stage.id))result.push({...stage})});return result}
const funnelTemplates=[{id:'essential',name:'Funil essencial',icon:'◇',description:'Estrutura curta para começar rapidamente sem excesso de etapas.',stages:[['new','Novo lead'],['qualified','Qualificado'],['proposal','Proposta'],['closing','Fechamento'],['won','Ganhou'],['after-sales','Pós-venda'],['lost','Perdido']]},{id:'services',name:'Serviços e Orçamentos',icon:'▤',description:'Para manutenção, instalação, reformas, agências e consultorias.',stages:[['new-contact','Novo contato'],['understanding','Entendimento'],['budget','Orçamento'],['negotiation','Negociação'],['approved','Aprovado'],['execution','Execução'],['receipt','Recebimento']]},{id:'whatsapp',name:'Venda rápida pelo WhatsApp',icon:'◌',description:'Para muitas conversas, ofertas rápidas e retornos frequentes.',stages:[['conversation','Nova conversa'],['interest','Interesse identificado'],['offer','Oferta enviada'],['waiting','Aguardando resposta'],['closed','Fechado']]},{id:'b2b',name:'Venda consultiva B2B',icon:'◎',description:'Para negociações de maior valor com passagem entre funções.',stages:[['lead','Lead'],['qualification','Qualificação SDR'],['diagnosis','Diagnóstico'],['proposal-b2b','Proposta'],['negotiation-b2b','Negociação'],['closing-b2b','Fechamento'],['aftersales','Pós-venda']]}];
function loadPipelineConfig(){try{const saved=JSON.parse(localStorage.getItem(PIPELINE_CONFIG_KEY));if(saved?.stages){const migrated={...saved,stages:withOutcomeStages(saved.stages)};localStorage.setItem(PIPELINE_CONFIG_KEY,JSON.stringify(migrated));return migrated}return{templateId:'essential',stages:funnelTemplates[0].stages.map(([id,label])=>({id,label}))}}catch{return{templateId:'essential',stages:funnelTemplates[0].stages.map(([id,label])=>({id,label}))}}}
let pipelineConfig=loadPipelineConfig();
let pipelineStages=pipelineConfig.stages;
const initialDeals=[{id:'deal-1',title:'Sistema de gestão',client:'Almeida Engenharia',value:12500,stage:'proposal',owner:'Admin',next:'Apresentar proposta'},{id:'deal-2',title:'Plano comercial anual',client:'Café do Cerrado',value:4800,stage:'qualified',owner:'Admin',next:'Reunião de diagnóstico'},{id:'deal-3',title:'Implantação CRM',client:'Studio Aurora',value:7900,stage:'closing',owner:'Admin',next:'Aprovar contrato'},{id:'deal-4',title:'Consultoria inicial',client:'Mercado Bom Vizinho',value:2200,stage:'new',owner:'Admin',next:'Realizar primeiro contato'}];
const initialClients=[{id:'client-1',name:'Almeida Engenharia',segment:'Construção',status:'Cliente',city:'Goiânia, GO',phone:'(62) 99912-3401',email:'contato@almeida.com.br'},{id:'client-2',name:'Café do Cerrado',segment:'Alimentos',status:'Prospect',city:'Anápolis, GO',phone:'(62) 99220-1840',email:'vendas@cafecerrado.com.br'},{id:'client-3',name:'Studio Aurora',segment:'Serviços',status:'Cliente',city:'Brasília, DF',phone:'(61) 99873-5521',email:'oi@studioaurora.com.br'}];







const initialProposals=[{id:'proposal-1',title:'Proposta de implantação',client:'Almeida Engenharia',dealId:'deal-1',value:12500,validUntil:new Date(Date.now()+7*86400000).toISOString().slice(0,10),status:'sent',notes:'Condições comerciais apresentadas',createdAt:new Date().toISOString()}];
const initialActivities=[{id:'activity-1',title:'Apresentar proposta',type:'Reunião',client:'Almeida Engenharia',date:new Date().toISOString().slice(0,10),time:'10:00',note:'Apresentar condições comerciais',done:false},{id:'activity-2',title:'Retornar contato',type:'Ligação',client:'Café do Cerrado',date:new Date().toISOString().slice(0,10),time:'14:30',note:'Confirmar necessidades',done:false},{id:'activity-3',title:'Revisar contrato',type:'Tarefa',client:'Studio Aurora',date:new Date().toISOString().slice(0,10),time:'16:00',note:'Validar cláusulas finais',done:false}];

async function derivePassword(password,salt){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:120000,hash:'SHA-256'},material,256);
  return Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function getOwner(){try{return JSON.parse(localStorage.getItem(STORAGE.owner))}catch{return null}}
function getCompany(){try{const company=JSON.parse(localStorage.getItem(STORAGE.company));if(company&&!company.plan){company.plan='essential';localStorage.setItem(STORAGE.company,JSON.stringify(company))}return company}catch{return null}}
function companyPlanLabel(plan){return{essential:'Essencial',team:'Equipe',performance:'Performance'}[plan]||'Essencial'}
function getUsers(){try{const stored=JSON.parse(localStorage.getItem(USERS_KEY));if(Array.isArray(stored)&&stored.length)return stored;const owner=getOwner();return owner?[{...owner,id:owner.id||'owner',profile:'Proprietário/Admin',visibility:'all',status:'active'}]:[]}catch{return []}}
function saveUsers(users){localStorage.setItem(USERS_KEY,JSON.stringify(users))}
function getGoals(){try{const stored=JSON.parse(localStorage.getItem('niviontech_sales_goals'));return stored&&typeof stored==='object'?stored:{}}catch{return{}}}
function saveGoals(goals){localStorage.setItem('niviontech_sales_goals',JSON.stringify(goals))}
function goalPeriodNow(){return new Date().toISOString().slice(0,7)}
function activeSellers(users=getUsers()){return users.filter(user=>user.status==='active'&&['Colaborador comercial','SDR','Executivo de Contas'].includes(user.profile))}
function canManageGoals(){return['Proprietário/Admin','Gestor Comercial'].includes(appState.currentUser?.profile)}
function getRankingVisibility(){return localStorage.getItem('niviontech_ranking_visibility')==='public'?'public':'private'}
function canUsePerformanceFeatures(){return getCompany()?.plan==='performance'&&activeSellers().length>1}
function canSeeRanking(){return canUsePerformanceFeatures()&&(canManageGoals()||getRankingVisibility()==='public')}
function syncRankingAccess(){const unlocked=canUsePerformanceFeatures(),nav=$('#rankingNav'),goals=$('#salesGoalsEditor');if(nav)nav.hidden=!canSeeRanking();if(goals){if(unlocked)goals.style.removeProperty('display');else goals.style.setProperty('display','none','important')}if(!unlocked&&appState.currentView==='ranking')showView('today')}
function belongsToGoalPeriod(value,period){return Boolean(value)&&String(value).slice(0,7)===period}
function sellerPerformance(user,period){
  const owner=String(user.name||'').trim().toLocaleLowerCase('pt-BR'),owned=record=>String(record.owner||'').trim().toLocaleLowerCase('pt-BR')===owner;
  const sold=getDeals().filter(deal=>owned(deal)&&deal.status==='won'&&belongsToGoalPeriod(deal.wonAt||deal.updatedAt||deal.createdAt,period)).reduce((sum,deal)=>sum+Number(deal.value||0),0);
  const received=getDeals().filter(deal=>owned(deal)&&Number(deal.receivedAmount||0)>0&&belongsToGoalPeriod(deal.receivedAt||deal.updatedAt||deal.wonAt||deal.createdAt,period)).reduce((sum,deal)=>sum+Number(deal.receivedAmount||0),0);
  const activities=getActivities().filter(activity=>owned(activity)&&activity.done&&belongsToGoalPeriod(activity.completedAt||activity.date,period)).length;
  return{sold,received,activities};
}
function teamPerformanceForGoals(sellers,period){return sellers.map(user=>sellerPerformance(user,period)).reduce((total,item)=>({sold:total.sold+item.sold,received:total.received+item.received,activities:total.activities+item.activities}),{sold:0,received:0,activities:0})}
function calculateGoalProgress(actual={},target={}){const metrics=['sold','received','activities'],ratios=metrics.filter(key=>Number(target[key])>0).map(key=>Number(actual[key]||0)/Number(target[key])*100);return{percent:ratios.length?Math.round(ratios.reduce((sum,value)=>sum+value,0)/ratios.length):0,metrics:Object.fromEntries(metrics.map(key=>[key,Number(target[key])>0?Math.round(Number(actual[key]||0)/Number(target[key])*100):0]))}}
function goalProgressMarkup(actual,target){const progress=calculateGoalProgress(actual,target),title=`Vendido ${progress.metrics.sold}% · Recebido ${progress.metrics.received}% · Atividades ${progress.metrics.activities}%`;return `<div class="goal-progress" title="${title}"><div><strong>${progress.percent}%</strong><small>da meta</small></div><span><i style="width:${Math.min(100,progress.percent)}%"></i></span><p>V ${progress.metrics.sold}% · R ${progress.metrics.received}% · A ${progress.metrics.activities}%</p></div>`}
function activityWeekStart(value){const date=new Date(`${String(value).slice(0,10)}T12:00:00`);if(Number.isNaN(date.getTime()))return null;const day=(date.getDay()+6)%7;date.setDate(date.getDate()-day);date.setHours(12,0,0,0);return date}
function weeklyActivityStreak(user){
  const owner=String(user.name||'').trim().toLocaleLowerCase('pt-BR'),weeks=new Map();
  getActivities().filter(activity=>String(activity.owner||'').trim().toLocaleLowerCase('pt-BR')===owner).forEach(activity=>{const week=activityWeekStart(activity.date);if(!week)return;const key=week.toISOString().slice(0,10),due=new Date(`${activity.date}T23:59:59`),completed=activity.completedAt?new Date(activity.completedAt):null,onTime=activity.done&&completed&&!Number.isNaN(completed.getTime())&&completed<=due;const record=weeks.get(key)||{date:week,allOnTime:true,count:0};record.count++;record.allOnTime=record.allOnTime&&onTime;weeks.set(key,record)});
  const good=[...weeks.values()].filter(week=>week.count&&week.allOnTime).sort((a,b)=>b.date-a.date);if(!good.length)return 0;let streak=1;for(let index=1;index<good.length;index++){if(Math.round((good[index-1].date-good[index].date)/86400000)!==7)break;streak++}return streak;
}
function sellerRecognition(user,progress){const badges=[];[50,75,100].forEach(mark=>{if(progress.percent>=mark)badges.push(`<span class="recognition-badge milestone-${mark}">✓ ${mark===100?'Meta atingida':'Marco de '+mark+'%'}</span>`)});const streak=weeklyActivityStreak(user);if(streak>=2)badges.push(`<span class="recognition-badge streak">↗ ${streak} semanas em dia</span>`);const next=[50,75,100].find(mark=>progress.percent<mark);return badges.length?badges.join(''):next?`<small>Próximo reconhecimento em ${next}%</small>`:'<small>Meta superada</small>'}
function activeSessionUser(){const id=sessionStorage.getItem(SESSION);const users=getUsers();return id==='active'?users.find(user=>user.profile==='Proprietário/Admin')||users[0]:users.find(user=>user.id===id)}
function createSalt(){return crypto.getRandomValues(new Uint32Array(4)).join('-')}
function setScreen(name){['authScreen','onboardingScreen','appScreen'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==name))}

const cloudSyncState={enabled:false,busy:false,conflict:null,timer:null,status:'Conectando à proteção privada...',tone:'neutral',orgId:null,role:null,inviteCode:null};
function syncDeviceId(){let id=localStorage.getItem(SYNC_DEVICE_KEY);if(!id){id=crypto.randomUUID();localStorage.setItem(SYNC_DEVICE_KEY,id)}return id}
function readSyncMeta(){try{return JSON.parse(localStorage.getItem(SYNC_META_KEY))}catch{return null}}
function saveSyncMeta(snapshot){const meta={revision:Number(snapshot?.revision||0),fingerprint:snapshotFingerprint(collectSyncStorage(localStorage)),updatedAt:snapshot?.updatedAt||new Date().toISOString()};localStorage.setItem(SYNC_META_KEY,JSON.stringify(meta));return meta}
function setCloudSyncStatus(status,tone='neutral'){cloudSyncState.status=status;cloudSyncState.tone=tone;const element=$('#cloudSyncStatus');if(element){element.textContent=status;element.dataset.tone=tone}}
async function cloudSyncRequest(method='GET',body){
  const response=await fetch('/api/sync',{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));
  if(response.status===401)return{localOnly:true};
  if(response.status===409)return{conflict:true,...data};
  if(!response.ok)throw new Error(data.error||'sync_unavailable');
  return data;
}
async function uploadCloudSnapshot({force=false}={}){
  if(cloudSyncState.busy)return null;
  cloudSyncState.busy=true;setCloudSyncStatus('Salvando alterações na nuvem privada...');
  try{
    const meta=readSyncMeta(),payload=collectSyncStorage(localStorage),result=await cloudSyncRequest('POST',{payload,baseRevision:Number(meta?.revision||0),deviceId:syncDeviceId(),force});
    if(result.localOnly){cloudSyncState.enabled=false;setCloudSyncStatus('Dados protegidos neste dispositivo','warning');return null}
    if(result.conflict){cloudSyncState.conflict=result.snapshot;setCloudSyncStatus('Há duas versões aguardando sua escolha','warning');updateCloudSyncPanel();return null}
    cloudSyncState.conflict=null;saveSyncMeta(result.snapshot);setCloudSyncStatus('Tudo salvo na nuvem privada','success');updateCloudSyncPanel();return result.snapshot;
  }catch{setCloudSyncStatus(navigator.onLine?'Nuvem temporariamente indisponível; dados preservados aqui':'Modo offline: dados preservados neste dispositivo','warning');return null}
  finally{cloudSyncState.busy=false}
}
async function flushCloudSync(){
  if(!cloudSyncState.enabled||cloudSyncState.busy||cloudSyncState.conflict)return;
  const meta=readSyncMeta(),fingerprint=snapshotFingerprint(collectSyncStorage(localStorage));
  if(fingerprint!==meta?.fingerprint)await uploadCloudSnapshot();
}
function startCloudSyncWatch(){clearInterval(cloudSyncState.timer);cloudSyncState.timer=setInterval(flushCloudSync,3000);window.addEventListener('online',flushCloudSync)}
async function bootstrapCloudSync(){
  try{
    const result=await cloudSyncRequest();
    if(result.localOnly){setCloudSyncStatus('Dados protegidos neste dispositivo','warning');return{reloading:false}}
    cloudSyncState.enabled=true;cloudSyncState.orgId=result.orgId||null;cloudSyncState.role=result.role||null;if(result.inviteCode)cloudSyncState.inviteCode=result.inviteCode;renderTeamInviteCard();
    const localSnapshot=collectSyncStorage(localStorage),decision=resolveStartupSync({localSnapshot,cloudSnapshot:result.snapshot,meta:readSyncMeta()});
    if(decision.action==='download'){replaceSyncStorage(localStorage,result.snapshot.payload);saveSyncMeta(result.snapshot);location.reload();return{reloading:true}}
    if(decision.action==='upload')await uploadCloudSnapshot();
    else if(decision.action==='accept'){saveSyncMeta(result.snapshot);setCloudSyncStatus('Tudo salvo na nuvem privada','success')}
    else if(decision.action==='conflict'){cloudSyncState.conflict=result.snapshot;setCloudSyncStatus('Há duas versões aguardando sua escolha','warning')}
    else{if(result.snapshot)saveSyncMeta(result.snapshot);setCloudSyncStatus(result.snapshot?'Tudo salvo na nuvem privada':'Proteção pronta para o primeiro cadastro','success')}
    startCloudSyncWatch();return{reloading:false};
  }catch{setCloudSyncStatus('Dados preservados localmente; sincronização aguardando conexão','warning');return{reloading:false}}
}
async function useCloudSnapshot(){
  if(!cloudSyncState.conflict||!confirm('Usar a versão salva na nuvem? Antes disso, o CRM baixará uma cópia dos dados atuais deste dispositivo.'))return;
  downloadFullLocalBackup('pre-cloud-restore');replaceSyncStorage(localStorage,cloudSyncState.conflict.payload);saveSyncMeta(cloudSyncState.conflict);location.reload();
}
async function useDeviceSnapshot(){if(confirm('Substituir a versão da nuvem pelos dados atuais deste dispositivo?'))await uploadCloudSnapshot({force:true})}
function updateCloudSyncPanel(){
  const status=$('#cloudSyncStatus');if(status){status.textContent=cloudSyncState.status;status.dataset.tone=cloudSyncState.tone}
  const conflict=$('#cloudSyncConflict');if(conflict)conflict.hidden=!cloudSyncState.conflict;
}
function installCloudSyncPanel(){
  const settings=$('#settingsView');if(!settings||$('#cloudSyncPanel'))return;
  settings.insertAdjacentHTML('beforeend','<section id="cloudSyncPanel" class="backup-protection cloud-sync-panel"><div class="backup-protection-icon"><span>O</span></div><div class="backup-protection-copy"><small>PROTEÇÃO ORBIT</small><h3>Sincronização privada</h3><p>Seus clientes, oportunidades e atividades ficam disponíveis com segurança em seus dispositivos.</p><span id="cloudSyncStatus">Conectando à proteção privada...</span></div><div class="backup-protection-actions"><button type="button" id="syncNow">Sincronizar agora</button></div><div id="cloudSyncConflict" class="backup-protection-note sync-conflict" hidden><strong>Ação necessária</strong><span>Há alterações diferentes neste dispositivo e na nuvem.</span><button type="button" id="useDeviceSnapshot">Usar este dispositivo</button><button type="button" id="useCloudSnapshot">Usar versão da nuvem</button></div></section>');
  $('#syncNow').onclick=()=>uploadCloudSnapshot();$('#useDeviceSnapshot').onclick=useDeviceSnapshot;$('#useCloudSnapshot').onclick=useCloudSnapshot;updateCloudSyncPanel();
}

function installTeamInviteCard(){
  const grid=$('#teamGrid');
  if(!grid||$('#teamInviteCard'))return;
  grid.insertAdjacentHTML('beforebegin','<section id="teamInviteCard" class="panel-card team-invite-card"><h3>Convite da equipe</h3><p>Compartilhe este código para que um colega entre com os mesmos clientes, negociações e atividades da empresa, em qualquer dispositivo.</p><div class="invite-code-row"><code id="teamInviteCode">••••-••••</code><button type="button" id="copyInviteCode" class="secondary">Copiar código</button></div><small id="teamInviteHint"></small></section>');
  $('#copyInviteCode').onclick=async()=>{
    const code=cloudSyncState.inviteCode;if(!code)return;
    try{await navigator.clipboard.writeText(code)}catch{}
    const button=$('#copyInviteCode');if(!button)return;const original=button.textContent;button.textContent='Copiado ✓';setTimeout(()=>{button.textContent=original},1600);
  };
}
function renderTeamInviteCard(){
  installTeamInviteCard();
  const card=$('#teamInviteCard');if(!card)return;
  const isOwner=appState.currentUser?.profile==='Proprietário/Admin';
  card.classList.toggle('hidden',!isOwner);
  if(!isOwner)return;
  $('#teamInviteCode').textContent=cloudSyncState.inviteCode||'Sincronizando...';
  $('#teamInviteHint').textContent=cloudSyncState.inviteCode?'Válido enquanto a organização existir. Peça para o colega usar “Já tem uma equipe?” na tela inicial.':'Aguarde a sincronização com a nuvem para gerar o código.';
}

function setJoinTeamMode(active){
  $('#accessForm').classList.toggle('hidden',active);
  $('#joinTeamToggleGroup').classList.toggle('hidden',active);
  $('#joinTeamForm').classList.toggle('hidden',!active);
  $('#joinTeamMessage').textContent='';
}
async function joinTeamWithCode(inviteCode){
  const response=await fetch('/api/sync/join',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({inviteCode})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const messages={invite_code_required:'Informe o código de convite.',invite_not_found:'Não encontramos esse código. Confira com quem te convidou.',already_in_another_org:'Este dispositivo já está associado a outra empresa.',authentication_required:'Não foi possível confirmar seu acesso agora. Tente novamente em instantes.'};
    throw new Error(messages[data.error]||'Não foi possível entrar com este código agora.');
  }
  return data;
}
function setupJoinTeamFlow(){
  const toggle=$('#joinTeamToggle'),back=$('#joinTeamBack'),form=$('#joinTeamForm');
  if(!toggle||!form)return;
  toggle.onclick=()=>setJoinTeamMode(true);
  back.onclick=()=>setJoinTeamMode(false);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=$('#joinTeamButton'),message=$('#joinTeamMessage'),code=$('#joinTeamCode').value.trim();
    message.textContent='';button.disabled=true;button.textContent='Entrando...';
    try{
      const data=await joinTeamWithCode(code);
      if(!data.snapshot){message.textContent='Código válido, mas a empresa ainda não tem dados sincronizados. Peça para o Proprietário/Admin sincronizar antes de convidar.';button.disabled=false;button.textContent='Entrar na equipe';return}
      replaceSyncStorage(localStorage,data.snapshot.payload);saveSyncMeta(data.snapshot);location.reload();
    }catch(error){message.textContent=error.message;button.disabled=false;button.textContent='Entrar na equipe'}
  });
}

function initialize(){
  const owner=getOwner();
  const sessionUser=activeSessionUser();
  if(sessionUser&&owner){appState.currentUser=sessionUser;owner.onboardingComplete?openDashboard(sessionUser):openOnboarding();return}
  setScreen('authScreen');
  setJoinTeamMode(false);
  $('#joinTeamToggleGroup').classList.toggle('hidden',Boolean(owner));
  if(owner){
    $('#accessLabel').textContent='BEM-VINDO DE VOLTA';
    $('#accessTitle').textContent='Acesse sua empresa';
    $('#accessDescription').textContent='Entre para continuar seu dia comercial.';
    $('#nameGroup').classList.add('hidden');
    $('#ownerEmail').value=owner.email;
    $('#accessButton').textContent='Entrar';
  }
}

$('#accessForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#accessButton');
  const message=$('#accessMessage');
  const owner=getOwner();
  const email=$('#ownerEmail').value.trim().toLowerCase();
  const password=$('#ownerPassword').value;
  message.textContent='';
  button.disabled=true;
  button.textContent='Validando...';
  try{
    if(!owner){
      const name=$('#ownerName').value.trim();
      if(name.length<2)throw new Error('Informe seu nome para continuar.');
      const salt=createSalt();
      const record={id:'owner',name,email,salt,passwordHash:await derivePassword(password,salt),role:'Proprietário/Admin',profile:'Proprietário/Admin',visibility:'all',status:'active',onboardingComplete:false,createdAt:new Date().toISOString()};
      localStorage.setItem(STORAGE.owner,JSON.stringify(record));
      saveUsers([record]);appState.currentUser=record;
      sessionStorage.setItem(SESSION,record.id);
      openOnboarding();
    }else{
      const user=getUsers().find(item=>item.email.toLowerCase()===email&&item.status!=='inactive');
      const validPassword=user&&await derivePassword(password,user.salt)===user.passwordHash;
      if(!user||!validPassword)throw new Error('E-mail ou senha incorretos, ou acesso inativo.');
      appState.currentUser=user;sessionStorage.setItem(SESSION,user.id);
      owner.onboardingComplete?openDashboard(user):openOnboarding();
    }
  }catch(error){message.textContent=error.message}
  finally{button.disabled=false;button.textContent=owner?'Entrar':'Criar meu acesso'}
});

const appState={onboardingStep:0,onboardingDraft:{},currentView:'today',currentUser:null,activeClientFilter:'Todos',activeActivityFilter:'pending',activeDealId:null,activeClientId:null,lastMoveAction:null,undoTimer:null,activeProposalFilter:'all',pendingClientMerge:null};
const steps=[
  {title:'Conte um pouco sobre sua empresa',intro:'Isso ajuda o Orbit a preparar uma experiência mais adequada.',tip:'O plano é apenas uma configuração nesta fase. Não existe cobrança associada.',html:()=>`<div class="onboarding-fields"><label>Nome da empresa<input id="companyName" value="${appState.onboardingDraft.name||''}" placeholder="Ex.: NivionTech" required></label><label>Segmento<input id="companySegment" value="${appState.onboardingDraft.segment||''}" placeholder="Ex.: Serviços"></label><label>Tamanho da equipe<select id="companySize"><option>Somente eu</option><option>2 a 5 pessoas</option><option>6 a 15 pessoas</option><option>Mais de 15 pessoas</option></select></label><label>Plano da empresa<select id="companyPlan"><option value="essential">Essencial</option><option value="team">Equipe</option><option value="performance">Performance</option></select></label></div>`},
  {title:'Como vocês vendem hoje?',intro:'Escolha a opção que mais representa sua rotina comercial.',tip:'Não existe resposta errada. O objetivo é adaptar o CRM à sua realidade.',html:()=>`<div class="choice-grid" data-choice="salesModel"><button class="choice" data-value="WhatsApp"><span>◌</span><strong>Principalmente WhatsApp</strong><small>Conversas e retornos manuais</small></button><button class="choice" data-value="Planilhas"><span>▦</span><strong>Planilhas e anotações</strong><small>Controle distribuído</small></button><button class="choice" data-value="Processo"><span>◇</span><strong>Já temos um processo</strong><small>Etapas comerciais definidas</small></button></div>`},
  {title:'Qual é sua principal prioridade?',intro:'O Orbit usará essa escolha para organizar sua primeira tela “Hoje”.',tip:'Sua implantação está quase pronta. Depois desta etapa, você entrará no CRM.',html:()=>`<div class="choice-grid" data-choice="priority"><button class="choice" data-value="Organizar"><span>✓</span><strong>Organizar contatos</strong><small>Centralizar clientes e histórico</small></button><button class="choice" data-value="Vender"><span>↗</span><strong>Vender mais</strong><small>Acompanhar oportunidades</small></button><button class="choice" data-value="Cobrar"><span>R$</span><strong>Receber melhor</strong><small>Seguir até o pagamento</small></button></div>`}
];

function openOnboarding(){setScreen('onboardingScreen');appState.onboardingStep=0;appState.onboardingDraft=getCompany()||{};renderOnboarding()}
function renderOnboarding(){
  const step=steps[appState.onboardingStep];
  $('#stepCounter').textContent=`${appState.onboardingStep+1} DE ${steps.length}`;
  $('#progressBar').style.width=`${((appState.onboardingStep+1)/steps.length)*100}%`;
  $('#onboardingContent').innerHTML=`<h1>${step.title}</h1><p class="intro">${step.intro}</p>${step.html()}`;
  if(appState.onboardingStep===0){$('#companySize').value=appState.onboardingDraft.size||'Somente eu';$('#companyPlan').value=appState.onboardingDraft.plan||'essential'}
  $('#orbitTipText').textContent=step.tip;
  $('#backStep').style.visibility=appState.onboardingStep===0?'hidden':'visible';
  $('#nextStep').textContent=appState.onboardingStep===steps.length-1?'Entrar no NivionTech CRM':'Continuar';
  document.querySelectorAll('.choice').forEach(choice=>{
    const key=choice.parentElement.dataset.choice;
    choice.classList.toggle('selected',appState.onboardingDraft[key]===choice.dataset.value);
    choice.onclick=()=>{appState.onboardingDraft[key]=choice.dataset.value;choice.parentElement.querySelectorAll('.choice').forEach(item=>item.classList.toggle('selected',item===choice))};
  });
}

function captureStep(){
  if(appState.onboardingStep===0){
    const name=$('#companyName').value.trim();
    if(!name){$('#companyName').focus();return false}
    appState.onboardingDraft.name=name;
    appState.onboardingDraft.segment=$('#companySegment').value.trim();
    appState.onboardingDraft.size=$('#companySize').value;
    appState.onboardingDraft.plan=$('#companyPlan').value;
  }
  if(appState.onboardingStep===1&&!appState.onboardingDraft.salesModel)return false;
  if(appState.onboardingStep===2&&!appState.onboardingDraft.priority)return false;
  return true;
}

$('#nextStep').onclick=()=>{
  if(!captureStep())return;
  if(appState.onboardingStep<steps.length-1){appState.onboardingStep++;renderOnboarding();return}
  localStorage.setItem(STORAGE.company,JSON.stringify({...appState.onboardingDraft,configuredAt:new Date().toISOString()}));
  const owner=getOwner();owner.onboardingComplete=true;localStorage.setItem(STORAGE.owner,JSON.stringify(owner));openDashboard(owner);
};
$('#backStep').onclick=()=>{if(appState.onboardingStep>0){appState.onboardingStep--;renderOnboarding()}};

function openDashboard(owner){
  setScreen('appScreen');
  appState.currentUser=owner;$('#profileName').textContent=owner.name;$('#profileRole').textContent=owner.profile||'Proprietário/Admin';
  $('#profileInitial').textContent=owner.name.charAt(0).toUpperCase();
  $('#welcomeTitle').textContent=`Olá, ${owner.name.split(' ')[0]}.`;
  const now=new Date(),weekday=new Intl.DateTimeFormat('pt-BR',{weekday:'long'}).format(now),fullDate=new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric'}).format(now);
  $('#todayWeekday').textContent=weekday.charAt(0).toUpperCase()+weekday.slice(1);
  $('#todayDate').textContent=fullDate;
  $('#dealOwner').value=owner.name;
  document.querySelectorAll('.admin-only').forEach(element=>element.classList.toggle('admin-hidden',owner.profile!=='Proprietário/Admin'));
  document.querySelectorAll('.manager-only').forEach(element=>element.classList.toggle('admin-hidden',!['Proprietário/Admin','Gestor Comercial'].includes(owner.profile)));
  document.querySelectorAll('[data-view="settings"]').forEach(element=>element.classList.toggle('admin-hidden',owner.profile!=='Proprietário/Admin'));
  syncRankingAccess();
  showView('today');
}

const dealsStore=createStore(PIPELINE_KEY,initialDeals,{normalize:items=>items.map(item=>({...item,createdAt:item.createdAt||new Date().toISOString(),nextDate:item.nextDate||todayISO()}))});
function getDeals(){return dealsStore.get()}
function saveDeals(deals){dealsStore.save(deals)}
function formatMoney(value){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(value||0))}
function escapeHtml(value=''){return String(value).replace(/[&<>'\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]))}
function ownerInitials(name='Admin'){return name.split(' ').slice(0,2).map(part=>part[0]).join('').toUpperCase()}

function showView(view){
  if(view==='team'&&!canManageGoals())view='today';
  if((view==='settings'||view==='templates')&&appState.currentUser?.profile!=='Proprietário/Admin')view='today';
  if(view==='ranking'&&!canSeeRanking())view='today';
  appState.currentView=view;
  const pipeline=view==='pipeline';
  const clients=view==='clients';
  const activities=view==='activities';
  const organize=view==='organize',ranking=view==='ranking',proposals=view==='proposals',receipts=view==='receipts',settings=view==='settings',team=view==='team',templates=view==='templates',reports=view==='reports';
  const secondary=pipeline||clients||activities||organize||ranking||proposals||receipts||settings||team||templates||reports;
  $('#todayView').classList.toggle('hidden',secondary);
  $('#pipelineView').classList.toggle('hidden',!pipeline);
  $('#clientsView').classList.toggle('hidden',!clients);
  $('#activitiesView').classList.toggle('hidden',!activities);
  $('#organizeView').classList.toggle('hidden',!organize);$('#proposalsView').classList.toggle('hidden',!proposals);$('#receiptsView').classList.toggle('hidden',!receipts);$('#settingsView').classList.toggle('hidden',!settings);
  $('#rankingView').classList.toggle('hidden',!ranking);
  $('#teamView').classList.toggle('hidden',!team);
  $('#templatesView').classList.toggle('hidden',!templates);
  $('#reportsView').classList.toggle('hidden',!reports);
  const titles={today:['Hoje','Seu resumo comercial'],pipeline:['Funil','Oportunidades em movimento'],clients:['Clientes','Sua base de relacionamentos'],activities:['Atividades','Sua rotina comercial'],organize:['Cole e organize','Orbit · Assistente local'],ranking:['Ranking','Progresso por percentual da meta'],proposals:['Propostas','Ofertas e decisões'],receipts:['Recebimentos','Da venda ao dinheiro'],reports:['Relatórios','Indicadores essenciais'],settings:['Configurações','Dados e portabilidade'],team:['Equipe e acessos','Papéis e permissões'],templates:['Modelos de funil','Implantação progressiva']};
  $('#pageTitle').textContent=titles[view][0];$('#pageSubtitle').textContent=titles[view][1];
  $('#newButton').style.display=['organize','ranking','settings','receipts','templates','reports'].includes(view)?'none':'block';
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  $('.sidebar').classList.remove('open');
  if(pipeline)renderPipeline();
  if(clients)renderClients();
  if(activities)renderActivities();
  if(proposals)renderProposals();
  if(receipts)renderReceipts();
  if(settings)renderSettings();
  if(team)renderTeam();
  if(ranking)renderRanking();
  if(templates)renderTemplates();
  if(reports)renderReports();
  if(view==='today'){renderDateCardIdentity();renderTodayActivities()}
}

function orbitEmptyState(title,message,className='empty-records'){return `<div class="${className} orbit-empty-state"><span class="orbit-empty-mark">O</span><strong>${title}</strong><p>${message}</p></div>`}
function contactDatesForClient(clientName){const normalized=String(clientName||'').trim().toLocaleLowerCase('pt-BR'),client=getClients().find(item=>item.name.trim().toLocaleLowerCase('pt-BR')===normalized),dates=[];(client?.interactions||[]).forEach(item=>{if(item.date)dates.push(item.date)});getActivities().filter(item=>item.client.trim().toLocaleLowerCase('pt-BR')===normalized&&item.done).forEach(item=>dates.push(item.completedAt||`${item.date}T${item.time||'12:00'}`));return dates.map(value=>new Date(value)).filter(date=>!Number.isNaN(date.getTime())&&date<=new Date())}
function daysWithoutContact(clientName,fallbackDate){const dates=contactDatesForClient(clientName);if(dates.length)return daysSince(new Date(Math.max(...dates.map(date=>date.getTime()))));return fallbackDate?daysSince(fallbackDate):null}
function daysWithoutContactLabel(clientName,fallbackDate){const days=daysWithoutContact(clientName,fallbackDate);return days===null?'Sem contato registrado':days===0?'Contato hoje':`${days} ${days===1?'dia':'dias'} sem contato`}
function assignLeadByRoundRobin(deal){const eligible=getUsers().filter(user=>user.status==='active'&&['Colaborador comercial','SDR'].includes(user.profile));if(eligible.length<2)return null;const key='niviontech_lead_round_robin_last',lastId=localStorage.getItem(key),lastIndex=eligible.findIndex(user=>user.id===lastId),selected=eligible[(lastIndex+1)%eligible.length];deal.owner=selected.name;deal.ownerRole=selected.profile;deal.distributionReason=`Foi para ${selected.name} porque é a vez ${selected.profile==='SDR'?'do SDR':'do colaborador'} no rodízio.`;deal.distributedAt=new Date().toISOString();localStorage.setItem(key,selected.id);addEntityHistory(deal,'Lead distribuído automaticamente',deal.distributionReason,{assignedUserId:selected.id});return selected}
function renderPipeline(search=''){
  installPipelineExportButton();
  const deals=dealsVisibleToCurrentUser(getDeals());
  const visible=deals.filter(deal=>(deal.title+' '+deal.client).toLowerCase().includes(search.toLowerCase()));
  const activeDeals=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost');
  $('#pipelineTotal').textContent=formatMoney(activeDeals.reduce((sum,deal)=>sum+Number(deal.value||0),0));
  $('#dealCount').textContent=activeDeals.length;
  $('#kanbanBoard').innerHTML=pipelineStages.map(stage=>{
    const stageDeals=visible.filter(deal=>deal.stage===stage.id);
    const total=stageDeals.reduce((sum,deal)=>sum+Number(deal.value),0);
    return `<section class="kanban-column" data-stage="${escapeHtml(stage.id)}"><header class="column-header"><div><i class="stage-dot"></i><h3>${escapeHtml(stage.label)}</h3><span class="column-count">${stageDeals.length}</span></div><span class="column-value">${formatMoney(total)}</span></header><div>${stageDeals.length?stageDeals.map(dealCard).join(''):orbitEmptyState('Etapa livre',`O Orbit avisa quando uma oportunidade estiver pronta para ${escapeHtml(stage.label.toLowerCase())}.`,'empty-column')}</div></section>`;
  }).join('');
  bindDragAndDrop();
}
function dealsVisibleToCurrentUser(deals){if(!appState.currentUser||appState.currentUser.profile==='Proprietário/Admin'||appState.currentUser.visibility==='all')return deals;return deals.filter(deal=>(deal.owner||'').trim().toLowerCase()===appState.currentUser.name.trim().toLowerCase())}

function daysSince(date){return Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/86400000))}
function clientForDeal(deal){return getClients().find(client=>client.name.trim().toLocaleLowerCase('pt-BR')===String(deal.client||'').trim().toLocaleLowerCase('pt-BR'))}
function healthForDeal(deal){const open=getDeals().filter(item=>item.status!=='lost'&&item.paymentStatus!=='received'),maxValue=Math.max(0,...open.map(item=>Number(item.value||0)));return calculateDealHealth(deal,clientForDeal(deal),maxValue)}
function dealCard(deal){const health=healthForDeal(deal),contactAge=daysWithoutContactLabel(deal.client,deal.createdAt);return `<article class="deal-card health-${health.tone} ${deal.status==='lost'?'lost':deal.status==='won'?'won':''}" draggable="true" data-deal-id="${escapeHtml(deal.id)}"><div class="deal-top"><h4>${escapeHtml(deal.title)}</h4><button type="button" data-open-deal="${escapeHtml(deal.id)}" title="Abrir ficha">•••</button></div><p class="deal-client">${escapeHtml(deal.client)}</p>${deal.distributionReason?`<small class="deal-assignment-reason">↻ ${escapeHtml(deal.distributionReason)}</small>`:''}<div class="deal-value-line"><strong class="deal-value">${formatMoney(deal.value)}</strong><span class="deal-health health-${health.tone}" title="${escapeHtml(health.reason)}"><i></i>Saúde ${health.score}</span></div><div class="deal-next"><small>PRÓXIMO PASSO · ${deal.nextDate===todayISO()?'HOJE':formatDate(deal.nextDate)}</small><p>${escapeHtml(deal.next)}</p></div><footer class="deal-footer"><span class="owner-avatar" title="${escapeHtml(deal.owner)}">${ownerInitials(deal.owner)}</span><span class="contact-age" title="Tempo desde a última interação">${escapeHtml(contactAge)}</span><span class="move-hint">${daysSince(deal.movedAt||deal.createdAt)}d na etapa</span><select class="card-move" data-move-deal="${escapeHtml(deal.id)}" aria-label="Mover ${escapeHtml(deal.title)} para outra etapa"><option value="">Mover para...</option>${pipelineStages.filter(stage=>stage.id!==deal.stage).map(stage=>`<option value="${escapeHtml(stage.id)}">${escapeHtml(stage.label)}</option>`).join('')}</select></footer></article>`}

function bindDragAndDrop(){
  document.querySelectorAll('.deal-card').forEach(card=>{
    card.ondragstart=event=>{if(event.target.closest('select')){event.preventDefault();return}event.dataTransfer.setData('text/plain',card.dataset.dealId);card.classList.add('dragging')};
    card.ondragend=()=>card.classList.remove('dragging');
    card.onclick=event=>{if(!event.target.closest('[data-open-deal]')&&!event.target.closest('[data-move-deal]')&&event.detail)openDealDrawer(card.dataset.dealId)};
  });
  document.querySelectorAll('[data-open-deal]').forEach(button=>button.onclick=event=>{event.stopPropagation();openDealDrawer(button.dataset.openDeal)});
  document.querySelectorAll('[data-move-deal]').forEach(select=>{select.onclick=event=>event.stopPropagation();select.onchange=()=>{if(select.value)moveDeal(select.dataset.moveDeal,select.value,'Menu Mover para')}});
  document.querySelectorAll('.kanban-column').forEach(column=>{
    column.ondragover=event=>{event.preventDefault();column.classList.add('drag-over')};
    column.ondragleave=()=>column.classList.remove('drag-over');
    column.ondrop=event=>{event.preventDefault();column.classList.remove('drag-over');moveDeal(event.dataTransfer.getData('text/plain'),column.dataset.stage,'Arrastar e soltar')};
  });
}

function moveDeal(id,newStage,method){const deals=getDeals();const deal=deals.find(item=>item.id===id);if(!deal||deal.stage===newStage)return;if(deal.paymentStatus==='received'&&!['won','after-sales'].includes(newStage)){alert('Um recebimento já confirmado não pode voltar para uma etapa comercial.');return}const previous=deal.stage,from=pipelineStages.find(stage=>stage.id===previous)?.label,to=pipelineStages.find(stage=>stage.id===newStage)?.label,trackedFields=['status','paymentStatus','wonAt','lostAt','receiptId','receiptCreatedAt','receiptProvisional','receivedAmount','dueDate','receivedAt'],previousState=Object.fromEntries(trackedFields.map(field=>[field,deal[field]])),firstWin=previousState.status!=='won'&&['won','after-sales'].includes(newStage);deal.stage=newStage;deal.movedAt=new Date().toISOString();if(['won','after-sales'].includes(newStage)){applyWonDealRules(deal,newStage);deal.wonAt=deal.wonAt||new Date().toISOString();if(!deal.receiptId)createProvisionalReceipt(deal)}else if(newStage==='lost'){applyLostDealRules(deal)}else if(deal.status==='won'||deal.status==='lost'){deal.status='open';deal.lostAt=null}addEntityHistory(deal,'Etapa alterada',`${from} → ${to} · ${method}`);saveDeals(deals);appState.lastMoveAction={dealId:id,from:previous,to:newStage,previousState};showUndo(`${deal.title}: ${from} → ${to}`);renderPipeline($('#dealSearch').value);if(firstWin){showMicroCelebration('sale',formatMoney(deal.value));openReceiptModal(deal.id,true)}}
function showUndo(message){clearTimeout(appState.undoTimer);$('#undoMessage').textContent=message;$('#undoToast').classList.remove('hidden');appState.undoTimer=setTimeout(hideUndo,8000)}
function hideUndo(){$('#undoToast').classList.add('hidden');appState.lastMoveAction=null;clearTimeout(appState.undoTimer)}
function undoLastMove(){if(!appState.lastMoveAction)return;const action=appState.lastMoveAction,deals=getDeals(),deal=deals.find(item=>item.id===action.dealId);if(deal&&deal.stage===action.to){const from=pipelineStages.find(stage=>stage.id===action.to)?.label,to=pipelineStages.find(stage=>stage.id===action.from)?.label;deal.stage=action.from;Object.entries(action.previousState||{}).forEach(([field,value])=>{if(value===undefined)delete deal[field];else deal[field]=value});addEntityHistory(deal,'Movimentação desfeita',`${from} → ${to}`);saveDeals(deals);renderPipeline($('#dealSearch').value)}hideUndo()}

function addEntityHistory(entity,title,text,metadata={}){entity.history=entity.history||[];entity.history.unshift({id:'history-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),title,text,date:new Date().toISOString(),actor:appState.currentUser?.name||getOwner()?.name||'Sistema',...metadata});return entity}
function openDealDrawer(id){
  const deal=getDeals().find(item=>item.id===id);if(!deal)return;appState.activeDealId=id;
  $('#drawerDealTitle').textContent=deal.title;$('#drawerDealClient').textContent=deal.client;$('#drawerDealValue').value=deal.value;$('#drawerDealOwner').value=deal.owner;$('#drawerDealNext').value=deal.next;$('#drawerDealNextDate').value=deal.nextDate||todayISO();
  $('#drawerDealRole').value=deal.ownerRole||'Colaborador comercial';$('#drawerTransferReason').value='';
  renderHandoffSummary(deal);
  const currentIndex=pipelineStages.findIndex(stage=>stage.id===deal.stage);
  $('#dealStageTrack').style.gridTemplateColumns='repeat('+pipelineStages.length+',minmax(72px,1fr))';
  $('#dealStageTrack').innerHTML=pipelineStages.map((stage,index)=>`<button class="deal-stage-step ${index<currentIndex?'done':''} ${index===currentIndex?'active':''}" data-detail-stage="${stage.id}">${stage.label}</button>`).join('');
  const won=deal.status==='won',lost=deal.status==='lost',received=deal.paymentStatus==='received';
  $('#drawerDealStatus').textContent=won?'Venda ganha':lost?'Venda perdida':'Em andamento';$('#drawerDealStatus').classList.toggle('won',won);
  $('#paymentBadge').textContent=received?'Pagamento recebido':won?'Aguardando recebimento':'Aguardando fechamento';$('#paymentBadge').classList.toggle('received',received);
  $('#markWon').disabled=won||lost;$('#markWon').textContent=won?'Venda ganha ✓':'Marcar como ganha';$('#markLost').disabled=won||lost;$('#markLost').textContent=lost?'Venda perdida ✓':'Marcar como perdida';$('#markReceived').disabled=!won||received;$('#markReceived').textContent=received?'Recebido ✓':'Confirmar recebimento';
  $('#dealHistory').innerHTML=(deal.history||[]).length?deal.history.map(item=>`<div class="history-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)} · ${new Date(item.date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</p></div>`).join(''):'<div class="history-empty">As movimentações desta oportunidade aparecerão aqui.</div>';
  document.querySelectorAll('[data-detail-stage]').forEach(button=>button.onclick=()=>changeDealStage(button.dataset.detailStage));
  $('#dealDrawer').classList.remove('hidden');$('#dealDrawer').setAttribute('aria-hidden','false');
}
function installHandoffSummary(){if($('#handoffSummaryCard'))return;$('#saveDealDetails').insertAdjacentHTML('afterend','<section id="handoffSummaryCard" class="handoff-summary hidden"><div class="handoff-summary-head"><span class="handoff-orbit">O</span><small>PASSAGEM DE BASTÃO</small></div><strong id="handoffSummaryTitle"></strong><p id="handoffSummaryText"></p><span id="handoffSummaryMeta"></span></section>')}
function renderHandoffSummary(deal){installHandoffSummary();const card=$('#handoffSummaryCard'),summary=deal?.handoffSummary;card.classList.toggle('hidden',!summary);if(!summary)return;$('#handoffSummaryTitle').textContent=`${summary.toOwner} recebeu esta oportunidade`;$('#handoffSummaryText').textContent=summary.text;$('#handoffSummaryMeta').textContent=`Resumo criado pelo Orbit em ${new Date(summary.createdAt).toLocaleString('pt-BR')}`}
function closeDealDrawer(){$('#dealDrawer').classList.add('hidden');$('#dealDrawer').setAttribute('aria-hidden','true');appState.activeDealId=null}
function updateActiveDeal(change,title,text){const deals=getDeals();const deal=deals.find(item=>item.id===appState.activeDealId);if(!deal)return;Object.assign(deal,change);addEntityHistory(deal,title,text);saveDeals(deals);openDealDrawer(deal.id);if(appState.currentView==='pipeline')renderPipeline($('#dealSearch').value)}
function changeDealStage(stage){const deal=getDeals().find(item=>item.id===appState.activeDealId);if(!deal||deal.stage===stage)return;const from=pipelineStages.find(item=>item.id===deal.stage)?.label,to=pipelineStages.find(item=>item.id===stage)?.label;updateActiveDeal({stage},'Etapa alterada',`${from} → ${to}`)}
function saveDealDetailChanges(){const deals=getDeals(),deal=deals.find(item=>item.id===appState.activeDealId);if(!deal)return;const previousOwner=deal.owner,previousRole=deal.ownerRole||'Colaborador comercial',newOwner=$('#drawerDealOwner').value.trim(),newRole=$('#drawerDealRole').value,reason=$('#drawerTransferReason').value.trim(),ownerChanged=newOwner!==previousOwner||newRole!==previousRole;deal.value=Number($('#drawerDealValue').value);deal.owner=newOwner;deal.ownerRole=newRole;deal.next=$('#drawerDealNext').value.trim();deal.nextDate=$('#drawerDealNextDate').value;const validation=validateNegotiation(deal);if(!validation.valid){alert(validation.message);return}if(ownerChanged){const stageLabel=pipelineStages.find(stage=>stage.id===deal.stage)?.label||deal.stage,handoff=createHandoffSummary(deal,clientForDeal(deal),{fromOwner:previousOwner,toOwner:newOwner,fromRole:previousRole,toRole:newRole,reason,stageLabel});deal.handoffSummary=handoff;addEntityHistory(deal,'Responsável transferido',`${previousOwner} (${previousRole}) → ${newOwner} (${newRole})${reason?` · Motivo: ${reason}`:''}`);addEntityHistory(deal,'Resumo de passagem criado',handoff.text,{handoffSummary:handoff.text})}else addEntityHistory(deal,'Dados atualizados','Valor ou próximo passo alterado');saveDeals(deals);openDealDrawer(deal.id);if(appState.currentView==='pipeline')renderPipeline($('#dealSearch').value)}

function openDealModal(){
  $('#dealNextDate').value=todayISO();
  $('#dealForm [name="stage"]').innerHTML=pipelineStages.map(stage=>'<option value="'+stage.id+'">'+stage.label+'</option>').join('');
  $('#dealModal').classList.remove('hidden');
  $('#dealModal').setAttribute('aria-hidden','false');
  $('#dealForm [name="title"]').focus();
}
function closeDealModal(){$('#dealModal').classList.add('hidden');$('#dealModal').setAttribute('aria-hidden','true');$('#dealForm').reset();$('#dealOwner').value=getOwner()?.name||'Admin'}

const clientsStore=createStore(CLIENTS_KEY,initialClients);
function getClients(){return clientsStore.get()}
function saveClients(clients){clientsStore.save(clients)}
function renderClients(){
  const search=$('#clientSearch').value.toLowerCase();
  const clients=getClients();
  const visible=clients.filter(client=>(appState.activeClientFilter==='Todos'||client.status===appState.activeClientFilter)&&(client.name+' '+client.segment+' '+client.city).toLowerCase().includes(search));
  $('#clientsTotal').textContent=`${clients.length} ${clients.length===1?'empresa':'empresas'}`;
  $('#clientsGrid').innerHTML=visible.length?visible.map(clientCard).join(''):orbitEmptyState('Vamos encontrar esse cliente?','O Orbit sugere ajustar a busca ou cadastrar um novo relacionamento.','clients-empty');
  document.querySelectorAll('[data-open-client]').forEach(card=>card.onclick=()=>openClientDrawer(card.dataset.openClient));
}
function clientCard(client){const relatedDeals=getDeals().filter(deal=>deal.client.trim().toLocaleLowerCase('pt-BR')===client.name.trim().toLocaleLowerCase('pt-BR')),fallback=relatedDeals.map(deal=>deal.createdAt).filter(Boolean).sort().at(-1)||client.createdAt;return `<article class="client-card" data-open-client="${client.id}"><header class="client-card-header"><span class="company-avatar">${escapeHtml(client.name.charAt(0).toUpperCase())}</span><div><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(client.segment)}</p></div><button class="client-menu" title="Abrir ficha 360°">•••</button></header><div class="client-card-body"><div class="client-info"><small>STATUS</small><span class="client-status ${client.status==='Prospect'?'prospect':''}">${client.status}</span></div><div class="client-info"><small>DIAS SEM CONTATO</small><strong class="client-contact-age">${escapeHtml(daysWithoutContactLabel(client.name,fallback))}</strong></div><div class="client-info"><small>LOCALIZAÇÃO</small><strong>${escapeHtml(client.city||'-')}</strong></div><div class="client-info"><small>TELEFONE</small><strong>${escapeHtml(client.phone||'-')}</strong></div><div class="client-info client-email"><small>E-MAIL</small><strong title="${escapeHtml(client.email||'-')}">${escapeHtml(client.email||'-')}</strong></div></div></article>`}
function openClientModal(){$('#clientModal').classList.remove('hidden');$('#clientModal').setAttribute('aria-hidden','false');$('#clientForm [name="name"]').focus()}
function closeClientModal(){$('#clientModal').classList.add('hidden');$('#clientModal').setAttribute('aria-hidden','true');$('#clientForm').reset()}
function completeClientRegistration(client){const clients=getClients();client.id='client-'+Date.now();client.interactions=[];client.history=[];clients.push(client);saveClients(clients);closeClientMergeModal();closeClientModal();showView('clients')}
function openClientMergeModal(candidate,match){appState.pendingClientMerge={candidate,existingId:match.client.id};$('#mergeExistingName').textContent=match.client.name;$('#mergeIncomingName').textContent=candidate.name;$('#mergeSignals').textContent=`O Orbit encontrou: ${match.signals.join(', ')}.`;$('#clientMergeModal').classList.remove('hidden');$('#clientMergeModal').setAttribute('aria-hidden','false')}
function closeClientMergeModal(){$('#clientMergeModal').classList.add('hidden');$('#clientMergeModal').setAttribute('aria-hidden','true');appState.pendingClientMerge=null}
function confirmClientMerge(){const pending=appState.pendingClientMerge;if(!pending)return;const clients=getClients(),existing=clients.find(item=>item.id===pending.existingId);if(!existing)return;mergeClientData(existing,pending.candidate);addEntityHistory(existing,'Cadastro mesclado',`${pending.candidate.name} foi unido a este cliente`);saveClients(clients);closeClientMergeModal();closeClientModal();showView('clients')}
function createSimilarClientAnyway(){const candidate=appState.pendingClientMerge?.candidate;if(candidate)completeClientRegistration(candidate)}
function openClientDrawer(id){
  const client=getClients().find(item=>item.id===id);if(!client)return;appState.activeClientId=id;
  const deals=getDeals().filter(deal=>deal.client.trim().toLowerCase()===client.name.trim().toLowerCase());
  const activities=getActivities().filter(activity=>activity.client.trim().toLowerCase()===client.name.trim().toLowerCase());
  const pending=activities.filter(activity=>!activity.done);
  $('#drawerClientName').textContent=client.name;$('#drawerClientSegment').textContent=client.segment;$('#drawerClientInitial').textContent=client.name.charAt(0).toUpperCase();$('#drawerClientStatus').textContent=client.status;$('#drawerClientStatus').classList.toggle('prospect',client.status==='Prospect');$('#drawerClientLocation').textContent=client.city||'Localização não informada';$('#drawerClientContact').textContent=`${client.phone||'Sem telefone'} · ${client.email||'Sem e-mail'}`;
  $('#clientDealsCount').textContent=deals.length;$('#clientDealsValue').textContent=formatMoney(deals.reduce((sum,deal)=>sum+Number(deal.value),0));$('#clientActivitiesCount').textContent=pending.length;
  $('#clientDealsList').innerHTML=deals.length?deals.map(deal=>`<div class="related-item"><div><strong>${escapeHtml(deal.title)}</strong><p>${pipelineStages.find(stage=>stage.id===deal.stage)?.label||'Sem etapa'} · ${escapeHtml(deal.next)}</p></div><span>${formatMoney(deal.value)}</span></div>`).join(''):'<div class="history-empty">Nenhuma oportunidade vinculada.</div>';
  const timeline=[...(client.interactions||[]).map(item=>({...item,kind:'Interação'})),...activities.map(item=>({id:item.id,title:item.done?'Atividade concluída':'Atividade registrada',text:`${item.type}: ${item.title}`,date:item.completedAt||`${item.date}T${item.time||'12:00'}`,kind:'Atividade'})),...deals.flatMap(deal=>(deal.history||[]).map(item=>({...item,kind:'Negociação'})))].sort((a,b)=>new Date(b.date)-new Date(a.date));
  $('#clientTimeline').innerHTML=timeline.length?timeline.map(item=>`<div class="history-item"><strong>${escapeHtml(item.title||item.kind)}</strong><p>${escapeHtml(item.text)} · ${new Date(item.date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</p></div>`).join(''):'<div class="history-empty">O histórico de conversas, tarefas e negociações aparecerá aqui.</div>';
  $('#clientDrawer').classList.remove('hidden');$('#clientDrawer').setAttribute('aria-hidden','false');
}
function closeClientDrawer(){$('#clientDrawer').classList.add('hidden');$('#clientDrawer').setAttribute('aria-hidden','true');appState.activeClientId=null;$('#interactionForm').reset()}

const activitiesStore=createStore(ACTIVITIES_KEY,initialActivities,{afterSave:()=>updateActivityBadge()});
function getActivities(){return activitiesStore.get()}
function saveActivities(activities){activitiesStore.save(activities)}

function visibleActivities(){const search=$('#activitySearch').value.toLowerCase();return getActivities().filter(activity=>{const matchesSearch=(activity.title+' '+activity.client+' '+activity.type).toLowerCase().includes(search);const matchesFilter=appState.activeActivityFilter==='all'||appState.activeActivityFilter==='pending'&&!activity.done||appState.activeActivityFilter==='done'&&activity.done||appState.activeActivityFilter==='today'&&activity.date===todayISO()&&!activity.done;return matchesSearch&&matchesFilter}).sort((a,b)=>(a.done-b.done)||(a.date+a.time).localeCompare(b.date+b.time))}
function renderActivities(){
  const activities=getActivities();const visible=visibleActivities();const pending=activities.filter(activity=>!activity.done);
  $('#pendingActivities').textContent=`${pending.length} ${pending.length===1?'atividade':'atividades'}`;
  $('#activitiesList').innerHTML=visible.length?visible.map(activityCard).join(''):orbitEmptyState('Sua agenda ganhou espaço','O Orbit sugere criar o próximo passo que fará uma venda avançar.','agenda-empty');
  const overdue=pending.filter(activity=>activity.date<todayISO()).length;
  $('#agendaInsight').textContent=overdue?`${overdue} ${overdue===1?'atividade atrasada':'atividades atrasadas'}`:pending.length?'Seu próximo passo está claro.':'Sua agenda está em dia.';
  $('#agendaInsightText').textContent=overdue?'Priorize essas ações antes de iniciar novos contatos.':pending.length?`Você possui ${pending.length} ações comerciais pendentes.`:'Aproveite para revisar as oportunidades abertas.';
  bindActivityButtons();updateActivityBadge();
}
function activityCard(activity){return `<article class="agenda-item ${activity.done?'done':''}"><button class="complete-activity" data-complete-activity="${activity.id}" title="${activity.done?'Reabrir':'Concluir'}">${activity.done?'✓':'○'}</button><div><strong>${escapeHtml(activity.title)}</strong><p>${escapeHtml(activity.client)} · ${escapeHtml(activity.note||'Sem observação')}</p><span class="activity-type">${escapeHtml(activity.type)}</span></div><time>${activity.date===todayISO()?'Hoje':formatDate(activity.date)}<br><b>${activity.time}</b></time></article>`}
function bindActivityButtons(){document.querySelectorAll('[data-complete-activity]').forEach(button=>button.onclick=()=>{const activities=getActivities();const activity=activities.find(item=>item.id===button.dataset.completeActivity);activity.done=!activity.done;activity.completedAt=activity.done?new Date().toISOString():null;addEntityHistory(activity,activity.done?'Atividade concluída':'Atividade reaberta',activity.title);saveActivities(activities);appState.currentView==='today'?renderTodayActivities():renderActivities()})}
function todayPriorityReason(item){const stages=commercialPipelineStages(pipelineStages),level=item.score>=55?'alta':item.score>=32?'média':'planejada',reasons=[];if(item.isHighestValue)reasons.push('maior valor em aberto');else if(item.value)reasons.push(`${formatMoney(item.value)} em aberto`);if(item.overdueDays)reasons.push(`vencida há ${item.overdueDays} ${item.overdueDays===1?'dia':'dias'}`);else if(item.stageIndex>=Math.max(1,stages.length-2))reasons.push(`próxima do fechamento em ${item.stageLabel}`);else if(item.stageLabel)reasons.push(`negociação em ${item.stageLabel}`);const health=item.deal?healthForDeal(item.deal):null;return `Prioridade ${level}: ${reasons.length?reasons.join(' e '):'ação prevista para hoje'}.${health?` Saúde em ${health.label.toLowerCase()}: ${health.reason}.`:''}`}
function staleDealPriority(item){const deal=item.deal,stages=commercialPipelineStages(pipelineStages),stageIndex=Math.max(0,stages.findIndex(stage=>stage.id===deal.stage)),stageProgress=stages.length>1?stageIndex/(stages.length-1):0;return Math.min(60,item.inactiveDays*7)+Math.min(25,Math.log10(Number(deal.value||0)+1)*6)+stageProgress*15}
function bindStaleDealButtons(){document.querySelectorAll('[data-open-stale-deal]').forEach(button=>button.onclick=()=>openDealDrawer(button.dataset.openStaleDeal))}
function renderTodayActivities(){const activities=getActivities(),pending=activities.filter(activity=>!activity.done),deals=dealsVisibleToCurrentUser(getDeals()),ranked=rankTodayActivities(activities,deals,pipelineStages),stale=findStaleDeals(deals,getClients(),getStaleDealDays()),entries=[...ranked.map(item=>({type:'activity',score:item.score,item})),...stale.map(item=>({type:'stale',score:staleDealPriority(item),item}))].sort((a,b)=>b.score-a.score);$('#todayPendingCount').textContent=pending.length+stale.length;$('#todayActivityHint').textContent=`${entries.length} ${entries.length===1?'prioridade':'prioridades'}`;$('#todayTasks').innerHTML=entries.length?entries.slice(0,5).map(entry=>{if(entry.type==='stale'){const {deal,inactiveDays}=entry.item,stage=pipelineStages.find(item=>item.id===deal.stage)?.label||'Funil',health=healthForDeal(deal);return `<div class="task stale-deal-task"><button data-open-stale-deal="${deal.id}" title="Abrir negociação">↗</button><div><strong>Retomar ${escapeHtml(deal.title)}</strong><p>${escapeHtml(deal.client)} · ${escapeHtml(stage)}</p><small class="task-priority-reason">Saúde em ${health.label.toLowerCase()}: ${escapeHtml(health.reason)}. Essa negociação está esperando por você.</small></div><time>Há ${inactiveDays}d</time></div>`}const activity=entry.item.activity;return `<div class="task"><button class="complete-activity" data-complete-activity="${activity.id}">○</button><div><strong>${escapeHtml(activity.title)}</strong><p>${escapeHtml(activity.client)} · ${escapeHtml(activity.type)}</p><small class="task-priority-reason">${escapeHtml(todayPriorityReason(entry.item))}</small></div><time>${activity.time}</time></div>`}).join(''):'<div class="agenda-empty"><strong>Tudo em dia</strong>O Orbit não encontrou nenhuma pendência para hoje.</div>';bindActivityButtons();bindStaleDealButtons();updateActivityBadge();updateDashboardMetrics();renderRoleFocus();applyTodayMetricSemantics()}
function updateDashboardMetrics(){const deals=dealsVisibleToCurrentUser(getDeals()),clients=getClients(),open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost'),total=open.reduce((sum,deal)=>sum+Number(deal.value||0),0),closingStage=stageByMeaning('closing'),closing=open.filter(deal=>deal.stage===closingStage).reduce((sum,deal)=>sum+Number(deal.value||0),0);$('#todayOpenDeals').textContent=open.length;$('#todayPipelineValue').textContent=`${formatMoney(total)} no funil`;$('#todayClosingValue').textContent=formatMoney(closing);$('#todayClientsCount').textContent=clients.length}
function updateActivityBadge(){const pending=getActivities().filter(activity=>!activity.done).length;$('#activityBadge').textContent=pending;$('#activityBadge').style.display=pending?'inline-block':'none'}
function openActivityModal(){$('#activityDate').value=todayISO();$('#activityModal').classList.remove('hidden');$('#activityModal').setAttribute('aria-hidden','false');$('#activityForm [name="title"]').focus()}
function closeActivityModal(){$('#activityModal').classList.add('hidden');$('#activityModal').setAttribute('aria-hidden','true');$('#activityForm').reset()}

function analyzeLocally(text){return analyzeConversationText(text,{newStage:stageByMeaning('new'),proposalStage:stageByMeaning('proposal')})}
const proposalsStore=createStore(PROPOSALS_KEY,initialProposals);
function getProposals(){return proposalsStore.get()}
function saveProposals(items){proposalsStore.save(items)}

function renderProposals(){const search=$('#proposalSearch').value.toLowerCase(),all=getProposals(),visible=all.filter(item=>(appState.activeProposalFilter==='all'||item.status===appState.activeProposalFilter)&&(item.title+' '+item.client).toLowerCase().includes(search));$('#proposalsTotal').textContent=formatMoney(all.filter(item=>item.status!=='refused').reduce((sum,item)=>sum+Number(item.value),0));$('#proposalsList').innerHTML=visible.length?visible.map(item=>`<article class="record-card"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.client)} · Validade ${formatDate(item.validUntil)}</p></div><div class="record-cell"><small>VALOR</small><strong>${formatMoney(item.value)}</strong></div><div><span class="record-status ${item.status}">${proposalStatusLabel(item.status)}</span></div><select class="record-action" data-proposal-status="${item.id}"><option value="">Alterar estado...</option><option value="draft">Rascunho</option><option value="sent">Enviada</option><option value="approved">Aprovada</option><option value="refused">Recusada</option></select></article>`).join(''):orbitEmptyState('Uma boa proposta começa aqui','O Orbit sugere abrir uma oportunidade e transformar o próximo passo em uma oferta clara.');document.querySelectorAll('[data-proposal-status]').forEach(select=>select.onchange=()=>changeProposalStatus(select.dataset.proposalStatus,select.value))}
let celebrationTimer;
function showMicroCelebration(type,value){const layer=$('#microCelebration');if(!layer)return;clearTimeout(celebrationTimer);layer.className=`micro-celebration ${type}`;$('#celebrationTitle').textContent=type==='sale'?'Venda conquistada':'Dinheiro recebido';$('#celebrationMessage').textContent=type==='sale'?`${value} avançou para recebimento.`:`${value} confirmado no caixa.`;layer.setAttribute('aria-hidden','false');void layer.offsetWidth;layer.classList.add('is-visible');celebrationTimer=setTimeout(()=>{layer.classList.remove('is-visible');layer.setAttribute('aria-hidden','true')},2400)}
function changeProposalStatus(id,status){if(!status)return;const proposals=getProposals(),proposal=proposals.find(item=>item.id===id),previous=proposal.status;proposal.status=status;proposal.updatedAt=new Date().toISOString();addEntityHistory(proposal,'Status da proposta alterado',`${proposalStatusLabel(previous)} → ${proposalStatusLabel(status)}`);saveProposals(proposals);let wonDeal=null;if(status==='approved'){const deals=getDeals(),deal=deals.find(item=>item.id===proposal.dealId);if(deal){applyWonDealRules(deal);createProvisionalReceipt(deal);addEntityHistory(deal,'Proposta aprovada',`${proposal.title} foi aprovada`);addEntityHistory(deal,'Recebimento criado',`${formatMoney(deal.value)} previsto · vencimento ${formatDate(deal.dueDate)}`);saveDeals(deals);wonDeal=deal}}renderProposals();if(wonDeal){openReceiptModal(wonDeal.id,true);showMicroCelebration('sale',formatMoney(wonDeal.value))}}
function openProposalModal(){const deals=getDeals();$('#proposalDeal').innerHTML='<option value="">Sem vínculo</option>'+deals.map(deal=>`<option value="${deal.id}">${escapeHtml(deal.title)} · ${escapeHtml(deal.client)}</option>`).join('');$('#proposalModal').classList.remove('hidden');$('#proposalModal').setAttribute('aria-hidden','false');$('#proposalForm [name="validUntil"]').value=new Date(Date.now()+7*86400000).toISOString().slice(0,10);$('#proposalForm [name="title"]').focus()}
function closeProposalModal(){$('#proposalModal').classList.add('hidden');$('#proposalModal').setAttribute('aria-hidden','true');$('#proposalForm').reset()}
function renderReceipts(){const won=dealsVisibleToCurrentUser(getDeals()).filter(deal=>deal.status==='won'),sold=won.reduce((sum,deal)=>sum+Number(deal.value),0),received=won.reduce((sum,deal)=>sum+Number(deal.receivedAmount||(deal.paymentStatus==='received'?deal.value:0)),0),open=Math.max(0,sold-received);$('#amountSold').textContent=formatMoney(sold);$('#amountReceived').textContent=formatMoney(received);$('#amountOpen').textContent=formatMoney(open);$('#amountPending').textContent=formatMoney(open);$('#receiptsList').innerHTML=won.length?won.map(deal=>{const status=deal.paymentStatus||'pending',paid=Number(deal.receivedAmount||(status==='received'?deal.value:0));return `<article class="record-card"><div><h3>${escapeHtml(deal.title)}</h3><p>${escapeHtml(deal.client)} · ${deal.dueDate?`Vence ${formatDate(deal.dueDate)}`:'Sem vencimento'}</p></div><div class="record-cell"><small>VENDA / RECEBIDO</small><strong>${formatMoney(deal.value)} / ${formatMoney(paid)}</strong></div><div><span class="record-status ${status}">${{pending:'Pendente',partial:'Parcial',received:'Recebido'}[status]}</span></div><button class="record-action" data-edit-receipt="${deal.id}">Atualizar</button></article>`}).join(''):orbitEmptyState('O caixa começa depois da conquista','Quando você marcar a primeira venda como ganha, o Orbit acompanhará o dinheiro até a entrada.');document.querySelectorAll('[data-edit-receipt]').forEach(button=>button.onclick=()=>openReceiptModal(button.dataset.editReceipt))}
function openReceiptModal(id,celebration=false){const deal=getDeals().find(item=>item.id===id);if(!deal)return;$('#receiptModal').classList.toggle('receipt-win-mode',celebration);$('#receiptModalEyebrow').textContent=celebration?'VENDA GANHA':'ATUALIZAR PAGAMENTO';$('#receiptModalTitle').textContent=celebration?'Você venceu!':deal.title;$('#receiptModalPrompt').textContent=celebration?`Vamos registrar o recebimento de ${formatMoney(deal.value)} agora? Você pode ajustar os dados provisórios.`:`Atualize o recebimento de ${deal.title}.`;$('#receiptForm [name="dealId"]').value=id;$('#receiptForm [name="total"]').value=deal.value;$('#receiptForm [name="received"]').value=deal.receivedAmount||(deal.paymentStatus==='received'?deal.value:0);$('#receiptForm [name="dueDate"]').value=deal.dueDate||todayISO();$('#receiptForm [name="status"]').value=deal.paymentStatus||'pending';$('#receiptModal').classList.remove('hidden');$('#receiptModal').setAttribute('aria-hidden','false')}
function closeReceiptModal(){$('#receiptModal').classList.add('hidden');$('#receiptModal').setAttribute('aria-hidden','true');$('#receiptForm').reset()}
function renderSettings(){const company=getCompany()||{},owner=getOwner()||{};$('#companySettings').innerHTML=`<div><span>Empresa</span><b>${escapeHtml(company.name||'Não informada')}</b></div><div><span>Segmento</span><b>${escapeHtml(company.segment||'Não informado')}</b></div><div><span>Equipe</span><b>${escapeHtml(company.size||'Não informada')}</b></div><div><span>Plano</span><b>${companyPlanLabel(company.plan)}</b></div><div><span>Proprietário</span><b>${escapeHtml(owner.name||'')}</b></div><div><span>Armazenamento</span><b>Local neste navegador</b></div>`;const input=$('#staleDealDays');if(input){input.value=getStaleDealDays();input.onchange=()=>{input.value=saveStaleDealDays(input.value);if(appState.currentView==='today')renderTodayActivities()}}}
function renderTeam(){renderTeamInviteCard();const users=getUsers(),active=users.filter(user=>user.status==='active');$('#activeUsersCount').textContent=`${active.length} ${active.length===1?'usuário':'usuários'}`;$('#teamGrid').innerHTML=users.map(user=>`<article class="team-card"><div class="team-card-top"><span class="user-avatar">${ownerInitials(user.name)}</span><div><h3>${escapeHtml(user.name)}</h3><p>${escapeHtml(user.email)}</p></div><i class="user-state ${user.status==='inactive'?'inactive':''}" title="${user.status==='active'?'Ativo':'Inativo'}"></i></div><div class="team-card-info"><div><small>PERFIL</small><strong>${escapeHtml(user.profile)}</strong></div><div><small>VISIBILIDADE</small><strong>${user.visibility==='all'?'Todo o funil':'Carteira própria'}</strong></div></div><div class="team-card-actions">${user.profile==='Proprietário/Admin'?'<button disabled>Acesso principal</button>':`<button data-toggle-user="${user.id}">${user.status==='active'?'Desativar':'Ativar'}</button>`}</div></article>`).join('');document.querySelectorAll('[data-toggle-user]').forEach(button=>button.onclick=()=>toggleUserStatus(button.dataset.toggleUser));renderGoalsEditor(users)}
function installGoalsEditor(){if($('#salesGoalsEditor'))return;$('#teamGrid').insertAdjacentHTML('afterend','<section id="salesGoalsEditor" class="sales-goals-editor hidden"><header><div><small>GESTÃO DE PERFORMANCE</small><h2>Metas comerciais</h2><p>Defina objetivos mensais individuais e coletivos.</p></div><label>Período<input id="goalsPeriod" type="month"></label></header><div class="goals-table-head"><span>Responsável</span><span>Valor vendido</span><span>Valor recebido</span><span>Atividades concluídas</span><span>Progresso real</span></div><div id="individualGoalRows"></div><div class="team-goal-title"><span>◎</span><div><strong>Meta coletiva da equipe</strong><small>Objetivo compartilhado do período</small></div></div><div id="teamGoalRow"></div><footer><span>Percentual médio dos indicadores com meta definida.</span><button type="button" id="saveSalesGoals">Salvar metas</button></footer></section>');$('#goalsPeriod').onchange=()=>renderGoalsEditor();$('#saveSalesGoals').onclick=saveSalesGoalForm}
function goalFields(prefix,values={}){return `<label><small>VENDIDO (R$)</small><input type="number" min="0" step="100" data-goal-field="sold" data-goal-owner="${prefix}" value="${Number(values.sold||0)}"></label><label><small>RECEBIDO (R$)</small><input type="number" min="0" step="100" data-goal-field="received" data-goal-owner="${prefix}" value="${Number(values.received||0)}"></label><label><small>ATIVIDADES</small><input type="number" min="0" step="1" data-goal-field="activities" data-goal-owner="${prefix}" value="${Number(values.activities||0)}"></label>`}
function renderGoalsEditor(users=getUsers()){installGoalsEditor();const panel=$('#salesGoalsEditor'),sellers=activeSellers(users),allowed=canManageGoals()&&canUsePerformanceFeatures();panel.classList.toggle('hidden',!allowed);if(!allowed)return;const period=$('#goalsPeriod').value||goalPeriodNow(),periodGoals=getGoals()[period]||{users:{},team:{}};$('#goalsPeriod').value=period;$('#individualGoalRows').innerHTML=sellers.map(user=>{const target=periodGoals.users?.[user.id]||{},actual=sellerPerformance(user,period);return `<div class="goal-editor-row"><div class="goal-person"><span>${ownerInitials(user.name)}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.profile)}</small></div></div>${goalFields(user.id,target)}${goalProgressMarkup(actual,target)}</div>`}).join('');const teamTarget=periodGoals.team||{},teamActual=teamPerformanceForGoals(sellers,period);$('#teamGoalRow').innerHTML=`<div class="goal-editor-row team">${goalFields('team',teamTarget)}${goalProgressMarkup(teamActual,teamTarget)}</div>`}
function saveSalesGoalForm(){if(!canManageGoals()||!canUsePerformanceFeatures())return;const period=$('#goalsPeriod').value||goalPeriodNow(),goals=getGoals(),record={period,updatedAt:new Date().toISOString(),updatedBy:appState.currentUser?.id,users:{},team:{}};document.querySelectorAll('#salesGoalsEditor [data-goal-owner]').forEach(input=>{const owner=input.dataset.goalOwner,target=owner==='team'?record.team:(record.users[owner]??={});target[input.dataset.goalField]=Math.max(0,Number(input.value||0))});goals[period]=record;saveGoals(goals);renderGoalsEditor();const button=$('#saveSalesGoals');button.textContent='Metas salvas ✓';setTimeout(()=>button.textContent='Salvar metas',1600)}
function renderRanking(){
  const sellers=activeSellers(),period=$('#rankingPeriod').value||goalPeriodNow(),periodGoals=getGoals()[period]||{users:{},team:{}},manager=canManageGoals(),visibility=getRankingVisibility();
  $('#rankingPeriod').value=period;$('#rankingVisibilityControl').classList.toggle('hidden',!manager);$('#rankingPublicToggle').checked=visibility==='public';$('#rankingVisibilityText').textContent=visibility==='public'?'Visível para toda a equipe':'Visível somente para gestores';
  $('#rankingPeriod').onchange=renderRanking;$('#rankingPublicToggle').onchange=event=>{if(!canManageGoals())return;localStorage.setItem('niviontech_ranking_visibility',event.target.checked?'public':'private');syncRankingAccess();renderRanking()};
  const ranking=sellers.map(user=>{const target=periodGoals.users?.[user.id]||{},actual=sellerPerformance(user,period),progress=calculateGoalProgress(actual,target);return{user,progress}}).sort((a,b)=>b.progress.percent-a.progress.percent||a.user.name.localeCompare(b.user.name,'pt-BR'));
  const teamProgress=calculateGoalProgress(teamPerformanceForGoals(sellers,period),periodGoals.team||{});$('#rankingTeamPercent').textContent=`${teamProgress.percent}%`;
  $('#rankingList').innerHTML=ranking.length?ranking.map((item,index)=>`<article class="ranking-row"><span class="ranking-position">${index+1}</span><span class="ranking-avatar">${ownerInitials(item.user.name)}</span><div class="ranking-person"><strong>${escapeHtml(item.user.name)}</strong><small>${escapeHtml(item.user.profile)}</small><div class="ranking-recognition">${sellerRecognition(item.user,item.progress)}</div></div><div class="ranking-breakdown"><span>Vendido <b>${item.progress.metrics.sold}%</b></span><span>Recebido <b>${item.progress.metrics.received}%</b></span><span>Atividades <b>${item.progress.metrics.activities}%</b></span></div><div class="ranking-result"><strong>${item.progress.percent}%</strong><small>da meta</small><span><i style="width:${Math.min(100,item.progress.percent)}%"></i></span></div></article>`).join(''):orbitEmptyState('Ranking aguardando equipe','Cadastre pelo menos dois vendedores ativos e suas metas mensais.');
}
function renderTemplates(){const active=funnelTemplates.find(item=>item.id===pipelineConfig.templateId);$('#currentTemplateName').textContent=active?.name||'Funil personalizado';$('#templateGrid').innerHTML=funnelTemplates.slice(1).map(template=>`<article class="template-card ${pipelineConfig.templateId===template.id?'active':''}"><span class="template-icon">${escapeHtml(template.icon)}</span><h3>${escapeHtml(template.name)}</h3><p>${escapeHtml(template.description)}</p><div class="template-stages">${template.stages.slice(0,4).map(([,label])=>`<span>${escapeHtml(label)}</span>`).join('')}${template.stages.length>4?`<span>+${template.stages.length-4}</span>`:''}</div><button data-apply-template="${escapeHtml(template.id)}">${pipelineConfig.templateId===template.id?'Modelo em uso':'Usar este modelo'}</button></article>`).join('');$('#activeStagesPreview').innerHTML=pipelineStages.map((stage,index)=>`<div class="stage-preview-item"><span>${escapeHtml(stage.label)}</span>${index<pipelineStages.length-1?'<i>→</i>':''}</div>`).join('');document.querySelectorAll('[data-apply-template]').forEach(button=>button.onclick=()=>applyFunnelTemplate(button.dataset.applyTemplate))}
function applyFunnelTemplate(templateId){const template=funnelTemplates.find(item=>item.id===templateId);if(!template||templateId===pipelineConfig.templateId)return;const message=`Aplicar o modelo “${template.name}”? As oportunidades existentes serão distribuídas proporcionalmente nas novas etapas e cada mudança ficará registrada no histórico.`;if(!confirm(message))return;const previousStages=commercialPipelineStages(pipelineStages),newCommercialStages=template.stages.map(([id,label])=>({id,label})),newStages=withOutcomeStages(newCommercialStages),deals=getDeals();deals.forEach(deal=>{if(['won','after-sales','lost'].includes(deal.stage))return;const oldIndex=Math.max(0,previousStages.findIndex(stage=>stage.id===deal.stage)),ratio=previousStages.length>1?oldIndex/(previousStages.length-1):0,newIndex=Math.min(newCommercialStages.length-1,Math.round(ratio*(newCommercialStages.length-1))),oldLabel=previousStages[oldIndex]?.label||deal.stage;deal.stage=newCommercialStages[newIndex].id;deal.movedAt=new Date().toISOString();addEntityHistory(deal,'Funil reconfigurado',`${oldLabel} → ${newCommercialStages[newIndex].label} · Modelo ${template.name}`)});saveDeals(deals);pipelineConfig={templateId,stages:newStages,updatedAt:new Date().toISOString()};pipelineStages=newStages;localStorage.setItem(PIPELINE_CONFIG_KEY,JSON.stringify(pipelineConfig));renderTemplates()}
function stageByMeaning(meaning){const stages=commercialPipelineStages(pipelineStages),terms={new:['novo','lead','conversa','contato'],qualified:['qualifica','entendimento','interesse','diagnóstico'],proposal:['proposta','orçamento','oferta'],closing:['fechamento','negociação','aprovado','fechado']}[meaning]||[],fallback={new:0,qualified:1,proposal:2,closing:stages.length-1}[meaning]||0;return stages.find(stage=>terms.some(term=>stage.label.toLowerCase().includes(term)))?.id||stages[Math.min(Math.max(0,fallback),Math.max(0,stages.length-1))]?.id||pipelineStages[0]?.id}
function toggleUserStatus(id){const users=getUsers(),user=users.find(item=>item.id===id);if(!user)return;user.status=user.status==='active'?'inactive':'active';saveUsers(users);renderTeam();syncRankingAccess()}
function openUserModal(){$('#userModal').classList.remove('hidden');$('#userModal').setAttribute('aria-hidden','false');$('#userForm [name="name"]').focus()}
function closeUserModal(){$('#userModal').classList.add('hidden');$('#userModal').setAttribute('aria-hidden','true');$('#userForm').reset()}
function downloadFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportBackup(){const backup={version:'1.0',product:'NivionTech CRM',exportedAt:new Date().toISOString(),company:getCompany(),owner:{...getOwner(),passwordHash:undefined,salt:undefined},clients:getClients(),deals:getDeals(),activities:getActivities(),proposals:getProposals()};downloadFile(`niviontech-backup-${todayISO()}.json`,JSON.stringify(backup,null,2),'application/json')}
function exportClientsCsv(){const rows=[['Nome','Segmento','Status','Cidade','Telefone','Email'],...getClients().map(item=>[item.name,item.segment,item.status,item.city,item.phone,item.email])];const csv=rows.map(row=>row.map(value=>`"${String(value||'').replace(/"/g,'""')}"`).join(',')).join('\n');downloadFile(`niviontech-clientes-${todayISO()}.csv`,'\ufeff'+csv,'text/csv;charset=utf-8')}
function installPipelineExportButton(){if($('#exportPipelineExcel'))return;const trigger=$('#funnelEditorTrigger');if(!trigger)return;trigger.insertAdjacentHTML('beforebegin','<button type="button" id="exportPipelineExcel" class="pipeline-export-excel">▦ Exportar Excel</button>');$('#exportPipelineExcel').onclick=exportPipelineExcel}
function exportPipelineExcel(){
  const statusLabel=deal=>deal.status==='won'?'Ganha':deal.status==='lost'?'Perdida':'Em andamento',temperatureLabel={cold:'Frio',warm:'Morno',hot:'Quente'},paymentLabel={pending:'Pendente',partial:'Parcial',received:'Recebido'};
  const deals=dealsVisibleToCurrentUser(getDeals()),headers=['Oportunidade','Cliente','Valor','Etapa','Status','Temperatura','Responsável','Papel','Próxima ação','Data da próxima ação','Dias sem contato','Saúde','Criada em','Recebimento','Motivo da distribuição'];
  const rows=deals.map(deal=>{const health=healthForDeal(deal),contactDays=daysWithoutContact(deal.client,deal.createdAt);return[deal.title,deal.client,Number(deal.value||0),pipelineStages.find(stage=>stage.id===deal.stage)?.label||deal.stage,statusLabel(deal),temperatureLabel[deal.temperature]||'Não definido',deal.owner||'',deal.ownerRole||'',deal.next||'',deal.nextDate?formatDate(deal.nextDate):'',contactDays===null?'Sem registro':contactDays,health.label,deal.createdAt?new Date(deal.createdAt).toLocaleDateString('pt-BR'):'',paymentLabel[deal.paymentStatus]||'Aguardando fechamento',deal.distributionReason||'']});
  const cell=value=>`<td>${escapeHtml(String(value??''))}</td>`,table=`<table><thead><tr>${headers.map(header=>`<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody></table>`;
  const workbook=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif}th{background:#172445;color:#fff;font-weight:700}th,td{padding:8px 10px;border:1px solid #ccd3df;white-space:nowrap}tr:nth-child(even){background:#f3f6fa}</style></head><body><h2>NivionTech CRM - Funil de vendas</h2><p>Exportado em ${new Date().toLocaleString('pt-BR')} · ${deals.length} oportunidades</p>${table}</body></html>`;
  downloadFile(`niviontech-funil-${todayISO()}.xls`,'\ufeff'+workbook,'application/vnd.ms-excel;charset=utf-8');
}

document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>showView(button.dataset.view));
document.querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=closeDealModal);
document.querySelectorAll('[data-close-client-modal]').forEach(button=>button.onclick=closeClientModal);
document.querySelectorAll('[data-close-activity-modal]').forEach(button=>button.onclick=closeActivityModal);
document.querySelectorAll('[data-close-proposal-modal]').forEach(button=>button.onclick=closeProposalModal);
document.querySelectorAll('[data-close-receipt-modal]').forEach(button=>button.onclick=closeReceiptModal);
document.querySelectorAll('[data-close-user-modal]').forEach(button=>button.onclick=closeUserModal);
document.querySelectorAll('[data-close-drawer]').forEach(button=>button.onclick=closeDealDrawer);
document.querySelectorAll('[data-close-client-drawer]').forEach(button=>button.onclick=closeClientDrawer);
$('#undoMove').onclick=undoLastMove;$('#dismissUndo').onclick=hideUndo;
$('#newButton').onclick=()=>{if(appState.currentView==='clients')openClientModal();else if(appState.currentView==='activities'||appState.currentView==='today')openActivityModal();else if(appState.currentView==='proposals')openProposalModal();else if(appState.currentView==='team')openUserModal();else{if(appState.currentView!=='pipeline')showView('pipeline');openDealModal()}};
$('#todayAddActivity').onclick=openActivityModal;
$('#dealSearch').oninput=event=>renderPipeline(event.target.value);
$('#clientSearch').oninput=renderClients;
document.querySelectorAll('[data-client-filter]').forEach(button=>button.onclick=()=>{appState.activeClientFilter=button.dataset.clientFilter;document.querySelectorAll('[data-client-filter]').forEach(item=>item.classList.toggle('active',item===button));renderClients()});
$('#activitySearch').oninput=renderActivities;
document.querySelectorAll('[data-activity-filter]').forEach(button=>button.onclick=()=>{appState.activeActivityFilter=button.dataset.activityFilter;document.querySelectorAll('[data-activity-filter]').forEach(item=>item.classList.toggle('active',item===button));renderActivities()});
$('#proposalSearch').oninput=renderProposals;
document.querySelectorAll('[data-proposal-filter]').forEach(button=>button.onclick=()=>{appState.activeProposalFilter=button.dataset.proposalFilter;document.querySelectorAll('[data-proposal-filter]').forEach(item=>item.classList.toggle('active',item===button));renderProposals()});
$('#dealForm').onsubmit=event=>{event.preventDefault();const deal=Object.fromEntries(new FormData(event.target));deal.id='deal-'+Date.now();deal.value=Number(deal.value);deal.createdAt=new Date().toISOString();deal.ownerRole=appState.currentUser?.profile||'Proprietário/Admin';deal.history=[];if(deal.stage===stageByMeaning('new'))assignLeadByRoundRobin(deal);const deals=getDeals();deals.push(deal);saveDeals(deals);closeDealModal();showView('pipeline')};
$('#clientForm').onsubmit=event=>{event.preventDefault();const client=Object.fromEntries(new FormData(event.target)),validation=validateClientRegistration(client,getClients());if(!validation.valid){openClientMergeModal(client,validation.duplicate);return}completeClientRegistration(client)};
$('#mergeClientConfirm').onclick=confirmClientMerge;
$('#createClientAnyway').onclick=createSimilarClientAnyway;
$('#cancelClientMerge').onclick=closeClientMergeModal;
document.querySelector('[data-close-client-merge]').onclick=closeClientMergeModal;
$('#activityForm').onsubmit=event=>{event.preventDefault();const activity=Object.fromEntries(new FormData(event.target));activity.id='activity-'+Date.now();activity.done=false;const activities=getActivities();activities.push(activity);saveActivities(activities);closeActivityModal();showView('activities')};
let pendingOrganizeReading=null;
$('#analyzeConversation').onclick=()=>{const text=$('#conversationText').value.trim();if(!text){$('#conversationText').focus();return}pendingOrganizeReading=analyzeLocally(text);$('#organizeConfirmationText').textContent=pendingOrganizeReading.confirmation;const labels={value:'Valor',date:'Data',phone:'Telefone',urgency:'Urgência',email:'E-mail',time:'Horário'};$('#organizeSignals').innerHTML=Object.entries(pendingOrganizeReading.detected).filter(([,found])=>found).map(([key])=>`<span>✓ ${labels[key]}</span>`).join('')||'<span>Leitura básica</span>';$('#draftPlaceholder').classList.add('hidden');$('#organizeDraft').classList.add('hidden');$('#organizeConfirmation').classList.remove('hidden')};
$('#reviseOrganizeReading').onclick=()=>{pendingOrganizeReading=null;$('#organizeConfirmation').classList.add('hidden');$('#draftPlaceholder').classList.remove('hidden');$('#conversationText').focus()};
$('#confirmOrganizeReading').onclick=()=>{if(!pendingOrganizeReading)return;const form=$('#organizeDraft'),draft=analyzeLocally($('#conversationText').value.trim()).draft;pendingOrganizeReading.draft=draft;Object.entries(draft).forEach(([key,value])=>{const field=form.querySelector(`[name="${key}"]`);if(field)field.value=value});$('#organizeConfirmation').classList.add('hidden');form.classList.remove('hidden')};
$('#organizeDraft').onsubmit=event=>{event.preventDefault();if(!pendingOrganizeReading)return;const draft=Object.fromEntries(new FormData(event.target)),recognizedPhone=draft.summary.match(/Telefone:\s*([^·]+)/i)?.[1]?.trim()||'',clients=getClients();let client=clients.find(item=>item.name.trim().toLowerCase()===draft.client.trim().toLowerCase());if(!client){client={id:'client-'+Date.now(),name:draft.client,segment:'A confirmar',status:'Prospect',city:'Não informado',phone:recognizedPhone,email:draft.email||'',interactions:[]};clients.push(client)}else{if(!client.phone&&recognizedPhone)client.phone=recognizedPhone;if(!client.email&&draft.email)client.email=draft.email}client.interactions=client.interactions||[];client.interactions.unshift({id:'interaction-'+Date.now(),title:'Conversa organizada',text:draft.summary,date:new Date().toISOString()});addEntityHistory(client,'Cliente atualizado','Conversa organizada adicionada ao histórico');saveClients(clients);const deals=getDeals(),deal={id:'deal-'+Date.now(),title:draft.title,client:client.name,value:Number(draft.value||0),stage:draft.stage,owner:appState.currentUser?.name||getOwner()?.name||'Admin',ownerRole:appState.currentUser?.profile||'Proprietário/Admin',next:draft.next,nextDate:draft.date,urgency:draft.urgency,createdAt:new Date().toISOString(),history:[]};if(deal.stage===stageByMeaning('new'))assignLeadByRoundRobin(deal);addEntityHistory(deal,'Rascunho confirmado','Oportunidade criada pelo fluxo Cole e organize');deals.push(deal);saveDeals(deals);const activities=getActivities();activities.push({id:'activity-'+Date.now(),title:draft.next,type:'Tarefa',client:client.name,date:draft.date,time:draft.time,note:'Criada a partir de conversa confirmada',owner:appState.currentUser?.name,done:false});saveActivities(activities);alert('Rascunho confirmado. Cliente, oportunidade e próxima ação foram organizados.');pendingOrganizeReading=null;event.target.reset();event.target.classList.add('hidden');$('#organizeConfirmation').classList.add('hidden');$('#draftPlaceholder').classList.remove('hidden');$('#conversationText').value='';showView('today')};
$('#proposalForm').onsubmit=event=>{event.preventDefault();const proposal=Object.fromEntries(new FormData(event.target));proposal.id='proposal-'+Date.now();proposal.value=Number(proposal.value);proposal.createdAt=new Date().toISOString();const proposals=getProposals();proposals.push(proposal);saveProposals(proposals);if(proposal.dealId){const deals=getDeals(),deal=deals.find(item=>item.id===proposal.dealId);if(deal){deal.stage=stageByMeaning('proposal');addEntityHistory(deal,'Proposta criada',proposal.title);saveDeals(deals)}}closeProposalModal();showView('proposals')};
$('#receiptForm').onsubmit=event=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.target)),deals=getDeals(),deal=deals.find(item=>item.id===form.dealId);if(!deal)return;const wasReceived=deal.paymentStatus==='received';applyReceiptRules(deal,form);addEntityHistory(deal,'Recebimento atualizado',`${formatMoney(deal.receivedAmount)} recebido · Status ${deal.paymentStatus}`);saveDeals(deals);closeReceiptModal();renderReceipts();if(!wasReceived&&deal.paymentStatus==='received')showMicroCelebration('payment',formatMoney(deal.receivedAmount))};
$('#userForm').onsubmit=async event=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.target)),users=getUsers(),email=form.email.trim().toLowerCase();if(users.some(user=>user.email.toLowerCase()===email)){alert('Já existe um usuário com este e-mail.');return}const salt=createSalt();users.push({id:'user-'+Date.now(),name:form.name.trim(),email,salt,passwordHash:await derivePassword(form.password,salt),profile:form.profile,visibility:form.visibility,status:form.status,createdAt:new Date().toISOString(),createdBy:appState.currentUser?.id});saveUsers(users);closeUserModal();renderTeam();syncRankingAccess()};
$('#saveDealDetails').onclick=saveDealDetailChanges;
function winActiveDeal(){const deals=getDeals(),deal=deals.find(item=>item.id===appState.activeDealId);if(!deal)return;applyWonDealRules(deal);deal.wonAt=new Date().toISOString();createProvisionalReceipt(deal);addEntityHistory(deal,'Venda ganha','Negociação marcada como ganha');addEntityHistory(deal,'Recebimento criado',`${formatMoney(deal.value)} previsto · vencimento ${formatDate(deal.dueDate)}`);saveDeals(deals);openDealDrawer(deal.id);if(appState.currentView==='pipeline')renderPipeline($('#dealSearch').value);openReceiptModal(deal.id,true);showMicroCelebration('sale',formatMoney(deal.value))}
$('#markWon').onclick=winActiveDeal;
$('#markLost').onclick=()=>{if(!confirm('Confirmar esta oportunidade como perdida?'))return;const deals=getDeals(),deal=deals.find(item=>item.id===appState.activeDealId);if(!deal)return;applyLostDealRules(deal);addEntityHistory(deal,'Venda perdida','Negociação marcada como perdida pelo usuário');saveDeals(deals);openDealDrawer(deal.id);if(appState.currentView==='pipeline')renderPipeline($('#dealSearch').value)};
$('#markReceived').onclick=()=>{const value=Number($('#drawerDealValue').value);updateActiveDeal({paymentStatus:'received',receivedAmount:value,receivedAt:new Date().toISOString()},'Pagamento recebido',`Recebimento de ${formatMoney(value)} confirmado`);showMicroCelebration('payment',formatMoney(value))};
$('#interactionForm').onsubmit=event=>{event.preventDefault();const text=new FormData(event.target).get('text').trim();if(!text)return;const clients=getClients();const client=clients.find(item=>item.id===appState.activeClientId);client.interactions=client.interactions||[];client.interactions.unshift({id:'interaction-'+Date.now(),title:'Interação registrada',text,date:new Date().toISOString()});addEntityHistory(client,'Cliente atualizado','Nova interação registrada');saveClients(clients);event.target.reset();openClientDrawer(client.id)};
$('#exportBackup').onclick=exportBackup;$('#exportClientsCsv').onclick=exportClientsCsv;

function logout(){sessionStorage.removeItem(SESSION);location.reload()}
$('#logoutButton').onclick=logout;
$('#onboardingLogout').onclick=logout;
$('#menuButton').onclick=()=>$('.sidebar').classList.toggle('open');
function renderDateCardIdentity(){const target=$('#dateCardUser');if(target)target.textContent=appState.currentUser?.name||''}
function renderMenuNewBadges(){document.querySelectorAll('.sidebar nav button[data-view]').forEach(button=>{button.querySelector('.menu-new-badge')?.remove();if(NEW_MENU_ITEMS.includes(button.dataset.view))button.insertAdjacentHTML('beforeend','<em class="menu-new-badge">NOVO</em>')})}
setupJoinTeamFlow();
bootstrapCloudSync().then(result=>{if(!result.reloading)initialize()});
renderMenuNewBadges();
function renderRoleFocus(){
  const box=$('#roleFocus');
  if(!box||!appState.currentUser)return;
  const deals=dealsVisibleToCurrentUser(getDeals());
  const activities=getActivities().filter(activity=>!activity.done);
  const today=todayISO();
  const profile=appState.currentUser.profile||'Colaborador comercial';
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost');
  const won=deals.filter(deal=>deal.status==='won');
  const pendingReceipts=won.filter(deal=>deal.paymentStatus!=='received');
  const firstStage=pipelineStages[0]?.id;
  const byProfile={
    'Proprietário/Admin':{icon:'◎',title:'Visão do proprietário',text:open.length+' oportunidades abertas e '+pendingReceipts.length+' recebimentos para acompanhar.',target:'reports',action:'Ver visão geral'},
    'Gestor Comercial':{icon:'◇',title:'Foco da gestão comercial',text:open.filter(deal=>daysSince(deal.movedAt)>7).length+' negociações estão há mais de 7 dias sem avançar.',target:'pipeline',action:'Revisar o funil'},
    'SDR':{icon:'↗',title:'Foco de qualificação',text:open.filter(deal=>deal.stage===firstStage).length+' leads aguardam avanço na primeira etapa.',target:'pipeline',action:'Qualificar leads'},
    'Executivo de Contas':{icon:'◫',title:'Foco em fechamento',text:open.filter(deal=>pipelineStages.findIndex(stage=>stage.id===deal.stage)>=Math.max(1,pipelineStages.length-2)).length+' oportunidades estão próximas do fechamento.',target:'proposals',action:'Revisar propostas'},
    'Pós-venda':{icon:'○',title:'Foco no cliente',text:pendingReceipts.length+' vendas ainda precisam de acompanhamento de recebimento.',target:'receipts',action:'Acompanhar recebimentos'},
    'Colaborador comercial':{icon:'✓',title:'Seu foco de hoje',text:activities.filter(activity=>activity.date===today).length+' atividades estão previstas para hoje.',target:'activities',action:'Abrir atividades'}
  };
  const focus=byProfile[profile]||byProfile['Colaborador comercial'];
  box.innerHTML='<span class="role-focus-icon">'+focus.icon+'</span><div><strong>'+focus.title+'</strong><p>'+focus.text+'</p></div><button type="button" data-role-target="'+focus.target+'">'+focus.action+'</button>';
  box.querySelector('[data-role-target]')?.addEventListener('click',event=>showView(event.currentTarget.dataset.roleTarget));
}

function renderReports(){
  const deals=dealsVisibleToCurrentUser(getDeals());
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost');
  const won=deals.filter(deal=>deal.status==='won');
  const lost=deals.filter(deal=>deal.status==='lost');
  const valueOf=deal=>Number(deal.value)||0;
  const pipelineValue=open.reduce((total,deal)=>total+valueOf(deal),0);
  const wonValue=won.reduce((total,deal)=>total+valueOf(deal),0);
  const receivedValue=won.reduce((total,deal)=>total+(deal.paymentStatus==='received'?valueOf(deal):Math.min(Number(deal.receivedAmount)||0,valueOf(deal))),0);
  const conversionBase=won.length+lost.length;
  const conversion=conversionBase?Math.round(won.length/conversionBase*100):0;
  const commercialStages=commercialPipelineStages(pipelineStages);
  const forecast=open.reduce((total,deal)=>{
    const index=Math.max(0,commercialStages.findIndex(stage=>stage.id===deal.stage));
    const probability=Math.min(.85,.15+(index/Math.max(1,commercialStages.length-1))*.7);
    return total+valueOf(deal)*probability;
  },0);
  const receiptRate=wonValue?Math.round(receivedValue/wonValue*100):0;
  const setText=(selector,value)=>{const element=$(selector);if(element)element.textContent=value};
  setText('#forecastValue',formatMoney(forecast));
  setText('#reportPipeline',formatMoney(pipelineValue));
  setText('#reportOpenCount',open.length+' oportunidades abertas');
  setText('#reportWon',formatMoney(wonValue));
  setText('#reportWonCount',won.length+' vendas ganhas');
  setText('#reportReceived',formatMoney(receivedValue));
  setText('#reportReceivedRate',receiptRate+'% do valor vendido');
  setText('#reportConversion',conversion+'%');
  setMetricSemantic('#reportWon','success');
  setMetricSemantic('#reportReceived','success');
  const stageData=pipelineStages.map(stage=>{
    const stageDeals=open.filter(deal=>deal.stage===stage.id);
    return{stage,count:stageDeals.length,value:stageDeals.reduce((total,deal)=>total+valueOf(deal),0)};
  });
  const maxStage=Math.max(1,...stageData.map(item=>item.value||item.count));
  const chart=$('#stageChart');
  if(chart)chart.innerHTML=deals.length?stageData.map(item=>'<div class="stage-row"><div class="stage-row-label"><strong>'+item.stage.label+'</strong><span>'+item.count+' · '+formatMoney(item.value)+'</span></div><div class="stage-bar"><span style="width:'+Math.max(item.count?8:0,Math.round((item.value||item.count)/maxStage*100))+'%"></span></div></div>').join(''):orbitEmptyState('Seu primeiro retrato comercial','O Orbit montará este gráfico assim que uma oportunidade entrar no funil.');
  const pendingActivities=getActivities().filter(activity=>!activity.done);
  const overdue=pendingActivities.filter(activity=>activity.date&&activity.date<todayISO()).length;
  const withoutNext=open.filter(deal=>!deal.nextAction||!deal.nextActionDate).length;
  const stalled=open.filter(deal=>daysSince(deal.movedAt)>7).length;
  const pendingValue=Math.max(0,wonValue-receivedValue);
  const insights=[
    {tone:overdue?'attention':'good',title:overdue?overdue+' atividades atrasadas':'Atividades em ordem',text:overdue?'Priorize os retornos vencidos antes de abrir novas tarefas.':'Nenhuma atividade vencida neste momento.'},
    {tone:withoutNext?'attention':'good',title:withoutNext?withoutNext+' negócios sem próximo passo':'Funil bem preparado',text:withoutNext?'Defina uma ação e uma data para cada negociação ativa.':'Todas as oportunidades abertas têm continuidade definida.'},
    {tone:pendingValue?'neutral':'good',title:pendingValue?formatMoney(pendingValue)+' a receber':'Recebimentos atualizados',text:pendingValue?'A venda só termina quando o dinheiro entra.':'Não há valor vendido pendente de recebimento.'},
    {tone:stalled?'attention':'good',title:stalled?stalled+' oportunidades paradas':'Funil em movimento',text:stalled?'Revise negociações sem avanço há mais de sete dias.':'Nenhuma oportunidade está parada há mais de sete dias.'}
  ];
  const insightBox=$('#reportInsights');
  if(insightBox)insightBox.innerHTML=deals.length?insights.map(item=>'<article class="report-insight '+item.tone+'"><span></span><div><strong>'+item.title+'</strong><p>'+item.text+'</p></div></article>').join(''):orbitEmptyState('Ainda estou aprendendo sobre suas vendas','Cadastre uma oportunidade e o Orbit começará a destacar riscos, avanços e próximos passos.');
  renderCommercialPulse(deals);
  renderForecastTimeline(deals);
  renderTeamPerformance(deals);
  renderDataQuality(deals);
}
function getOrbitAttentionItems(){
  if(!appState.currentUser)return[];
  const deals=dealsVisibleToCurrentUser(getDeals());
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost');
  const items=[];
  getActivities().filter(activity=>!activity.done&&activity.date&&activity.date<todayISO()).forEach(activity=>items.push({priority:1,type:'Atividade atrasada',title:activity.title||'Atividade pendente',detail:(activity.client||'Sem cliente')+' · prevista para '+activity.date,target:'activities'}));
  open.filter(deal=>!deal.nextAction||!deal.nextActionDate).forEach(deal=>items.push({priority:2,type:'Sem próximo passo',title:deal.title||deal.name||'Oportunidade',detail:'Defina uma ação e uma data para manter a negociação viva.',target:'pipeline'}));
  open.filter(deal=>daysSince(deal.movedAt)>7).forEach(deal=>items.push({priority:3,type:'Negociação parada',title:deal.title||deal.name||'Oportunidade',detail:'Sem avanço há '+daysSince(deal.movedAt)+' dias.',target:'pipeline'}));
  deals.filter(deal=>deal.status==='won'&&deal.paymentStatus!=='received').forEach(deal=>items.push({priority:4,type:'Recebimento pendente',title:deal.title||deal.name||'Venda concluída',detail:formatMoney(Math.max(0,(Number(deal.value)||0)-(Number(deal.receivedAmount)||0)))+' ainda não recebido.',target:'receipts'}));
  return items.sort((a,b)=>a.priority-b.priority).slice(0,20);
}

function refreshOrbitAttention(){
  const trigger=$('#orbitAttentionTrigger');
  if(!trigger)return;
  trigger.hidden=!appState.currentUser;
  if(!appState.currentUser)return;
  const items=getOrbitAttentionItems();
  const badge=$('#orbitAttentionCount');
  if(badge){badge.textContent=items.length>9?'9+':items.length;badge.hidden=!items.length}
  trigger.setAttribute('aria-label',items.length?items.length+' pontos precisam de atenção':'Nenhum ponto urgente');
}

function renderOrbitAttention(){
  const list=$('#orbitAttentionList');
  if(!list)return;
  const items=getOrbitAttentionItems();
  list.innerHTML=items.length?items.map((item,index)=>'<button type="button" class="orbit-attention-item priority-'+item.priority+'" data-attention-target="'+item.target+'"><span class="attention-index">'+(index+1)+'</span><span><small>'+item.type+'</small><strong>'+escapeHtml(item.title)+'</strong><p>'+escapeHtml(item.detail)+'</p></span><i>›</i></button>').join(''):'<div class="orbit-attention-empty"><span>✓</span><strong>Tudo sob controle</strong><p>O Orbit não encontrou nenhum ponto urgente agora.</p></div>';
  list.querySelectorAll('[data-attention-target]').forEach(button=>button.addEventListener('click',()=>{closeOrbitAttention();showView(button.dataset.attentionTarget)}));
  const summary=$('#orbitAttentionSummary');
  if(summary)summary.textContent=items.length?items.length+' recomendações ordenadas por prioridade':'Seu dia está organizado';
}

function openOrbitAttention(){
  renderOrbitAttention();
  $('#orbitAttentionPanel')?.classList.add('open');
  $('#orbitAttentionBackdrop')?.classList.add('open');
  document.body.classList.add('attention-open');
}

function closeOrbitAttention(){
  $('#orbitAttentionPanel')?.classList.remove('open');
  $('#orbitAttentionBackdrop')?.classList.remove('open');
  document.body.classList.remove('attention-open');
}

function installOrbitAttention(){
  if($('#orbitAttentionTrigger'))return;
  document.body.insertAdjacentHTML('beforeend','<button type="button" id="orbitAttentionTrigger" class="orbit-attention-trigger" aria-haspopup="dialog" hidden><span class="orbit-attention-orb">O</span><span class="orbit-attention-label">Atenção</span><b id="orbitAttentionCount" hidden>0</b></button><div id="orbitAttentionBackdrop" class="orbit-attention-backdrop"></div><aside id="orbitAttentionPanel" class="orbit-attention-panel" role="dialog" aria-modal="true" aria-labelledby="orbitAttentionTitle"><header><div><small>ORBIT · PRIORIDADES</small><h2 id="orbitAttentionTitle">Central de Atenção</h2><p id="orbitAttentionSummary">Leitura rápida do seu CRM</p></div><button type="button" id="closeOrbitAttention" aria-label="Fechar">×</button></header><div id="orbitAttentionList" class="orbit-attention-list"></div><footer>As recomendações são calculadas localmente com os dados do seu CRM.</footer></aside>');
  $('#orbitAttentionTrigger').addEventListener('click',openOrbitAttention);
  $('#closeOrbitAttention').addEventListener('click',closeOrbitAttention);
  $('#orbitAttentionBackdrop').addEventListener('click',closeOrbitAttention);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeOrbitAttention()});
  new MutationObserver(refreshOrbitAttention).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class','style']});
  refreshOrbitAttention();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installOrbitAttention);else installOrbitAttention();
const SALES_GOAL_KEY='niviontech_sales_goal';

function installCommercialPulse(){
  const reports=$('#reportsView');
  if(!reports||$('#commercialPulse'))return;
  reports.insertAdjacentHTML('beforeend','<section id="commercialPulse" class="commercial-pulse"><article class="monthly-goal"><header><div><small>META COMERCIAL</small><h3>Objetivo do mês</h3></div><button type="button" id="editSalesGoal">Definir meta</button></header><div class="goal-values"><strong id="goalProgressValue">R$ 0</strong><span>de <b id="salesGoalValue">R$ 0</b></span></div><div class="goal-track"><span id="goalProgressBar"></span></div><div class="goal-footer"><span id="goalProgressPercent">0% alcançado</span><span id="goalRemaining">Defina sua primeira meta</span></div></article><article class="orbit-pulse"><div class="pulse-score"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50"></circle><circle id="pulseRing" cx="60" cy="60" r="50"></circle></svg><div><strong id="pulseScore">100</strong><span>/100</span></div></div><div class="pulse-copy"><small>ORBIT · PULSO COMERCIAL</small><h3 id="pulseTitle">Operação saudável</h3><p id="pulseAdvice">Continue mantendo as atividades e os próximos passos atualizados.</p></div></article></section>');
  $('#editSalesGoal').addEventListener('click',()=>{
    const current=Number(localStorage.getItem(SALES_GOAL_KEY))||0;
    const answer=window.prompt('Qual é a meta de vendas deste mês em reais?',current||'');
    if(answer===null)return;
    const value=Number(String(answer).replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,''));
    if(!Number.isFinite(value)||value<=0){showToast?.('Informe um valor de meta válido.');return}
    localStorage.setItem(SALES_GOAL_KEY,String(value));
    renderCommercialPulse(dealsVisibleToCurrentUser(getDeals()));
  });
}

function renderCommercialPulse(deals){
  installCommercialPulse();
  if(!$('#commercialPulse'))return;
  const now=new Date();
  const isCurrentMonth=deal=>{
    const raw=deal.wonAt||deal.updatedAt||deal.createdAt;
    if(!raw)return true;
    const date=new Date(raw);
    return !Number.isNaN(date.getTime())&&date.getMonth()===now.getMonth()&&date.getFullYear()===now.getFullYear();
  };
  const wonMonth=deals.filter(deal=>deal.status==='won'&&isCurrentMonth(deal));
  const sold=wonMonth.reduce((total,deal)=>total+(Number(deal.value)||0),0);
  const goal=Number(localStorage.getItem(SALES_GOAL_KEY))||0;
  const percent=goal?Math.min(100,Math.round(sold/goal*100)):0;
  $('#goalProgressValue').textContent=formatMoney(sold);
  $('#salesGoalValue').textContent=goal?formatMoney(goal):'a definir';
  $('#goalProgressBar').style.width=percent+'%';
  $('#goalProgressPercent').textContent=goal?percent+'% alcançado':'Meta ainda não definida';
  $('#goalRemaining').textContent=goal?(sold>=goal?'Meta alcançada':formatMoney(goal-sold)+' para alcançar'):'Use “Definir meta”';
  $('#editSalesGoal').textContent=goal?'Editar meta':'Definir meta';
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost');
  const overdue=getActivities().filter(activity=>!activity.done&&activity.date&&activity.date<todayISO()).length;
  const withoutNext=open.filter(deal=>!deal.nextAction||!deal.nextActionDate).length;
  const stalled=open.filter(deal=>daysSince(deal.movedAt)>7).length;
  const pending=deals.filter(deal=>deal.status==='won'&&deal.paymentStatus!=='received').length;
  const score=Math.max(0,100-Math.min(100,overdue*6+withoutNext*7+stalled*5+pending*4));
  $('#pulseScore').textContent=score;
  const ring=$('#pulseRing');
  const circumference=314.16;
  ring.style.strokeDasharray=circumference;
  ring.style.strokeDashoffset=circumference-(circumference*score/100);
  ring.classList.toggle('warning',score<70);
  ring.classList.toggle('critical',score<45);
  let title='Operação saudável',advice='Continue mantendo as atividades e os próximos passos atualizados.';
  if(score<70){title='Existem pontos de atenção';advice=overdue?'Comece pelas atividades atrasadas para recuperar o ritmo comercial.':withoutNext?'Defina o próximo passo das oportunidades abertas.':'Revise as negociações paradas no funil.'}
  if(score<45){title='A operação precisa de foco';advice='Abra a Central de Atenção do Orbit e resolva primeiro os itens mais urgentes.'}
  $('#pulseTitle').textContent=title;
  $('#pulseAdvice').textContent=advice;
}
function globalSearchRecords(query){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const term=normalize(query).trim();
  if(!term)return[];
  const records=[];
  getClients().forEach(client=>records.push({type:'Cliente',title:client.name||client.company||'Cliente sem nome',detail:[client.email,client.phone,client.city].filter(Boolean).join(' · '),target:'clients',search:JSON.stringify(client)}));
  dealsVisibleToCurrentUser(getDeals()).forEach(deal=>records.push({type:'Oportunidade',title:deal.title||deal.name||'Oportunidade sem nome',detail:[deal.client,formatMoney(Number(deal.value)||0),pipelineStages.find(stage=>stage.id===deal.stage)?.label].filter(Boolean).join(' · '),target:'pipeline',search:JSON.stringify(deal)}));
  getActivities().forEach(activity=>records.push({type:'Atividade',title:activity.title||'Atividade',detail:[activity.client,activity.date,activity.time].filter(Boolean).join(' · '),target:'activities',search:JSON.stringify(activity)}));
  getProposals().forEach(proposal=>records.push({type:'Proposta',title:proposal.title||proposal.client||'Proposta',detail:[proposal.client,proposal.status,formatMoney(Number(proposal.value)||0)].filter(Boolean).join(' · '),target:'proposals',search:JSON.stringify(proposal)}));
  return records.filter(record=>normalize(record.title+' '+record.detail+' '+record.search).includes(term)).slice(0,12);
}

function renderGlobalSearch(query=''){
  const results=$('#globalSearchResults');
  if(!results)return;
  const records=globalSearchRecords(query);
  if(!query.trim()){
    results.innerHTML='<div class="global-search-shortcuts"><small>ACESSO RÁPIDO</small><button data-search-target="today"><span>01</span><strong>O que preciso fazer hoje?</strong><i>Hoje</i></button><button data-search-target="pipeline"><span>02</span><strong>Abrir o funil de vendas</strong><i>Funil</i></button><button data-search-target="clients"><span>03</span><strong>Consultar clientes</strong><i>Clientes</i></button><button data-search-target="reports"><span>04</span><strong>Ver resultados comerciais</strong><i>Relatórios</i></button></div>';
  }else if(!records.length){
    results.innerHTML='<div class="global-search-empty"><span>Q</span><strong>Nenhum resultado encontrado</strong><p>Tente pesquisar pelo nome, telefone, empresa ou atividade.</p></div>';
  }else{
    results.innerHTML='<div class="global-search-count">'+records.length+' resultados encontrados</div>'+records.map(record=>'<button class="global-search-result" data-search-target="'+record.target+'"><span class="search-type '+record.type.toLowerCase()+'">'+record.type.charAt(0)+'</span><span><small>'+record.type+'</small><strong>'+escapeHtml(record.title)+'</strong><p>'+escapeHtml(record.detail||'Registro do CRM')+'</p></span><i>›</i></button>').join('');
  }
  results.querySelectorAll('[data-search-target]').forEach(button=>button.addEventListener('click',()=>{closeGlobalSearch();showView(button.dataset.searchTarget)}));
}

function openGlobalSearch(){
  if(!appState.currentUser)return;
  $('#globalSearchModal')?.classList.add('open');
  $('#globalSearchBackdrop')?.classList.add('open');
  document.body.classList.add('global-search-open');
  const input=$('#globalSearchInput');
  if(input){input.value='';renderGlobalSearch('');setTimeout(()=>input.focus(),80)}
}

function closeGlobalSearch(){
  $('#globalSearchModal')?.classList.remove('open');
  $('#globalSearchBackdrop')?.classList.remove('open');
  document.body.classList.remove('global-search-open');
}

function installGlobalSearch(){
  if($('#globalSearchTrigger'))return;
  document.body.insertAdjacentHTML('beforeend','<button type="button" id="globalSearchTrigger" class="global-search-trigger" hidden><span>Q</span><strong>Buscar</strong><kbd>Ctrl K</kbd></button><div id="globalSearchBackdrop" class="global-search-backdrop"></div><section id="globalSearchModal" class="global-search-modal" role="dialog" aria-modal="true" aria-labelledby="globalSearchTitle"><header><span>Q</span><div><small>BUSCA GLOBAL</small><h2 id="globalSearchTitle">Encontre qualquer coisa</h2></div><button type="button" id="closeGlobalSearch" aria-label="Fechar">×</button></header><label class="global-search-field"><span>Q</span><input id="globalSearchInput" type="search" autocomplete="off" placeholder="Busque clientes, negócios, atividades ou propostas..."><kbd>ESC</kbd></label><div id="globalSearchResults" class="global-search-results"></div><footer><span>Use a busca para navegar mais rápido pelo NivionTech CRM.</span><span><kbd>ENTER</kbd> abrir</span></footer></section>');
  $('#globalSearchTrigger').addEventListener('click',openGlobalSearch);
  $('#closeGlobalSearch').addEventListener('click',closeGlobalSearch);
  $('#globalSearchBackdrop').addEventListener('click',closeGlobalSearch);
  $('#globalSearchInput').addEventListener('input',event=>renderGlobalSearch(event.target.value));
  $('#globalSearchInput').addEventListener('keydown',event=>{if(event.key==='Enter')$('#globalSearchResults [data-search-target]')?.click()});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openGlobalSearch()}else if(event.key==='Escape')closeGlobalSearch()});
  const refresh=()=>{$('#globalSearchTrigger').hidden=!appState.currentUser};
  new MutationObserver(refresh).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class','style']});
  refresh();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installGlobalSearch);else installGlobalSearch();
function installForecastTimeline(){
  const reports=$('#reportsView');
  if(!reports||$('#forecastTimeline'))return;
  const html='<section id="forecastTimeline" class="forecast-timeline"><header><div><small>PLANEJAMENTO COMERCIAL</small><h3>Previsão de entrada</h3><p>Valores ponderados pela maturidade de cada oportunidade.</p></div><span id="forecastMissingDates">Datas organizadas</span></header><div id="forecastPeriods" class="forecast-periods"></div><div class="forecast-legend"><span><i></i> Valor ponderado</span><span><i></i> Valor total das oportunidades</span></div></section>';
  const pulse=$('#commercialPulse');
  if(pulse)pulse.insertAdjacentHTML('beforebegin',html);else reports.insertAdjacentHTML('beforeend',html);
}

function renderForecastTimeline(deals){
  installForecastTimeline();
  const container=$('#forecastPeriods');
  if(!container)return;
  const today=new Date();today.setHours(0,0,0,0);
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost');
  const dated=[],withoutDate=[],commercialStages=commercialPipelineStages(pipelineStages);
  open.forEach(deal=>{
    const raw=deal.expectedCloseDate||deal.closeDate||deal.nextActionDate;
    if(!raw){withoutDate.push(deal);return}
    const date=new Date(raw+'T12:00:00');
    if(Number.isNaN(date.getTime())){withoutDate.push(deal);return}
    const days=Math.ceil((date-today)/86400000);
    const stageIndex=Math.max(0,commercialStages.findIndex(stage=>stage.id===deal.stage));
    const probability=Math.min(.9,.15+(stageIndex/Math.max(1,commercialStages.length-1))*.75);
    dated.push({...deal,days,probability,rawValue:Number(deal.value)||0});
  });
  const periods=[
    {label:'Próximos 30 dias',hint:'Curto prazo',from:-Infinity,to:30},
    {label:'De 31 a 60 dias',hint:'Médio prazo',from:31,to:60},
    {label:'De 61 a 90 dias',hint:'Planejamento',from:61,to:90}
  ].map(period=>{
    const records=dated.filter(deal=>deal.days>=period.from&&deal.days<=period.to);
    return{...period,records,total:records.reduce((sum,deal)=>sum+deal.rawValue,0),weighted:records.reduce((sum,deal)=>sum+deal.rawValue*deal.probability,0)};
  });
  const maxValue=Math.max(1,...periods.map(period=>period.total));
  container.innerHTML=periods.map((period,index)=>'<article class="forecast-period"><div class="forecast-period-top"><span>0'+(index+1)+'</span><div><small>'+period.hint+'</small><strong>'+period.label+'</strong></div><b>'+period.records.length+' negócios</b></div><div class="forecast-amount"><strong>'+formatMoney(period.weighted)+'</strong><span>de '+formatMoney(period.total)+'</span></div><div class="forecast-bars"><span style="width:'+Math.round(period.weighted/maxValue*100)+'%"></span><i style="width:'+Math.round(period.total/maxValue*100)+'%"></i></div></article>').join('');
  const missing=$('#forecastMissingDates');
  if(missing){missing.textContent=withoutDate.length?withoutDate.length+' negócios sem data':'Todas as datas organizadas';missing.classList.toggle('attention',Boolean(withoutDate.length))}
}
function installTeamPerformance(){
  const reports=$('#reportsView');
  if(!reports||$('#teamPerformance'))return;
  const html='<section id="teamPerformance" class="team-performance"><header><div><small>DESEMPENHO COMERCIAL</small><h3 id="teamPerformanceTitle">Resultado por responsável</h3><p>Comparativo de carteira, vendas e dinheiro recebido.</p></div><span id="teamPerformanceTotal">0 responsáveis</span></header><div id="teamPerformanceList" class="team-performance-list"></div></section>';
  const forecast=$('#forecastTimeline');
  const pulse=$('#commercialPulse');
  if(forecast)forecast.insertAdjacentHTML('beforebegin',html);else if(pulse)pulse.insertAdjacentHTML('beforebegin',html);else reports.insertAdjacentHTML('beforeend',html);
}

function renderTeamPerformance(deals){
  installTeamPerformance();
  const list=$('#teamPerformanceList');
  if(!list)return;
  const owners=new Map();
  const ownerName=deal=>{
    const owner=deal.ownerName||(deal.owner&&typeof deal.owner==='object'?deal.owner.name:deal.owner)||deal.assignee||deal.responsible;
    return String(owner||appState.currentUser?.name||'Sem responsável');
  };
  deals.forEach(deal=>{
    const name=ownerName(deal);
    if(!owners.has(name))owners.set(name,{name,open:0,pipeline:0,won:0,wonValue:0,lost:0,received:0});
    const item=owners.get(name),value=Number(deal.value)||0;
    if(deal.status==='won'){
      item.won++;item.wonValue+=value;
      item.received+=deal.paymentStatus==='received'?value:Math.min(Number(deal.receivedAmount)||0,value);
    }else if(deal.status==='lost')item.lost++;
    else{item.open++;item.pipeline+=value}
  });
  const data=[...owners.values()].map(item=>({...item,conversion:item.won+item.lost?Math.round(item.won/(item.won+item.lost)*100):0})).sort((a,b)=>b.wonValue-a.wonValue||b.pipeline-a.pipeline);
  const maxResult=Math.max(1,...data.map(item=>item.wonValue));
  const managerial=['Proprietário/Admin','Gestor Comercial'].includes(appState.currentUser?.profile);
  $('#teamPerformanceTitle').textContent=managerial?'Resultado por responsável':'Meu desempenho comercial';
  $('#teamPerformanceTotal').textContent=data.length+' '+(data.length===1?'responsável':'responsáveis');
  list.innerHTML=data.length?data.map((item,index)=>'<article class="performance-row"><div class="performance-person"><span>'+(index+1)+'</span><div><strong>'+escapeHtml(item.name)+'</strong><small>'+item.open+' oportunidades abertas</small></div></div><div class="performance-kpi"><small>Carteira</small><strong>'+formatMoney(item.pipeline)+'</strong></div><div class="performance-kpi"><small>Vendido</small><strong>'+formatMoney(item.wonValue)+'</strong></div><div class="performance-kpi"><small>Recebido</small><strong>'+formatMoney(item.received)+'</strong></div><div class="performance-conversion"><strong>'+item.conversion+'%</strong><span>conversão</span></div><div class="performance-bar"><span style="width:'+Math.max(item.wonValue?6:0,Math.round(item.wonValue/maxResult*100))+'%"></span></div></article>').join(''):'<div class="team-performance-empty"><strong>O desempenho aparecerá aqui</strong><p>Cadastre oportunidades e responsáveis para iniciar o acompanhamento.</p></div>';
}
function installDataQuality(){
  const reports=$('#reportsView');
  if(!reports||$('#dataQuality'))return;
  const html='<section id="dataQuality" class="data-quality"><header><div><small>QUALIDADE DA BASE</small><h3>Organização dos dados</h3><p>O Orbit verifica os registros que podem prejudicar sua operação.</p></div><div class="quality-score"><strong id="dataQualityScore">100</strong><span>/100</span></div></header><div id="dataQualityIssues" class="data-quality-issues"></div></section>';
  const team=$('#teamPerformance');
  const forecast=$('#forecastTimeline');
  if(team)team.insertAdjacentHTML('beforebegin',html);else if(forecast)forecast.insertAdjacentHTML('beforebegin',html);else reports.insertAdjacentHTML('beforeend',html);
}

function renderDataQuality(deals){
  installDataQuality();
  const box=$('#dataQualityIssues');
  if(!box)return;
  const clients=getClients();
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost');
  const missingContact=clients.filter(client=>!client.email&&!client.phone&&!client.whatsapp).length;
  const normalized=[];
  clients.forEach(client=>{
    const email=String(client.email||'').trim().toLowerCase();
    const phone=String(client.phone||client.whatsapp||'').replace(/\D/g,'');
    if(email)normalized.push('e:'+email);
    if(phone)normalized.push('p:'+phone);
  });
  const counts=normalized.reduce((map,value)=>(map[value]=(map[value]||0)+1,map),{});
  const duplicates=Object.values(counts).filter(count=>count>1).reduce((total,count)=>total+count-1,0);
  const missingOwner=open.filter(deal=>!deal.owner&&!deal.ownerName&&!deal.assignee&&!deal.responsible).length;
  const missingNext=open.filter(deal=>!deal.nextAction||!deal.nextActionDate).length;
  const missingValue=open.filter(deal=>!(Number(deal.value)>0)).length;
  const issueTotal=missingContact+duplicates+missingOwner+missingNext+missingValue;
  const opportunities=Math.max(1,clients.length*2+open.length*3);
  const score=Math.max(0,Math.round(100-issueTotal/opportunities*100));
  const scoreElement=$('#dataQualityScore');
  scoreElement.textContent=score;
  scoreElement.parentElement.classList.toggle('warning',score<80);
  scoreElement.parentElement.classList.toggle('critical',score<55);
  const issues=[
    {count:missingContact,label:'Clientes sem contato',text:'Inclua telefone, WhatsApp ou e-mail.',target:'clients',tone:'contact'},
    {count:duplicates,label:'Possíveis duplicidades',text:'Revise contatos com telefone ou e-mail repetido.',target:'clients',tone:'duplicate'},
    {count:missingOwner,label:'Negócios sem responsável',text:'Defina quem cuidará de cada oportunidade.',target:'pipeline',tone:'owner'},
    {count:missingNext,label:'Sem próximo passo',text:'Toda negociação precisa de ação e data.',target:'pipeline',tone:'next'},
    {count:missingValue,label:'Oportunidades sem valor',text:'Informe uma estimativa para melhorar a previsão.',target:'pipeline',tone:'value'}
  ];
  box.innerHTML=issues.map(issue=>'<button type="button" class="quality-issue '+(issue.count?'has-issue':'is-good')+'" data-quality-target="'+issue.target+'"><span class="quality-issue-icon '+issue.tone+'">'+(issue.count?issue.count:'✓')+'</span><span><strong>'+issue.label+'</strong><small>'+issue.text+'</small></span><i>›</i></button>').join('');
  box.querySelectorAll('[data-quality-target]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.qualityTarget)));
}
function createFullLocalBackup(reason='manual'){
  const storage={};
  for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);
    if(key)storage[key]=localStorage.getItem(key);
  }
  return{app:'NivionTech CRM',format:'niviontech-full-backup',version:1,createdAt:new Date().toISOString(),reason,storage};
}

function downloadFullLocalBackup(reason='manual'){
  const backup=createFullLocalBackup(reason);
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  const date=backup.createdAt.slice(0,10);
  link.href=url;
  link.download='NivionTech-CRM-backup-'+date+(reason==='pre-restore'?'-antes-da-restauracao':'')+'.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  localStorage.setItem('niviontech_last_backup',backup.createdAt);
  renderBackupProtectionStatus();
  if(typeof showToast==='function')showToast('Backup completo criado com segurança.');
}

function renderBackupProtectionStatus(){
  const status=$('#backupProtectionStatus');
  if(!status)return;
  const last=localStorage.getItem('niviontech_last_backup');
  status.textContent=last?'Última cópia: '+new Date(last).toLocaleString('pt-BR'):'Nenhum backup completo criado neste navegador';
}

async function restoreFullLocalBackup(file){
  let backup;
  try{backup=JSON.parse(await file.text())}catch(error){if(typeof showToast==='function')showToast('O arquivo não contém um backup válido.');return}
  const valid=backup&&backup.app==='NivionTech CRM'&&backup.format==='niviontech-full-backup'&&backup.storage&&typeof backup.storage==='object'&&Object.keys(backup.storage).length;
  if(!valid){if(typeof showToast==='function')showToast('Este arquivo não é um backup completo do NivionTech CRM.');return}
  const created=backup.createdAt?new Date(backup.createdAt).toLocaleString('pt-BR'):'data não identificada';
  const confirmed=window.confirm('Restaurar o backup criado em '+created+'?\n\nOs dados atuais serão substituídos. Antes disso, o CRM baixará uma cópia de segurança do estado atual.');
  if(!confirmed)return;
  downloadFullLocalBackup('pre-restore');
  const preservedLastBackup=localStorage.getItem('niviontech_last_backup');
  localStorage.clear();
  Object.entries(backup.storage).forEach(([key,value])=>localStorage.setItem(key,String(value)));
  if(preservedLastBackup)localStorage.setItem('niviontech_last_backup',preservedLastBackup);
  window.alert('Backup restaurado. O NivionTech CRM será reiniciado agora.');
  window.location.reload();
}

function installBackupProtection(){
  const settings=$('#settingsView');
  if(!settings||$('#backupProtection'))return;
  settings.insertAdjacentHTML('beforeend','<section id="backupProtection" class="backup-protection"><div class="backup-protection-icon"><span>N</span></div><div class="backup-protection-copy"><small>PROTEÇÃO DOS DADOS</small><h3>Backup completo e restauração</h3><p>Guarde uma cópia de clientes, usuários, funil, atividades, propostas, recebimentos e configurações.</p><span id="backupProtectionStatus">Nenhum backup completo criado neste navegador</span></div><div class="backup-protection-actions"><button type="button" id="downloadFullBackup">Baixar backup completo</button><button type="button" id="restoreFullBackup">Restaurar backup</button><input id="restoreFullBackupInput" type="file" accept="application/json,.json" hidden></div><div class="backup-protection-note"><strong>Importante</strong><span>O arquivo pode conter dados comerciais e deve ser armazenado em local seguro.</span></div></section>');
  $('#downloadFullBackup').addEventListener('click',()=>downloadFullLocalBackup('manual'));
  $('#restoreFullBackup').addEventListener('click',()=>$('#restoreFullBackupInput').click());
  $('#restoreFullBackupInput').addEventListener('change',event=>{const file=event.target.files?.[0];if(file)restoreFullLocalBackup(file);event.target.value=''});
  renderBackupProtectionStatus();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installBackupProtection);else installBackupProtection();
function refreshStageAccumulatedValues(){
  const view=$('#pipelineView');
  if(!view||!appState.currentUser)return;
  let columns=[...view.querySelectorAll('.kanban-column,.pipeline-column,[data-pipeline-stage],[data-stage-column]')];
  if(!columns.length){
    const board=view.querySelector('.kanban-board,.pipeline-board,#kanbanBoard,#pipelineBoard');
    if(board)columns=[...board.children].filter(element=>element.matches('section,article,div'));
  }
  if(!columns.length)return;
  const deals=dealsVisibleToCurrentUser(getDeals()),commercialStages=commercialPipelineStages(pipelineStages);
  columns.slice(0,pipelineStages.length).forEach((column,index)=>{
    const stageId=column.dataset.stage||column.dataset.pipelineStage||column.dataset.stageColumn||pipelineStages[index]?.id;
    if(!stageId)return;
    const commercialIndex=commercialStages.findIndex(stage=>stage.id===stageId),progress=Math.round(Math.max(0,commercialIndex)/Math.max(1,commercialStages.length-1)*100);
    column.classList.add('stage-semantic-progress');
    const semanticColor=stageId==='lost'?'var(--status-danger)':stageId==='won'?'var(--status-success)':stageId==='after-sales'?'color-mix(in srgb, var(--navy) 65%, white)':'color-mix(in srgb, var(--navy) '+(100-progress)+'%, var(--status-success) '+progress+'%)';
    column.style.setProperty('--stage-progress-color',semanticColor);
    const total=deals.filter(deal=>deal.stage===stageId).reduce((sum,deal)=>sum+(Number(deal.value)||0),0);
    const header=column.querySelector('.kanban-column-header,.pipeline-column-header,.column-header,:scope > header')||column.firstElementChild;
    if(!header)return;
    let stageIndicator=header.querySelector('.semantic-stage-indicator,.column-dot,.stage-dot,.kanban-dot,[class*="stage-indicator"]');
    if(!stageIndicator){
      stageIndicator=[...header.querySelectorAll('span,i')].find(element=>{
        if(element.textContent.trim())return false;
        const rect=element.getBoundingClientRect();
        return rect.width>=4&&rect.width<=18&&rect.height>=4&&rect.height<=18;
      });
    }
    if(!stageIndicator){stageIndicator=document.createElement('i');header.prepend(stageIndicator)}
    stageIndicator.classList.add('semantic-stage-indicator');
    let amount=header.querySelector('[data-stage-total]');
    if(!amount){
      amount=[...header.querySelectorAll('span,b,strong')].find(element=>/^R\$\s*/.test(element.textContent.trim()));
      if(amount)amount.dataset.stageTotal='true';
    }
    if(!amount){amount=document.createElement('span');amount.dataset.stageTotal='true';header.appendChild(amount)}
    amount.classList.add('stage-accumulated-value');
    const formatted=formatMoney(total);
    if(amount.textContent!==formatted)amount.textContent=formatted;
    amount.title='Valor acumulado nesta etapa';
  });
}

function installStageAccumulatedValues(){
  const view=$('#pipelineView');
  if(!view||view.dataset.stageTotalsReady)return;
  view.dataset.stageTotalsReady='true';
  let scheduled=false;
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refreshStageAccumulatedValues()})};
  new MutationObserver(schedule).observe(view,{childList:true,subtree:true});
  schedule();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installStageAccumulatedValues);else installStageAccumulatedValues();
const CUSTOM_PIPELINE_KEY='niviontech_custom_pipeline_stages';
let funnelEditorDraft=[];

function persistEditedDeals(deals){
  if(typeof saveDeals==='function'){saveDeals(deals);return true}
  if(typeof setDeals==='function'){setDeals(deals);return true}
  for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);if(!key)continue;
    try{
      const value=JSON.parse(localStorage.getItem(key));
      if(Array.isArray(value)&&value.some(item=>item&&item.id&&item.stage&&item.value!==undefined)){
        localStorage.setItem(key,JSON.stringify(deals));return true;
      }
    }catch(error){}
  }
  return false;
}

function renderFunnelEditorRows(){
  const list=$('#funnelEditorRows');if(!list)return;
  const deals=getDeals();
  list.innerHTML=funnelEditorDraft.map((stage,index)=>{
    const count=deals.filter(deal=>deal.stage===stage.id).length,protectedStage=['won','after-sales','lost'].includes(stage.id),removeDisabled=count||protectedStage,removeTitle=protectedStage?'Etapa de resultado protegida':count?'Mova os cards antes de remover':'';
    return'<div class="funnel-editor-row" data-editor-index="'+index+'"><span class="funnel-drag-handle">'+String(index+1).padStart(2,'0')+'</span><label><small>NOME DA ETAPA</small><input type="text" value="'+escapeHtml(stage.label)+'" maxlength="32" data-stage-label="'+index+'"></label><span class="funnel-stage-count">'+count+' '+(count===1?'card':'cards')+'</span><div class="funnel-row-actions"><button type="button" data-stage-up="'+index+'" '+(index===0?'disabled':'')+' aria-label="Mover etapa para esquerda">←</button><button type="button" data-stage-down="'+index+'" '+(index===funnelEditorDraft.length-1?'disabled':'')+' aria-label="Mover etapa para direita">→</button><button type="button" data-stage-remove="'+index+'" '+(removeDisabled?'disabled':'')+(removeTitle?' title="'+removeTitle+'"':'')+' aria-label="Remover etapa">×</button></div></div>';
  }).join('');
  list.querySelectorAll('[data-stage-label]').forEach(input=>input.addEventListener('input',event=>{funnelEditorDraft[Number(event.target.dataset.stageLabel)].label=event.target.value}));
  list.querySelectorAll('[data-stage-up]').forEach(button=>button.addEventListener('click',()=>moveFunnelStage(Number(button.dataset.stageUp),-1)));
  list.querySelectorAll('[data-stage-down]').forEach(button=>button.addEventListener('click',()=>moveFunnelStage(Number(button.dataset.stageDown),1)));
  list.querySelectorAll('[data-stage-remove]').forEach(button=>button.addEventListener('click',()=>{if(funnelEditorDraft.length<=2){if(typeof showToast==='function')showToast('O funil precisa ter pelo menos duas etapas.');return}funnelEditorDraft.splice(Number(button.dataset.stageRemove),1);renderFunnelEditorRows()}));
}

function moveFunnelStage(index,direction){
  const next=index+direction;if(next<0||next>=funnelEditorDraft.length)return;
  [funnelEditorDraft[index],funnelEditorDraft[next]]=[funnelEditorDraft[next],funnelEditorDraft[index]];
  renderFunnelEditorRows();
}

function openFunnelEditor(){
  funnelEditorDraft=pipelineStages.map(stage=>({...stage}));
  renderFunnelEditorRows();
  $('#funnelEditorModal')?.classList.add('open');
  $('#funnelEditorBackdrop')?.classList.add('open');
  document.body.classList.add('funnel-editor-open');
}

function closeFunnelEditor(){
  $('#funnelEditorModal')?.classList.remove('open');
  $('#funnelEditorBackdrop')?.classList.remove('open');
  document.body.classList.remove('funnel-editor-open');
}

function saveFunnelEditor(){
  const cleaned=funnelEditorDraft.map(stage=>({...stage,label:String(stage.label||'').trim()}));
  if(cleaned.some(stage=>!stage.label)){if(typeof showToast==='function')showToast('Todas as etapas precisam de um nome.');return}
  if(new Set(cleaned.map(stage=>stage.label.toLowerCase())).size!==cleaned.length){if(typeof showToast==='function')showToast('Use nomes diferentes para cada etapa.');return}
  pipelineStages.splice(0,pipelineStages.length,...cleaned);
  localStorage.setItem(CUSTOM_PIPELINE_KEY,JSON.stringify(cleaned));
  closeFunnelEditor();
  if(typeof renderPipeline==='function')renderPipeline();
  refreshStageAccumulatedValues();
  if(typeof showToast==='function')showToast('Funil personalizado com sucesso.');
}

function editDealCardTitle(card){
  const titleElement=card.querySelector('.deal-title,.card-title,h3,h4,strong');
  const currentTitle=titleElement?.textContent?.trim()||'';
  const id=card.dataset.dealId||card.dataset.id||card.getAttribute('data-deal');
  const deals=getDeals();
  const deal=deals.find(item=>String(item.id)===String(id))||deals.find(item=>(item.title||item.name)===currentTitle);
  if(!deal)return;
  const answer=window.prompt('Edite o título desta oportunidade:',deal.title||deal.name||'');
  if(answer===null)return;
  const title=answer.trim();if(!title){if(typeof showToast==='function')showToast('O título não pode ficar vazio.');return}
  const previous=deal.title||deal.name||'';
  if('title' in deal||!('name' in deal))deal.title=title;else deal.name=title;
  deal.updatedAt=new Date().toISOString();
  deal.history=Array.isArray(deal.history)?deal.history:[];
  deal.history.unshift({type:'title_changed',date:deal.updatedAt,user:appState.currentUser?.name||'Usuário',text:'Título alterado de "'+previous+'" para "'+title+'"'});
  if(persistEditedDeals(deals)){
    if(typeof renderPipeline==='function')renderPipeline();
    if(typeof showToast==='function')showToast('Título do card atualizado.');
  }
}

function enhanceEditableDealCards(){
  const view=$('#pipelineView');if(!view)return;
  const cards=[...view.querySelectorAll('.deal-card,.opportunity-card,[data-deal-id]')].filter(card=>!card.closest('.deal-card .deal-card,.opportunity-card .opportunity-card'));
  cards.forEach(card=>{
    card.classList.add('editable-deal-card');
    if(!card.querySelector('[data-edit-card-title]')){
      const button=document.createElement('button');button.type='button';button.className='edit-card-title';button.dataset.editCardTitle='true';button.title='Editar título do card';button.setAttribute('aria-label','Editar título do card');button.textContent='✎';
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();editDealCardTitle(card)});
      card.appendChild(button);
    }
    enhanceDealTemperature(card);
  });
}

function installFunnelCustomization(){
  const view=$('#pipelineView');if(!view||$('#funnelEditorTrigger'))return;
  view.insertAdjacentHTML('afterbegin','<div class="funnel-customize-row"><div><small>FUNIL PERSONALIZÁVEL</small><span>Adapte as etapas ao processo da sua empresa.</span></div><button type="button" id="funnelEditorTrigger">Editar etapas</button></div>');
  document.body.insertAdjacentHTML('beforeend','<div id="funnelEditorBackdrop" class="funnel-editor-backdrop"></div><section id="funnelEditorModal" class="funnel-editor-modal" role="dialog" aria-modal="true" aria-labelledby="funnelEditorTitle"><header><div><small>CONFIGURAÇÃO DO PROCESSO COMERCIAL</small><h2 id="funnelEditorTitle">Editar etapas do funil</h2><p>Renomeie, adicione, remova ou altere a ordem das etapas.</p></div><button type="button" id="closeFunnelEditor" aria-label="Fechar">×</button></header><div id="funnelEditorRows" class="funnel-editor-rows"></div><button type="button" id="addFunnelStage" class="add-funnel-stage">+ Adicionar etapa</button><footer><span>Etapas com cards não podem ser removidas.</span><div><button type="button" id="cancelFunnelEditor">Cancelar</button><button type="button" id="saveFunnelEditor">Salvar alterações</button></div></footer></section>');
  $('#funnelEditorTrigger').addEventListener('click',openFunnelEditor);
  $('#closeFunnelEditor').addEventListener('click',closeFunnelEditor);
  $('#cancelFunnelEditor').addEventListener('click',closeFunnelEditor);
  $('#funnelEditorBackdrop').addEventListener('click',closeFunnelEditor);
  $('#saveFunnelEditor').addEventListener('click',saveFunnelEditor);
  $('#addFunnelStage').addEventListener('click',()=>{funnelEditorDraft.push({id:'custom-'+Date.now(),label:'Nova etapa'});renderFunnelEditorRows()});
  let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhanceEditableDealCards()})}).observe(view,{childList:true,subtree:true});
  const updatePermission=()=>{$('#funnelEditorTrigger').hidden=appState.currentUser?.profile!=='Proprietário/Admin'};
  new MutationObserver(updatePermission).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class','style']});
  updatePermission();enhanceEditableDealCards();
  setTimeout(()=>{
    try{const custom=JSON.parse(localStorage.getItem(CUSTOM_PIPELINE_KEY));if(Array.isArray(custom)&&custom.length>=2){const migrated=withOutcomeStages(custom);pipelineStages.splice(0,pipelineStages.length,...migrated);if(migrated.length!==custom.length)localStorage.setItem(CUSTOM_PIPELINE_KEY,JSON.stringify(migrated));if(appState.currentUser&&typeof renderPipeline==='function')renderPipeline()}}catch(error){}
  },0);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installFunnelCustomization);else installFunnelCustomization();
function dealFromCard(card){
  const titleElement=card.querySelector('.deal-title,.card-title,h3,h4,strong');
  const currentTitle=titleElement?.textContent?.trim()||'';
  const id=card.dataset.dealId||card.dataset.id||card.getAttribute('data-deal');
  const deals=getDeals();
  return{deals,deal:deals.find(item=>String(item.id)===String(id))||deals.find(item=>(item.title||item.name)===currentTitle)};
}

function temperatureInfo(value){
  return{
    cold:{label:'Frio',symbol:'❄'},
    warm:{label:'Morno',symbol:'◐'},
    hot:{label:'Quente',symbol:'🔥'}
  }[value]||{label:'Temperatura',symbol:'◌'};
}

function setDealTemperature(card,temperature){
  const {deals,deal}=dealFromCard(card);if(!deal)return;
  const previous=temperatureInfo(deal.temperature).label;
  const next=temperatureInfo(temperature);
  deal.temperature=temperature;deal.updatedAt=new Date().toISOString();
  deal.history=Array.isArray(deal.history)?deal.history:[];
  deal.history.unshift({type:'temperature_changed',date:deal.updatedAt,user:appState.currentUser?.name||'Usuário',text:'Temperatura alterada de '+previous+' para '+next.label});
  document.querySelectorAll('.temperature-picker.open').forEach(picker=>picker.classList.remove('open'));
  if(persistEditedDeals(deals)){
    if(typeof renderPipeline==='function')renderPipeline();
    if(typeof showToast==='function')showToast('Lead marcado como '+next.label+'.');
  }
}

function enhanceDealTemperature(card){
  if(card.querySelector('[data-temperature-trigger]'))return;
  const {deal}=dealFromCard(card);if(!deal)return;
  const info=temperatureInfo(deal.temperature);
  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='temperature-trigger temperature-'+(deal.temperature||'unset');trigger.dataset.temperatureTrigger='true';trigger.title='Temperatura: '+info.label;trigger.setAttribute('aria-label','Alterar temperatura do lead');trigger.textContent=info.symbol;
  const picker=document.createElement('div');picker.className='temperature-picker';picker.innerHTML='<small>TEMPERATURA DO LEAD</small><button type="button" data-set-temperature="cold"><span>❄</span><strong>Frio</strong></button><button type="button" data-set-temperature="warm"><span>◐</span><strong>Morno</strong></button><button type="button" data-set-temperature="hot"><span>🔥</span><strong>Quente</strong></button>';
  trigger.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();document.querySelectorAll('.temperature-picker.open').forEach(open=>{if(open!==picker)open.classList.remove('open')});picker.classList.toggle('open')});
  picker.addEventListener('click',event=>event.stopPropagation());
  picker.querySelectorAll('[data-set-temperature]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();setDealTemperature(card,button.dataset.setTemperature)}));
  card.append(trigger,picker);
}
function setMetricSemantic(selector,state){
  const value=$(selector);if(!value)return;
  const card=value.closest('.metric-card,.stat-card,.report-metric,.metric');
  if(!card)return;
  card.classList.remove('metric-semantic-success','metric-semantic-warning','metric-semantic-danger');
  if(state)card.classList.add('metric-semantic-'+state);
}

function applyTodayMetricSemantics(){
  const overdue=getActivities().filter(activity=>!activity.done&&activity.date&&activity.date<todayISO()).length;
  const deals=dealsVisibleToCurrentUser(getDeals()).filter(deal=>deal.status!=='won'&&deal.status!=='lost');
  const closingStage=stageByMeaning('closing');
  const closingAtRisk=deals.some(deal=>deal.stage===closingStage&&daysSince(deal.movedAt)>7);
  setMetricSemantic('#todayPendingCount',overdue?'warning':null);
  setMetricSemantic('#todayClosingValue',closingAtRisk?'warning':null);
}
function identityColorIndex(identity,total){
  let hash=0;
  for(const character of String(identity||'NivionTech'))hash=((hash<<5)-hash)+character.charCodeAt(0)|0;
  return Math.abs(hash)%total;
}

function applyIdentityAvatarColors(root=document){
  const palettes=[
    ['#2f5f9f','#172d58'],
    ['#27806b','#15483e'],
    ['#b06c32','#63391f'],
    ['#8a557f','#4e2d49'],
    ['#477092','#263e59'],
    ['#8b6a35','#54401f'],
    ['#566aa5','#303b67'],
    ['#497a62','#294838']
  ];
  const selector='.avatar,.client-avatar,.user-avatar,.owner-avatar,.responsible-avatar,.contact-avatar,[class*="avatar"]';
  root.querySelectorAll(selector).forEach(avatar=>{
    if(avatar.matches('img')||avatar.querySelector('img'))return;
    const background=getComputedStyle(avatar).backgroundImage;
    if(background&&background!=='none'&&background.includes('url('))return;
    const nearby=avatar.closest('.client-card,.deal-card,.opportunity-card,.contact-card,.team-member,.performance-row,.profile')?.querySelector('strong,h3,h4');
    const identity=avatar.dataset.identity||avatar.dataset.name||avatar.getAttribute('aria-label')||avatar.title||nearby?.textContent||avatar.textContent;
    const palette=palettes[identityColorIndex(identity,palettes.length)];
    avatar.classList.add('identity-avatar');
    avatar.style.setProperty('--avatar-color-start',palette[0]);
    avatar.style.setProperty('--avatar-color-end',palette[1]);
  });
}

function installIdentityAvatarColors(){
  let scheduled=false;
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;applyIdentityAvatarColors()})};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  schedule();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installIdentityAvatarColors);else installIdentityAvatarColors();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installCloudSyncPanel);else installCloudSyncPanel();
