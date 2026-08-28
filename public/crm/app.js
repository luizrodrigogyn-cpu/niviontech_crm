import {authDomain,migrateClerkIdentity,withoutLocalCredentials} from './modules/auth.js';
import {onboardingDomain} from './modules/onboarding.js';
import {pipelineDomain,validateNegotiation,applyWonDealRules,applyLostDealRules,commercialPipelineStages,findStaleDeals,getStaleDealDays,saveStaleDealDays,calculateDealHealth,stageChecklistForDeal} from './modules/pipeline.js';
import {clientsDomain,mergeClientData,validateClientRegistration,clientRelationshipCompleteness} from './modules/clients.js';
import {activitiesDomain,todayISO,formatDate,rankTodayActivities} from './modules/activities.js';
import {proposalsDomain,proposalStatusLabel,calculateProposalTotals,markProposalViewed,acceptProposal} from './modules/proposals.js';
import {receiptsDomain,applyReceiptRules,createProvisionalReceipt} from './modules/receipts.js';
import {reportsDomain} from './modules/reports.js';
import {teamDomain} from './modules/team.js';
import {organizeDomain,analyzeConversationText,createHandoffSummary} from './modules/organize.js';
import {analyzeCommercialConversation} from './modules/orbit-intelligence.js';
import {buildManagementForecast} from './modules/management-intelligence.js';
import {buildForecastGovernance,createForecastSnapshot,compareForecastSnapshots} from './modules/forecast-governance.js';
import {createPlaybookFromIcp,evaluateDealAgainstPlaybook,playbookAdoption} from './modules/playbooks.js';
import {createMutualActionPlan,mutualPlanProgress,toggleMutualMilestone,mutualPlanPlainText} from './modules/mutual-action-plans.js';
import {automationTemplates,buildDealScorecard,runAutomationRules,buildCoachingBrief,buildRevenueCockpit,buildIcpRadar,buildBuyingInfluenceMap,buildConversationIntelligence,buildRevenueLeakMap,buildGrowthMissions} from './modules/growth-os.js';
import {buildCommercialTruth,buildFunnelVelocity,buildDailyCommand} from './modules/commercial-evolution.js';
import {buildCadencePlan,cadenceProgress,cadenceTemplates} from './modules/cadences.js';
import {buildCustomerSuccessPortfolio} from './modules/customer-success.js';
import {analyzeBuyingCommittee,stakeholderRoles} from './modules/buying-committee.js';
import {buildMeetingPreparation} from './modules/meeting-preparation.js';
import {buildNextBestActions} from './modules/next-best-action.js';
import {parseIcs,parseEml,matchClientForChannel,filterNewChannelRecords} from './modules/channel-imports.js';
import {SYNC_META_KEY,SYNC_DEVICE_KEY,collectSyncStorage,replaceSyncStorage,snapshotFingerprint,resolveStartupSync,mergeSyncSnapshots} from './modules/sync.js?v=20260828-1';

const domainModules=Object.freeze([authDomain,onboardingDomain,pipelineDomain,clientsDomain,activitiesDomain,proposalsDomain,receiptsDomain,reportsDomain,teamDomain,organizeDomain]);

const STORAGE={owner:'niviontech_owner',company:'niviontech_company'};
const NEW_MENU_ITEMS=['orbitCoach','organize','cadences','success'];
const SESSION='niviontech_session';
const USERS_KEY='niviontech_users';
const PIPELINE_KEY='niviontech_pipeline';
const CLIENTS_KEY='niviontech_clients';
const ACTIVITIES_KEY='niviontech_activities';
const PROPOSALS_KEY='niviontech_proposals';
const CADENCES_KEY='niviontech_cadences';
const PIPELINE_CONFIG_KEY='niviontech_pipeline_config';
const CHANNEL_IMPORT_HISTORY_KEY='niviontech_channel_import_history';
const FORECAST_SNAPSHOTS_KEY='niviontech_forecast_snapshots';
const PLAYBOOKS_KEY='niviontech_playbooks';
const ACTIVE_PLAYBOOK_KEY='niviontech_active_playbook';
const CLOSING_PLANS_KEY='niviontech_closing_plans';
const AUTOMATION_RULES_KEY='niviontech_growth_automation_rules';
const COACHING_SESSIONS_KEY='niviontech_coaching_sessions';
const DAILY_LAST_REVIEW_KEY='niviontech_daily_last_review';
const authParams=new URLSearchParams(location.search);
const clerkIdentity=authParams.get('clerk')==='1'?{userId:authParams.get('userId')||'',orgId:authParams.get('orgId')||'',role:authParams.get('role')||'member',profile:authParams.get('profile')||'Colaborador comercial',name:authParams.get('name')||'',email:authParams.get('email')||''}:null;

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

function getOwner(){try{return JSON.parse(localStorage.getItem(STORAGE.owner))}catch{return null}}
function getCompany(){try{const company=JSON.parse(localStorage.getItem(STORAGE.company));if(company&&!company.plan){company.plan='essential';localStorage.setItem(STORAGE.company,JSON.stringify(company))}return company}catch{return null}}
function saveCompany(company){localStorage.setItem(STORAGE.company,JSON.stringify(company));return company}
function applyAdaptiveImageFit(image,isCustom=true){
  if(!image)return;
  const adapt=()=>{const ratio=image.naturalWidth/Math.max(1,image.naturalHeight);image.dataset.fit=isCustom&&ratio<=1.4?'cover':'contain'};
  image.complete&&image.naturalWidth?adapt():image.addEventListener('load',adapt,{once:true});
}
function renderCompanyBrand(){
  const company=getCompany()||{},name=(company.fantasyName||company.name||'Sua empresa').trim(),logo=$('#sidebarCompanyLogo'),label=$('#sidebarCompanyName');
  if(label){label.textContent=name;label.title=name}
  if(logo){logo.src=company.logoData||'assets/niviontech-symbol.png';logo.alt=company.logoData?`Logo ${name}`:'NivionTech CRM';applyAdaptiveImageFit(logo,Boolean(company.logoData))}
}
function resizeCompanyLogo(file){
  return new Promise((resolve,reject)=>{
    if(!file?.type?.startsWith('image/')){reject(new Error('Escolha uma imagem PNG, JPG ou WebP.'));return}
    if(file.size>3*1024*1024){reject(new Error('A imagem deve ter no máximo 3 MB.'));return}
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Não foi possível ler esta imagem.'));
    reader.onload=()=>{const image=new Image();image.onerror=()=>reject(new Error('A imagem selecionada não é válida.'));image.onload=()=>{const limit=320,scale=Math.min(1,limit/Math.max(image.width,image.height)),width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0,width,height);resolve(canvas.toDataURL('image/png',.9))};image.src=reader.result};
    reader.readAsDataURL(file);
  });
}
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
function setScreen(name){['authScreen','onboardingScreen','appScreen'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==name))}

const cloudSyncState={enabled:false,busy:false,conflict:null,timer:null,status:'Conectando à proteção privada...',tone:'neutral'};
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
    cloudSyncState.enabled=true;
    const localSnapshot=collectSyncStorage(localStorage),decision=resolveStartupSync({localSnapshot,cloudSnapshot:result.snapshot,meta:readSyncMeta()});
    if(decision.action==='download'){
      replaceSyncStorage(localStorage,result.snapshot.payload);
      saveSyncMeta(result.snapshot);
      setCloudSyncStatus('Dados recuperados da nuvem privada','success');
    }
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
async function combineSyncSnapshots(){
  if(!cloudSyncState.conflict)return;
  const local=collectSyncStorage(localStorage),combined=mergeSyncSnapshots(local,cloudSyncState.conflict.payload||{});
  downloadFullLocalBackup('pre-safe-merge');replaceSyncStorage(localStorage,combined.payload);cloudSyncState.conflict=null;saveSyncMeta({revision:0,updatedAt:new Date().toISOString()});const uploaded=await uploadCloudSnapshot({force:true});if(uploaded){setCloudSyncStatus(`Alterações combinadas com segurança · ${combined.stats.mergedRecords} registros preservados`,'success');updateCloudSyncPanel();location.reload()}
}
function updateCloudSyncPanel(){
  const status=$('#cloudSyncStatus');if(status){status.textContent=cloudSyncState.status;status.dataset.tone=cloudSyncState.tone}
  const conflict=$('#cloudSyncConflict');if(conflict)conflict.hidden=!cloudSyncState.conflict;
}
function installCloudSyncPanel(){
  const settings=$('#settingsView');if(!settings||$('#cloudSyncPanel'))return;
  settings.insertAdjacentHTML('beforeend','<section id="cloudSyncPanel" class="backup-protection cloud-sync-panel"><div class="backup-protection-icon"><span>O</span></div><div class="backup-protection-copy"><small>PROTEÇÃO ORBIT</small><h3>Sincronização privada</h3><p>Seus clientes, oportunidades e atividades ficam disponíveis com segurança em seus dispositivos.</p><span id="cloudSyncStatus">Conectando à proteção privada...</span></div><div class="backup-protection-actions"><button type="button" id="syncNow">Sincronizar agora</button></div><div id="cloudSyncConflict" class="backup-protection-note sync-conflict" hidden><strong>Ação necessária</strong><span>Há alterações diferentes neste dispositivo e na nuvem.</span><button type="button" id="combineSyncSnapshots" class="primary">Combinar alterações com segurança</button><button type="button" id="useDeviceSnapshot">Usar somente este dispositivo</button><button type="button" id="useCloudSnapshot">Usar somente a nuvem</button></div></section>');
  $('#syncNow').onclick=()=>uploadCloudSnapshot();$('#combineSyncSnapshots').onclick=combineSyncSnapshots;$('#useDeviceSnapshot').onclick=useDeviceSnapshot;$('#useCloudSnapshot').onclick=useCloudSnapshot;updateCloudSyncPanel();
}

function initialize(){
  if(clerkIdentity){
    const user=migrateClerkIdentity(localStorage,sessionStorage,clerkIdentity);
    appState.currentUser=user;
    user.onboardingComplete||getCompany()?openDashboard(user):openOnboarding();
    return;
  }
  const owner=getOwner();
  const sessionUser=activeSessionUser();
  if(sessionUser&&owner){appState.currentUser=sessionUser;owner.onboardingComplete?openDashboard(sessionUser):openOnboarding();return}
  setScreen('authScreen');
}

$('#accessForm').addEventListener('submit',event=>{event.preventDefault();location.href='/'});

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
  renderCompanyBrand();
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
  const organize=view==='organize',orbitCoach=view==='orbitCoach',playbooks=view==='playbooks',closingPlans=view==='closingPlans',growthOs=view==='growthOs',cadences=view==='cadences',channels=view==='channels',success=view==='success',ranking=view==='ranking',proposals=view==='proposals',receipts=view==='receipts',settings=view==='settings',team=view==='team',templates=view==='templates',reports=view==='reports';
  const secondary=pipeline||clients||activities||channels||cadences||success||organize||orbitCoach||playbooks||closingPlans||growthOs||ranking||proposals||receipts||settings||team||templates||reports;
  $('#todayView').classList.toggle('hidden',secondary);
  $('#pipelineView').classList.toggle('hidden',!pipeline);
  $('#clientsView').classList.toggle('hidden',!clients);
  $('#successView').classList.toggle('hidden',!success);
  $('#activitiesView').classList.toggle('hidden',!activities);
  $('#channelsView').classList.toggle('hidden',!channels);
  $('#cadencesView').classList.toggle('hidden',!cadences);
  $('#organizeView').classList.toggle('hidden',!organize);$('#orbitCoachView').classList.toggle('hidden',!orbitCoach);$('#proposalsView').classList.toggle('hidden',!proposals);$('#receiptsView').classList.toggle('hidden',!receipts);$('#settingsView').classList.toggle('hidden',!settings);
  $('#rankingView').classList.toggle('hidden',!ranking);
  $('#teamView').classList.toggle('hidden',!team);
  $('#templatesView').classList.toggle('hidden',!templates);
  $('#reportsView').classList.toggle('hidden',!reports);
  $('#playbooksView').classList.toggle('hidden',!playbooks);
  $('#closingPlansView').classList.toggle('hidden',!closingPlans);
  $('#growthOsView').classList.toggle('hidden',!growthOs);
  const titles={today:['Central de ação','O Orbit mostra o que precisa avançar'],pipeline:['Pipeline','Oportunidades em movimento'],clients:['Clientes','Sua base de relacionamentos'],success:['Sucesso e expansão','Retenção e crescimento da carteira'],activities:['Atividades','Sua rotina comercial'],channels:['Central de Canais','Agenda, e-mails e memória comercial'],closingPlans:['Planos de fechamento','Compromissos até a decisão'],growthOs:['NivionTech Growth OS','Sinais, automações, coaching e comando'],cadences:['Cadências inteligentes','Automação comercial conduzida pelo Orbit'],orbitCoach:['Orbit IA','Coach comercial e treinamento'],playbooks:['Orbit Playbooks','Processo comercial conduzido'],organize:['Cole e organize','Orbit · Assistente local'],ranking:['Ranking','Progresso por percentual da meta'],proposals:['Propostas','Ofertas e decisões'],receipts:['Recebimentos','Da venda ao dinheiro'],reports:['Relatórios','Indicadores essenciais'],settings:['Configurações','Dados e portabilidade'],team:['Equipe e acessos','Papéis e permissões'],templates:['Modelos de funil','Implantação progressiva']};
  $('#pageTitle').textContent=titles[view][0];$('#pageSubtitle').textContent=titles[view][1];
  $('#newButton').style.display=['orbitCoach','playbooks','closingPlans','growthOs','organize','channels','cadences','success','ranking','settings','receipts','templates','reports'].includes(view)?'none':'block';
  $('#newButton').textContent={today:'+ Nova oportunidade',pipeline:'+ Nova oportunidade',clients:'+ Novo cliente',activities:'+ Nova atividade',proposals:'+ Nova proposta',team:'+ Novo usuário'}[view]||'+ Novo';
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  $('.sidebar').classList.remove('open');
  if(pipeline)renderPipeline();
  if(clients)renderClients();
  if(success)renderCustomerSuccess();
  if(activities)renderActivities();
  if(channels)renderChannels();
  if(cadences)renderCadences();
  if(proposals)renderProposals();
  if(receipts)renderReceipts();
  if(settings)renderSettings();
  if(team)renderTeam();
  if(ranking)renderRanking();
  if(templates)renderTemplates();
  if(reports)renderReports();
  if(playbooks)renderPlaybooks();
  if(closingPlans)renderClosingPlans();
  if(growthOs)renderGrowthOs();
  if(orbitCoach)renderOrbitCoach();
  if(view==='today'){renderDateCardIdentity();renderTodayActivities()}
}

function orbitEmptyState(title,message,className='empty-records'){return `<div class="${className} orbit-empty-state"><span class="orbit-empty-mark">O</span><strong>${title}</strong><p>${message}</p></div>`}
let pendingChannelRecords=[];
function getChannelImportHistory(){try{return JSON.parse(localStorage.getItem(CHANNEL_IMPORT_HISTORY_KEY))||[]}catch{return[]}}
function saveChannelImportHistory(history){localStorage.setItem(CHANNEL_IMPORT_HISTORY_KEY,JSON.stringify(history.slice(0,50)))}
function existingChannelSourceIds(){return[...getActivities().map(item=>item.sourceUid),...getClients().flatMap(client=>(client.interactions||[]).map(item=>item.sourceUid))].filter(Boolean)}
function channelRecordDate(record){return record.source==='Calendário'?`${record.date}T${record.time||'09:00'}:00`:record.date}
function renderChannelImportHistory(){
  const history=getChannelImportHistory(),count=history.reduce((sum,item)=>sum+Number(item.imported||0),0);$('#channelImportCount').textContent=`${count} ${count===1?'registro':'registros'}`;
  $('#channelImportHistory').innerHTML=history.length?history.map(item=>`<article><span>${item.calendar?'▦':'✉'}</span><div><strong>${escapeHtml(item.label)}</strong><small>${formatDate(String(item.date).slice(0,10))} · ${escapeHtml(item.actor||'Usuário')}</small></div><b>${item.imported} importado${item.imported===1?'':'s'}</b>${item.skipped?`<em>${item.skipped} repetido${item.skipped===1?'':'s'}</em>`:''}</article>`).join(''):orbitEmptyState('Nenhuma importação ainda','Escolha um arquivo de agenda ou e-mail para começar.','channel-empty');
}
function renderChannelPreview(){
  const target=$('#channelImportPreview');if(!pendingChannelRecords.length){target.innerHTML='';return}
  const clients=getClients(),options=clients.map(client=>`<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join('');
  target.innerHTML=`<header><div><strong>Revise antes de salvar</strong><small>${pendingChannelRecords.length} ${pendingChannelRecords.length===1?'item reconhecido':'itens reconhecidos'}</small></div><button type="button" id="confirmChannelImport">Importar selecionados</button></header><div>${pendingChannelRecords.map((record,index)=>{const match=record.clientId?clients.find(client=>client.id===record.clientId):null;return `<article class="channel-preview-record"><label class="channel-check"><input type="checkbox" data-channel-select="${index}" ${record.selected?'checked':''}><span></span></label><div class="channel-record-icon">${record.source==='Calendário'?'▦':'✉'}</div><div class="channel-record-copy"><strong>${escapeHtml(record.title)}</strong><small>${formatDate(String(channelRecordDate(record)).slice(0,10))}${record.time?` · ${record.time}`:''} · ${escapeHtml(record.source)}</small><p>${escapeHtml(record.description||record.body||record.from?.email||'Sem descrição')}</p></div><label class="channel-client-match"><small>VINCULAR A</small><select data-channel-client="${index}"><option value="">Escolha o cliente</option>${options}</select><em class="${record.confidence}">${escapeHtml(record.reason)}</em></label></article>`}).join('')}</div>`;
  pendingChannelRecords.forEach((record,index)=>{const select=target.querySelector(`[data-channel-client="${index}"]`);select.value=record.clientId||'';select.onchange=()=>{record.clientId=select.value;record.reason=select.value?'Confirmado por você':'Escolha o cliente';record.confidence=select.value?'alta':'baixa';record.selected=Boolean(select.value);renderChannelPreview()}});
  target.querySelectorAll('[data-channel-select]').forEach(input=>input.onchange=()=>{pendingChannelRecords[Number(input.dataset.channelSelect)].selected=input.checked});
  $('#confirmChannelImport').onclick=confirmChannelImport;
}
async function stageChannelFiles(files,type){
  const clients=getClients(),parsed=[];
  for(const file of [...files]){const text=await file.text();if(type==='calendar')parsed.push(...parseIcs(text));else parsed.push(parseEml(text))}
  const existing=existingChannelSourceIds(),fresh=filterNewChannelRecords(parsed,existing),skipped=parsed.length-fresh.length;
  fresh.forEach(record=>{const match=matchClientForChannel(record,clients);pendingChannelRecords.push({...record,clientId:match.client?.id||'',confidence:match.confidence,reason:match.reason,selected:Boolean(match.client)})});
  if(skipped)pendingChannelRecords.push({source:'Aviso',title:`${skipped} item(ns) já estavam no CRM`,description:'Itens repetidos não serão importados novamente.',sourceUid:'notice-'+Date.now(),selected:false,notice:true,skipped});
  renderChannelPreview();
}
function confirmChannelImport(){
  const selected=pendingChannelRecords.filter(record=>record.selected&&record.clientId&&!record.notice),clients=getClients(),activities=getActivities();let calendar=0,email=0;
  selected.forEach((record,index)=>{const client=clients.find(item=>item.id===record.clientId);if(!client)return;if(record.source==='Calendário'){activities.push({id:`activity-channel-${Date.now()}-${index}`,sourceUid:record.sourceUid,source:'Calendário',title:record.title,type:'Reunião',client:client.name,date:record.date,time:record.time||'09:00',note:[record.description,record.location&&`Local: ${record.location}`].filter(Boolean).join(' · '),owner:appState.currentUser?.name||'',done:false});calendar++}else{client.interactions=client.interactions||[];client.interactions.unshift({id:`interaction-channel-${Date.now()}-${index}`,sourceUid:record.sourceUid,source:'E-mail',title:`E-mail · ${record.title}`,text:(record.body||`Mensagem de ${record.from?.email||'contato'}`).slice(0,4000),date:record.date});addEntityHistory(client,'E-mail importado',record.title,{sourceUid:record.sourceUid});email++}});
  if(calendar)saveActivities(activities);if(email)saveClients(clients);
  const skipped=pendingChannelRecords.reduce((sum,item)=>sum+Number(item.skipped||0),0),history=getChannelImportHistory();if(selected.length||skipped){history.unshift({id:'channel-history-'+Date.now(),date:new Date().toISOString(),label:[calendar&&`${calendar} compromisso${calendar===1?'':'s'}`,email&&`${email} e-mail${email===1?'':'s'}`].filter(Boolean).join(' e ')||'Verificação de duplicidade',imported:selected.length,calendar,email,skipped,actor:appState.currentUser?.name||'Usuário'});saveChannelImportHistory(history)}
  pendingChannelRecords=[];renderChannelPreview();renderChannelImportHistory();renderChannels();
}
function renderChannels(){renderChannelImportHistory();renderChannelPreview()}
function installChannelImports(){
  const calendar=$('#calendarImport'),email=$('#emailImport'),clear=$('#clearChannelPending');if(!calendar||calendar.dataset.ready)return;calendar.dataset.ready='1';
  calendar.onchange=async event=>{await stageChannelFiles(event.target.files,'calendar');event.target.value=''};
  email.onchange=async event=>{await stageChannelFiles(event.target.files,'email');event.target.value=''};
  clear.onclick=()=>{pendingChannelRecords=[];renderChannelPreview()};renderChannelImportHistory();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installChannelImports);else installChannelImports();
function getPlaybooks(){try{const saved=JSON.parse(localStorage.getItem(PLAYBOOKS_KEY));if(Array.isArray(saved)&&saved.length)return saved}catch{}const initial=createPlaybookFromIcp({stages:pipelineStages,icp:getOrbitIcp(),version:1});localStorage.setItem(PLAYBOOKS_KEY,JSON.stringify([initial]));localStorage.setItem(ACTIVE_PLAYBOOK_KEY,initial.id);return[initial]}
function activePlaybook(){const items=getPlaybooks(),id=localStorage.getItem(ACTIVE_PLAYBOOK_KEY);return items.find(item=>item.id===id)||items[0]}
function playbookCriterionLabel(field){return{owner:'Responsável definido',next:'Próxima ação combinada',nextDate:'Data confirmada',pain:'Dor principal validada',decisionMaker:'Decisor mapeado',successCriteria:'Critério de sucesso',budget:'Orçamento validado',objection:'Objeção principal tratada'}[field]||field}
function renderPlaybookDealGuide(){
  const id=$('#playbookDealSelect').value,target=$('#playbookDealGuide'),deal=getDeals().find(item=>item.id===id),playbook=activePlaybook();if(!deal){target.innerHTML=orbitEmptyState('Escolha uma oportunidade','O Orbit mostrará os critérios, perguntas e respostas adequados à etapa.','playbook-guide-empty');return}const evaluation=evaluateDealAgainstPlaybook(deal,playbook),guide=evaluation.guide;if(!guide){target.innerHTML=orbitEmptyState('Etapa ainda não mapeada','Gere uma nova versão para incluir as etapas atuais do funil.');return}
  target.innerHTML=`<section class="playbook-readiness ${evaluation.ready?'ready':''}"><div><small>PRONTIDÃO PARA AVANÇAR</small><strong>${evaluation.percent}%</strong></div><span><i style="width:${evaluation.percent}%"></i></span><p>${evaluation.ready?'Todos os critérios desta etapa estão presentes.':`Complete: ${escapeHtml(evaluation.missing.join(', '))}.`}</p></section><section class="playbook-guide-block"><small>OBJETIVO DA ETAPA</small><h4>${escapeHtml(guide.goal)}</h4></section><section class="playbook-guide-block"><small>PERGUNTAS RECOMENDADAS</small><ol>${guide.questions.map(question=>`<li>${escapeHtml(question)}</li>`).join('')}</ol></section><section class="playbook-guide-block objections"><small>RESPOSTAS PARA OBJEÇÕES</small>${guide.objections.map((item,index)=>`<article><strong>${escapeHtml(item.trigger)}</strong><p>${escapeHtml(item.response)}</p><button type="button" data-copy-playbook="${index}">Copiar resposta</button></article>`).join('')}</section><button type="button" class="primary wide" id="applyPlaybookAction">Criar próxima ação: ${escapeHtml(guide.action)}</button>`;
  target.querySelectorAll('[data-copy-playbook]').forEach(button=>button.onclick=async()=>{const text=guide.objections[Number(button.dataset.copyPlaybook)].response;try{await navigator.clipboard.writeText(text);button.textContent='Resposta copiada ✓'}catch{alert(text)}});$('#applyPlaybookAction').onclick=()=>applyPlaybookAction(deal,guide);
}
function applyPlaybookAction(deal,guide){const all=getDeals(),current=all.find(item=>item.id===deal.id);if(!current)return;const date=new Date();date.setDate(date.getDate()+2);const due=date.toISOString().slice(0,10);current.next=guide.action;current.nextDate=due;addEntityHistory(current,'Playbook aplicado',`${guide.phase} · ${guide.action}`);saveDeals(all);const activities=getActivities(),duplicate=activities.some(item=>!item.done&&item.client===current.client&&item.title===guide.action);if(!duplicate){activities.push({id:'activity-playbook-'+Date.now(),title:guide.action,type:'Tarefa',client:current.client,date:due,time:'09:00',note:`Orbit Playbooks · ${guide.phase}`,owner:current.owner||appState.currentUser?.name||'',done:false});saveActivities(activities)}renderPlaybooks();$('#playbookDealSelect').value=current.id;renderPlaybookDealGuide()}
function renderPlaybooks(){
  const items=getPlaybooks(),playbook=activePlaybook(),deals=dealsVisibleToCurrentUser(getDeals()).filter(deal=>deal.status!=='won'&&deal.status!=='lost'),adoption=playbookAdoption(deals,playbook),select=$('#playbookSelect'),dealSelect=$('#playbookDealSelect'),selectedDeal=dealSelect.value;select.innerHTML=items.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · v${item.version}</option>`).join('');select.value=playbook.id;select.onchange=()=>{localStorage.setItem(ACTIVE_PLAYBOOK_KEY,select.value);renderPlaybooks()};$('#activePlaybookName').textContent=playbook.name;$('#activePlaybookDescription').textContent=`${playbook.segment} · ${playbook.stages.length} etapas guiadas`;$('#playbookAdoption').textContent=`${adoption.percent}%`;$('#playbookGuidedDeals').textContent=adoption.deals;$('#playbookReadyDeals').textContent=adoption.ready;$('#playbookVersion').textContent=`v${playbook.version}`;$('#playbookRoles').textContent=playbook.roles.length;$('#playbookStageCount').textContent=`${playbook.stages.length} etapas`;
  $('#playbookStageList').innerHTML=playbook.stages.map((stage,index)=>`<article class="playbook-stage"><span>${String(index+1).padStart(2,'0')}</span><div class="playbook-stage-main"><small>${escapeHtml(stage.stageLabel)} · ${escapeHtml(stage.phase)}</small><h4>${escapeHtml(stage.goal)}</h4><div>${stage.criteria.map(field=>`<em>✓ ${escapeHtml(playbookCriterionLabel(field))}</em>`).join('')}</div></div><aside><small>PRÓXIMA AÇÃO PADRÃO</small><strong>${escapeHtml(stage.action)}</strong><p>${stage.questions.length} perguntas · ${stage.objections.length} objeções</p></aside></article>`).join('');dealSelect.innerHTML='<option value="">Selecione uma oportunidade</option>'+deals.map(deal=>`<option value="${escapeHtml(deal.id)}">${escapeHtml(deal.client)} · ${escapeHtml(deal.title)}</option>`).join('');dealSelect.value=deals.some(item=>item.id===selectedDeal)?selectedDeal:'';dealSelect.onchange=renderPlaybookDealGuide;renderPlaybookDealGuide();
  $('#generatePlaybook').onclick=()=>{const currentItems=getPlaybooks(),version=Math.max(...currentItems.map(item=>Number(item.version||1)))+1,created=createPlaybookFromIcp({stages:pipelineStages,icp:getOrbitIcp(),version});currentItems.unshift(created);localStorage.setItem(PLAYBOOKS_KEY,JSON.stringify(currentItems.slice(0,10)));localStorage.setItem(ACTIVE_PLAYBOOK_KEY,created.id);renderPlaybooks()};
}
let activeClosingPlanId='';
function getClosingPlans(){try{return JSON.parse(localStorage.getItem(CLOSING_PLANS_KEY))||[]}catch{return[]}}
function saveClosingPlans(items){localStorage.setItem(CLOSING_PLANS_KEY,JSON.stringify(items))}
function ownerLabel(owner){return owner==='client'?'Cliente':owner==='both'?'Ambos':'Nossa equipe'}
function renderClosingPlanDetail(){
  const plans=getClosingPlans(),plan=plans.find(item=>item.id===activeClosingPlanId)||plans[0],target=$('#closingPlanDetail');if(!plan){target.innerHTML=orbitEmptyState('Crie seu primeiro plano','Escolha uma oportunidade e o Orbit organizará os compromissos até a decisão.','closing-plan-empty');return}activeClosingPlanId=plan.id;const progress=mutualPlanProgress(plan),deal=getDeals().find(item=>item.id===plan.dealId);target.innerHTML=`<header class="closing-detail-head"><div><p class="overline">PLANO DE FECHAMENTO</p><h2>${escapeHtml(plan.client)}</h2><span>${escapeHtml(plan.dealTitle)} · ${formatMoney(deal?.value||0)}</span></div><div class="closing-progress-ring" style="--progress:${progress.percent*3.6}deg"><strong>${progress.percent}%</strong><small>concluído</small></div></header><section class="closing-target"><div><small>DATA-ALVO</small><label><input type="date" id="closingTargetDate" value="${plan.targetDate}"></label></div><div><small>PRÓXIMO COMPROMISSO</small><strong>${escapeHtml(progress.next?.title||'Plano concluído')}</strong><span>${progress.next?`${formatDate(progress.next.dueDate)} · ${ownerLabel(progress.next.owner)}`:'Todos os marcos foram cumpridos'}</span></div><em class="${progress.overdue?'attention':'healthy'}">${progress.overdue?`${progress.overdue} atrasado${progress.overdue===1?'':'s'}`:'Ritmo saudável'}</em></section><section class="closing-milestones"><header><div><h3>Marcos compartilhados</h3><p>Marque o que foi cumprido e ajuste as datas quando necessário.</p></div><span>${progress.done}/${progress.total}</span></header><div>${plan.milestones.map((item,index)=>`<article class="${item.status==='done'?'done':''} ${item.status!=='done'&&item.dueDate<todayISO()?'overdue':''}"><button type="button" data-toggle-milestone="${escapeHtml(item.id)}">${item.status==='done'?'✓':'○'}</button><span>${String(index+1).padStart(2,'0')}</span><div><strong>${escapeHtml(item.title)}</strong><small>${ownerLabel(item.owner)}</small></div><label><input type="date" data-milestone-date="${escapeHtml(item.id)}" value="${item.dueDate}"></label></article>`).join('')}</div></section><footer class="closing-detail-actions"><button type="button" class="secondary" id="copyClosingPlan">Copiar plano para o cliente</button><button type="button" class="primary" id="syncClosingNext">Transformar próximo marco em ação</button></footer>`;
  $('#closingTargetDate').onchange=event=>{plan.targetDate=event.target.value;saveClosingPlans(plans);renderClosingPlans()};target.querySelectorAll('[data-toggle-milestone]').forEach(button=>button.onclick=()=>{toggleMutualMilestone(plan,button.dataset.toggleMilestone);saveClosingPlans(plans);renderClosingPlans()});target.querySelectorAll('[data-milestone-date]').forEach(input=>input.onchange=()=>{const item=plan.milestones.find(entry=>entry.id===input.dataset.milestoneDate);item.dueDate=input.value;saveClosingPlans(plans);renderClosingPlans()});$('#copyClosingPlan').onclick=async()=>{const text=mutualPlanPlainText(plan);try{await navigator.clipboard.writeText(text);$('#copyClosingPlan').textContent='Plano copiado ✓'}catch{alert(text)}};$('#syncClosingNext').onclick=()=>syncClosingPlanNext(plan);
}
function syncClosingPlanNext(plan){const progress=mutualPlanProgress(plan);if(!progress.next)return;const deals=getDeals(),deal=deals.find(item=>item.id===plan.dealId);if(!deal)return;deal.next=progress.next.title;deal.nextDate=progress.next.dueDate;addEntityHistory(deal,'Plano de fechamento sincronizado',`${progress.next.title} · ${progress.next.dueDate}`);saveDeals(deals);const activities=getActivities(),duplicate=activities.some(item=>!item.done&&item.client===deal.client&&item.title===progress.next.title);if(!duplicate){activities.push({id:'activity-closing-'+Date.now(),title:progress.next.title,type:'Fechamento',client:deal.client,date:progress.next.dueDate,time:'09:00',note:`Plano de fechamento · Responsável: ${ownerLabel(progress.next.owner)}`,owner:deal.owner||appState.currentUser?.name||'',done:false});saveActivities(activities)}$('#syncClosingNext').textContent='Próxima ação sincronizada ✓'}
function renderClosingPlans(){
  const plans=getClosingPlans(),openDeals=dealsVisibleToCurrentUser(getDeals()).filter(deal=>deal.status!=='won'&&deal.status!=='lost'),evaluated=plans.map(plan=>({plan,progress:mutualPlanProgress(plan)})),active=evaluated.filter(item=>!item.progress.complete),overdue=evaluated.filter(item=>item.progress.overdue),complete=evaluated.filter(item=>item.progress.complete),average=evaluated.length?Math.round(evaluated.reduce((sum,item)=>sum+item.progress.percent,0)/evaluated.length):0;$('#closingPlansActive').textContent=active.length;$('#closingPlansInProgress').textContent=active.length;$('#closingPlansOverdue').textContent=overdue.length;$('#closingPlansComplete').textContent=complete.length;$('#closingPlansAverage').textContent=`${average}%`;
  const dealSelect=$('#closingPlanDeal');dealSelect.innerHTML='<option value="">Selecione uma oportunidade</option>'+openDeals.filter(deal=>!plans.some(plan=>plan.dealId===deal.id&&!mutualPlanProgress(plan).complete)).map(deal=>`<option value="${escapeHtml(deal.id)}">${escapeHtml(deal.client)} · ${escapeHtml(deal.title)}</option>`).join('');$('#closingPlansList').innerHTML=evaluated.length?evaluated.map(({plan,progress})=>`<button type="button" class="closing-plan-item ${plan.id===activeClosingPlanId?'active':''} ${progress.overdue?'attention':''}" data-closing-plan="${escapeHtml(plan.id)}"><span>${escapeHtml(plan.client.charAt(0))}</span><div><strong>${escapeHtml(plan.client)}</strong><small>${escapeHtml(plan.dealTitle)}</small><i><b style="width:${progress.percent}%"></b></i></div><em>${progress.percent}%${progress.overdue?` · ${progress.overdue} atraso${progress.overdue===1?'':'s'}`:''}</em></button>`).join(''):orbitEmptyState('Nenhum plano criado','Selecione uma oportunidade para começar.','closing-list-empty');document.querySelectorAll('[data-closing-plan]').forEach(button=>button.onclick=()=>{activeClosingPlanId=button.dataset.closingPlan;renderClosingPlans()});
  const form=$('#closingPlanForm');if(!form.dataset.ready){form.dataset.ready='1';form.onsubmit=event=>{event.preventDefault();const deal=getDeals().find(item=>item.id===dealSelect.value);if(!deal)return;const client=clientForDeal(deal),items=getClosingPlans(),plan=createMutualActionPlan({deal,client});items.unshift(plan);saveClosingPlans(items);activeClosingPlanId=plan.id;addEntityHistory(deal,'Plano de fechamento criado',`${plan.milestones.length} marcos até ${plan.targetDate}`);const deals=getDeals(),stored=deals.find(item=>item.id===deal.id);stored.history=deal.history;saveDeals(deals);renderClosingPlans()}}renderClosingPlanDetail();
}
let activeGrowthTab='signals';
function enabledAutomationRules(){try{const saved=JSON.parse(localStorage.getItem(AUTOMATION_RULES_KEY));return Array.isArray(saved)?saved:['overdue-followup','proposal-silence','high-value-risk']}catch{return['overdue-followup','proposal-silence','high-value-risk']}}
function getCoachingSessions(){try{return JSON.parse(localStorage.getItem(COACHING_SESSIONS_KEY))||[]}catch{return[]}}
function renderGrowthSignals(cockpit){const grid=$('#dealScoreGrid');grid.innerHTML=cockpit.cards.length?cockpit.cards.sort((a,b)=>b.score-a.score).map(item=>`<article class="deal-score-card ${item.temperature}"><header><button type="button" data-score-deal="${escapeHtml(item.deal.id)}"><span>${escapeHtml(item.deal.client?.charAt(0)||'N')}</span><div><strong>${escapeHtml(item.deal.title)}</strong><small>${escapeHtml(item.deal.client)} · ${formatMoney(item.deal.value)}</small></div></button><div class="deal-score-number"><strong>${item.score}</strong><small>/100</small></div></header><div class="deal-score-bar"><i style="width:${item.score}%"></i></div><b>${escapeHtml(item.label)}</b><section><div><small>SINAIS</small>${item.signals.length?item.signals.map(signal=>`<em class="positive">✓ ${escapeHtml(signal)}</em>`).join(''):'<em>Sem evidências suficientes</em>'}</div><div><small>RISCOS</small>${item.risks.length?item.risks.map(risk=>`<em class="negative">! ${escapeHtml(risk)}</em>`).join(''):'<em class="positive">✓ Sem risco crítico</em>'}</div></section><footer>${item.missing.length?`Complete: ${escapeHtml(item.missing.slice(0,3).join(', '))}`:'Dados essenciais completos'}</footer></article>`).join(''):orbitEmptyState('Nenhuma oportunidade para pontuar','Cadastre negócios no pipeline para o Orbit identificar sinais de compra.');document.querySelectorAll('[data-score-deal]').forEach(button=>button.onclick=()=>openDealDrawer(button.dataset.scoreDeal))}
function renderGrowthAutomations(){const enabled=enabledAutomationRules(),actions=runAutomationRules({deals:getDeals(),activities:getActivities(),enabledRules:enabled,stages:pipelineStages,today:todayISO()});$('#automationRules').innerHTML=automationTemplates.map(rule=>`<article><span>⚡</span><div><strong>${escapeHtml(rule.name)}</strong><small>${escapeHtml(rule.description)}</small><p><b>Quando:</b> ${escapeHtml(rule.event)} <i>→</i> <b>Então:</b> ${escapeHtml(rule.action)}</p></div><label class="automation-toggle"><input type="checkbox" data-automation-rule="${rule.id}" ${enabled.includes(rule.id)?'checked':''}><i></i></label></article>`).join('');document.querySelectorAll('[data-automation-rule]').forEach(input=>input.onchange=()=>{const next=[...document.querySelectorAll('[data-automation-rule]:checked')].map(item=>item.dataset.automationRule);localStorage.setItem(AUTOMATION_RULES_KEY,JSON.stringify(next));renderGrowthAutomations()});$('#automationPendingCount').textContent=`${actions.length} ${actions.length===1?'ação sugerida':'ações sugeridas'}`;$('#automationPreview').innerHTML=actions.length?actions.slice(0,8).map(action=>`<article><span>→</span><div><strong>${escapeHtml(action.title)}</strong><small>${escapeHtml(action.client)} · ${escapeHtml(action.type)}</small></div><time>${formatDate(action.date)}</time></article>`).join(''):orbitEmptyState('Nenhuma ação pendente','As regras ativas não encontraram trabalho novo para criar.','automation-empty');$('#runGrowthAutomations').disabled=!actions.length;$('#runGrowthAutomations').onclick=()=>{const activities=getActivities();actions.forEach((action,index)=>activities.push({id:`activity-automation-${Date.now()}-${index}`,automationRuleId:action.ruleId,title:action.title,type:action.type,client:action.client,date:action.date,time:'09:00',note:'Criada pelo Studio de Automações',owner:appState.currentUser?.name||'',done:false}));saveActivities(activities);$('#runGrowthAutomations').textContent=`${actions.length} ações criadas ✓`;renderGrowthAutomations()}}
function renderGrowthCoaching(){const users=getUsers().filter(user=>user.status==='active'),select=$('#coachingUserSelect'),selected=select.value||users[0]?.id||'';select.innerHTML=users.map(user=>`<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} · ${escapeHtml(user.profile)}</option>`).join('');select.value=users.some(user=>user.id===selected)?selected:users[0]?.id||'';select.onchange=renderGrowthCoaching;const user=users.find(item=>item.id===select.value)||users[0],brief=buildCoachingBrief(user,getDeals(),getActivities(),goalPeriodNow());$('#coachingBrief').innerHTML=`<section class="coaching-person"><span>${escapeHtml(user?.name?.charAt(0)||'N')}</span><div><small>REUNIÃO 1:1</small><h2>${escapeHtml(user?.name||'Profissional')}</h2><p>${escapeHtml(user?.profile||'Equipe comercial')}</p></div></section><section class="coaching-kpis"><article><small>PIPELINE</small><strong>${formatMoney(brief.pipeline)}</strong></article><article><small>VENDIDO</small><strong>${formatMoney(brief.sold)}</strong></article><article><small>EXECUÇÃO NO PRAZO</small><strong>${brief.execution}%</strong></article></section><div class="coaching-columns"><section><small>PONTOS FORTES</small>${brief.strengths.length?brief.strengths.map(item=>`<p class="strength">✓ ${escapeHtml(item)}</p>`).join(''):'<p>Dados insuficientes para reconhecer um padrão.</p>'}</section><section><small>FOCO RECOMENDADO</small>${brief.focus.map(item=>`<p class="focus">→ ${escapeHtml(item)}</p>`).join('')}</section></div><section class="coaching-agenda"><small>ROTEIRO DA CONVERSA</small><ol>${brief.agenda.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ol></section>`;const sessions=getCoachingSessions().filter(item=>item.userId===user?.id);$('#coachingHistory').innerHTML=sessions.length?`<small>ÚLTIMAS SESSÕES</small>`+sessions.slice(0,3).map(item=>`<article><strong>${escapeHtml(item.focus)}</strong><p>${escapeHtml(item.commitment)}</p><time>Revisar em ${formatDate(item.reviewDate)}</time></article>`).join(''):'';const form=$('#coachingSessionForm');form.querySelector('[name="reviewDate"]').value=form.querySelector('[name="reviewDate"]').value||new Date(Date.now()+7*86400000).toISOString().slice(0,10);form.onsubmit=event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form)),items=getCoachingSessions();items.unshift({id:'coaching-'+Date.now(),userId:user.id,userName:user.name,...data,date:new Date().toISOString(),coach:appState.currentUser?.name||''});localStorage.setItem(COACHING_SESSIONS_KEY,JSON.stringify(items));form.reset();renderGrowthCoaching()}}
function executiveSummaryText(cockpit){return[`NIVIONTECH · RESUMO EXECUTIVO`,`Pipeline: ${formatMoney(cockpit.pipeline)}`,`Previsão por evidência: ${formatMoney(cockpit.weighted)}`,`Receita em risco: ${formatMoney(cockpit.atRiskValue)}`,`Alta intenção: ${formatMoney(cockpit.hotValue)} (${cockpit.hotCount} negócios)`,'',...cockpit.priorities.map((item,index)=>`${index+1}. ${item.title} — ${item.text}`)].join('\n')}
function renderGrowthExecutive(cockpit){$('#executivePipeline').textContent=formatMoney(cockpit.pipeline);$('#executiveForecast').textContent=formatMoney(cockpit.weighted);$('#executiveRisk').textContent=formatMoney(cockpit.atRiskValue);$('#executiveHot').textContent=formatMoney(cockpit.hotValue);$('#executivePriorityCount').textContent=cockpit.priorities.length;$('#executivePriorities').innerHTML=cockpit.priorities.length?cockpit.priorities.map((item,index)=>`<button type="button" data-executive-target="${item.target}"><span>${String(index+1).padStart(2,'0')}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></div>${item.value?`<b>${formatMoney(item.value)}</b>`:''}</button>`).join(''):orbitEmptyState('Operação sem prioridade crítica','O Orbit não encontrou risco ou atraso que exija decisão agora.');document.querySelectorAll('[data-executive-target]').forEach(button=>button.onclick=()=>showView(button.dataset.executiveTarget));const recommendation=cockpit.atRiskValue?`Proteja ${formatMoney(cockpit.atRiskValue)} em risco.`:cockpit.hotCount?`Acelere ${cockpit.hotCount} negócios com alta intenção.`:'Construa mais evidências no funil.';$('#executiveRecommendation').textContent=recommendation;$('#executiveRecommendationText').textContent=cockpit.priorities[0]?.text||'Mantenha os próximos passos atualizados para melhorar a previsão.';$('#copyExecutiveSummary').onclick=async()=>{const text=executiveSummaryText(cockpit);try{await navigator.clipboard.writeText(text);$('#copyExecutiveSummary').textContent='Resumo copiado ✓'}catch{alert(text)}}}
function renderIcpRadar(){const radar=buildIcpRadar(getClients(),getDeals(),getCompany()||{});$('#icpHeadline').textContent=radar.best?.segment||'Descobrindo';$('#icpRadar').innerHTML=radar.segments.length?radar.segments.map((item,index)=>`<article class="intelligence-card ${index===0?'featured':''}"><header><span>${String(index+1).padStart(2,'0')}</span><div><small>${index===0?'MELHOR AJUSTE ATUAL':'SEGMENTO MAPEADO'}</small><h3>${escapeHtml(item.segment)}</h3></div><strong>${item.score}</strong></header><div class="intelligence-progress"><i style="width:${item.score}%"></i></div><footer><span>${item.clients} clientes</span><span>${item.wins} ganhos</span><b>${formatMoney(item.pipeline)} em aberto</b></footer></article>`).join(''):orbitEmptyState('ICP ainda sem evidências','Cadastre segmentos nos clientes e registre vendas para o Orbit descobrir onde sua empresa vence mais.');}
function renderInfluenceMap(){const map=buildBuyingInfluenceMap(getDeals(),getClients());$('#influenceExposed').textContent=formatMoney(map.exposedValue);$('#influenceMap').innerHTML=map.accounts.length?map.accounts.map(item=>`<button type="button" data-intel-deal="${escapeHtml(item.deal.id)}"><span class="coverage-ring" style="--coverage:${item.coverage*3.6}deg"><b>${item.coverage}%</b></span><div><small>${escapeHtml(item.deal.client)} · ${formatMoney(item.deal.value)}</small><h3>${escapeHtml(item.deal.title)}</h3><p>${item.missing.length?`Falta mapear: ${escapeHtml(item.missing.join(' · '))}`:'Comitê essencial coberto'}</p></div><em class="${item.coverage>=67?'healthy':'attention'}">${item.coverage>=67?'Bem coberto':'Exposição decisória'}</em></button>`).join(''):orbitEmptyState('Nenhuma negociação ativa','Abra oportunidades para mapear quem influencia cada decisão.');bindIntelligenceDeals()}
function renderConversationIntelligence(){const intelligence=buildConversationIntelligence(getDeals());$('#conversationAverage').textContent=`${intelligence.average}%`;$('#conversationIntelligence').innerHTML=intelligence.conversations.length?intelligence.conversations.map(item=>`<button type="button" data-intel-deal="${escapeHtml(item.deal.id)}"><span class="conversation-score ${item.score>=67?'healthy':item.score>=34?'warm':'attention'}">${item.score}</span><div><small>${escapeHtml(item.deal.client)} · MEMÓRIA COMERCIAL</small><h3>${escapeHtml(item.headline)}</h3><p>${item.gaps.length?`Próximas descobertas: ${escapeHtml(item.gaps.join(' · '))}`:'Contexto essencial registrado'}</p></div><em>${formatMoney(item.deal.value)}</em></button>`).join(''):orbitEmptyState('Nenhuma conversa para avaliar','As negociações ativas aparecerão com a qualidade de suas evidências comerciais.');bindIntelligenceDeals()}
function renderRevenueLeaks(){const map=buildRevenueLeakMap(getDeals(),getActivities(),todayISO());$('#leakingRevenue').textContent=formatMoney(map.leakingValue);$('#revenueLeaks').innerHTML=map.leaks.length?map.leaks.map(item=>`<article class="leak-card ${item.severity}"><header><span>${escapeHtml(item.type)}</span><b>${formatMoney(item.value)}</b></header><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.deal.client)} · ${escapeHtml(item.deal.title)}</p><button type="button" data-intel-deal="${escapeHtml(item.deal.id)}">${escapeHtml(item.action)} →</button></article>`).join(''):orbitEmptyState('Nenhum vazamento crítico','A operação está com continuidade, prazo e execução sob controle.');bindIntelligenceDeals()}
function missionPlanText(brief){return['NIVIONTECH · MISSÕES DA SEMANA',...brief.missions.map((item,index)=>`${index+1}. ${item.title} — ${item.text} (${formatMoney(item.value)})`),'',`Prontidão comercial: ${brief.readiness}%`].join('\n')}
function renderGrowthMissions(){const brief=buildGrowthMissions({deals:getDeals(),clients:getClients(),activities:getActivities(),company:getCompany()||{},today:todayISO()});$('#missionReadiness').textContent=`${brief.readiness}%`;$('#growthMissions').innerHTML=brief.missions.length?brief.missions.map((item,index)=>`<button type="button" data-intel-deal="${escapeHtml(item.dealId)}"><span>${String(index+1).padStart(2,'0')}</span><div><small>${escapeHtml(item.kind)} · IMPACTO ${escapeHtml(item.impact.toUpperCase())}</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div><b>${formatMoney(item.value)}</b></button>`).join(''):orbitEmptyState('Semana sob controle','O Orbit não encontrou missão crítica. Use o espaço para gerar novas oportunidades qualificadas.');$('#missionHeadline').textContent=brief.missions.length?`${brief.missions.length} movimentos podem proteger ${formatMoney(brief.protectedValue)}.`:'Sua operação está pronta para crescer.';$('#missionText').textContent=brief.missions[0]?.text||`Direcione a prospecção para ${brief.icp.best?.segment||'o perfil com melhor conversão'}.`;$('#copyMissionPlan').onclick=async()=>{const text=missionPlanText(brief);try{await navigator.clipboard.writeText(text);$('#copyMissionPlan').textContent='Plano copiado ✓'}catch{alert(text)}};bindIntelligenceDeals()}
function renderCommercialTruth(){const truth=buildCommercialTruth(getDeals());$('#truthRecoverable').textContent=formatMoney(truth.recoverableValue);$('#truthConversion').textContent=`${truth.conversion}%`;$('#truthLost').textContent=truth.lost;$('#truthMissingSource').textContent=truth.missingSource;$('#truthMissingReason').textContent=truth.missingLossReason;$('#lossReasonList').innerHTML=truth.lossReasons.length?truth.lossReasons.map(item=>`<article><div><strong>${escapeHtml(item.label)}</strong><small>${item.count} ${item.count===1?'negócio':'negócios'}</small></div><b>${formatMoney(item.value)}</b></article>`).join(''):orbitEmptyState('Nenhuma perda registrada','Quando uma negociação for encerrada, o aprendizado aparecerá aqui.');$('#sourcePerformanceList').innerHTML=truth.sourcePerformance.length?truth.sourcePerformance.map(item=>`<article><div><strong>${escapeHtml(item.label)}</strong><small>${item.wins} ganhos · ${item.conversion}% de conversão</small></div><b>${formatMoney(item.value)}</b></article>`).join(''):orbitEmptyState('Origem ainda não informada','Informe a origem das oportunidades para descobrir onde sua empresa vende melhor.')}
function renderFunnelVelocity(){const velocity=buildFunnelVelocity(getDeals(),pipelineStages,new Date().toISOString());$('#velocityCycle').textContent=`${velocity.avgCycle} dias`;$('#velocityWinRate').textContent=`${velocity.winRate}%`;$('#velocityStalled').textContent=velocity.stalled;$('#velocityThroughput').textContent=formatMoney(velocity.throughput30);$('#velocityBottleneck').textContent=velocity.bottleneck?.stage.label||'—';const max=Math.max(1,...velocity.stageHealth.map(item=>item.average));$('#velocityStages').innerHTML=velocity.stageHealth.length?velocity.stageHealth.map(item=>`<article class="velocity-stage ${item.stalled?'attention':''}"><header><div><small>ETAPA</small><h3>${escapeHtml(item.stage.label)}</h3></div><strong>${item.average}<small>dias</small></strong></header><div class="velocity-bar"><i style="width:${Math.max(item.count?8:0,Math.round(item.average/max*100))}%"></i></div><footer><span>${item.count} negócios</span><span>${formatMoney(item.value)}</span><b>${item.stalled?`${item.stalled} acima do ritmo`:'Ritmo saudável'}</b></footer></article>`).join(''):orbitEmptyState('Velocidade aguardando dados','Movimente oportunidades para medir o ritmo do funil.')}
function renderDailyCommand(){const since=localStorage.getItem(DAILY_LAST_REVIEW_KEY)||new Date(Date.now()-86400000).toISOString(),command=buildDailyCommand({deals:getDeals(),activities:getActivities(),proposals:getProposals(),clients:getClients(),since,today:todayISO()});$('#dailyChanged').textContent=command.metrics.changed;$('#dailyWon').textContent=command.metrics.won;$('#dailyLost').textContent=command.metrics.lost;$('#dailyDue').textContent=command.metrics.dueToday;$('#dailyEvents').innerHTML=command.events.length?command.events.map(item=>`<button type="button" class="${item.tone}" data-intel-deal="${escapeHtml(item.dealId)}"><span></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></div><b>${formatMoney(item.value)}</b></button>`).join(''):orbitEmptyState('Nenhuma mudança desde a revisão','Sua operação segue como você deixou.');$('#dailyQuickViews').innerHTML=command.views.map(item=>`<button type="button" class="${item.tone}" data-daily-target="${item.target}"><span>${item.count}</span><div><strong>${escapeHtml(item.label)}</strong><small>${item.count?'Abrir fila de atenção':'Nenhuma pendência'}</small></div><b>→</b></button>`).join('');document.querySelectorAll('[data-daily-target]').forEach(button=>button.onclick=()=>showView(button.dataset.dailyTarget));$('#markDailyRead').onclick=()=>{localStorage.setItem(DAILY_LAST_REVIEW_KEY,new Date().toISOString());$('#markDailyRead').textContent='Revisão concluída ✓';renderDailyCommand()};bindIntelligenceDeals()}
function bindIntelligenceDeals(){document.querySelectorAll('[data-intel-deal]').forEach(button=>button.onclick=()=>openDealDrawer(button.dataset.intelDeal))}
function renderGrowthOs(){const cockpit=buildRevenueCockpit(getDeals(),getActivities(),pipelineStages,todayISO());$('#growthWeighted').textContent=formatMoney(cockpit.weighted);document.querySelectorAll('[data-growth-tab]').forEach(button=>{button.classList.toggle('active',button.dataset.growthTab===activeGrowthTab);button.onclick=()=>{activeGrowthTab=button.dataset.growthTab;renderGrowthOs()}});document.querySelectorAll('[data-growth-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.growthPanel!==activeGrowthTab));renderGrowthSignals(cockpit);renderGrowthAutomations();renderGrowthCoaching();renderGrowthExecutive(cockpit);renderIcpRadar();renderInfluenceMap();renderConversationIntelligence();renderRevenueLeaks();renderGrowthMissions();renderCommercialTruth();renderFunnelVelocity();renderDailyCommand()}
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
  renderPipelineValueSummary(deals);
  $('#kanbanBoard').innerHTML=pipelineStages.map(stage=>{
    const stageDeals=visible.filter(deal=>deal.stage===stage.id);
    const total=stageDeals.reduce((sum,deal)=>sum+Number(deal.value),0);
    return `<section class="kanban-column" data-stage="${escapeHtml(stage.id)}"><header class="column-header"><div><i class="stage-dot"></i><h3>${escapeHtml(stage.label)}</h3><span class="column-count">${stageDeals.length}</span></div><span class="column-value">${formatMoney(total)}</span></header><div>${stageDeals.length?stageDeals.map(dealCard).join(''):orbitEmptyState('Etapa livre',`O Orbit avisa quando uma oportunidade estiver pronta para ${escapeHtml(stage.label.toLowerCase())}.`,'empty-column')}</div></section>`;
  }).join('');
  bindDragAndDrop();
}
function renderPipelineValueSummary(deals){
  let summary=$('#pipelineValueSummary');
  if(!summary){
    $('#kanbanBoard').insertAdjacentHTML('beforebegin','<section id="pipelineValueSummary" class="pipeline-value-summary" aria-label="Resumo financeiro do funil"></section>');
    summary=$('#pipelineValueSummary');
  }
  const groups=[
    {label:'Em aberto',tone:'open',items:deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost')},
    {label:'Ganhou',tone:'won',items:deals.filter(deal=>deal.stage==='won')},
    {label:'Pós-venda',tone:'after',items:deals.filter(deal=>deal.stage==='after-sales')},
    {label:'Perdido',tone:'lost',items:deals.filter(deal=>deal.status==='lost'||deal.stage==='lost')}
  ];
  summary.innerHTML=groups.map(group=>`<article class="pipeline-value-card ${group.tone}"><small>${group.label}</small><strong>${formatMoney(group.items.reduce((sum,deal)=>sum+Number(deal.value||0),0))}</strong><span>${group.items.length} ${group.items.length===1?'oportunidade':'oportunidades'}</span></article>`).join('');
}
function dealsVisibleToCurrentUser(deals){if(!appState.currentUser||appState.currentUser.profile==='Proprietário/Admin'||appState.currentUser.visibility==='all')return deals;return deals.filter(deal=>(deal.owner||'').trim().toLowerCase()===appState.currentUser.name.trim().toLowerCase())}

function daysSince(date){return Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/86400000))}
function clientForDeal(deal){return getClients().find(client=>client.name.trim().toLocaleLowerCase('pt-BR')===String(deal.client||'').trim().toLocaleLowerCase('pt-BR'))}
function healthForDeal(deal){const open=getDeals().filter(item=>item.status!=='lost'&&item.paymentStatus!=='received'),maxValue=Math.max(0,...open.map(item=>Number(item.value||0)));return calculateDealHealth(deal,clientForDeal(deal),maxValue)}
function dealCard(deal){const health=healthForDeal(deal),contactAge=daysWithoutContactLabel(deal.client,deal.createdAt),checklist=stageChecklistForDeal(deal,pipelineStages);return `<article class="deal-card health-${health.tone} ${deal.status==='lost'?'lost':deal.status==='won'?'won':''}" draggable="true" data-deal-id="${escapeHtml(deal.id)}"><div class="deal-top"><h4>${escapeHtml(deal.title)}</h4><button type="button" data-open-deal="${escapeHtml(deal.id)}" title="Abrir ficha">•••</button></div><p class="deal-client">${escapeHtml(deal.client)}</p>${deal.distributionReason?`<small class="deal-assignment-reason">↻ ${escapeHtml(deal.distributionReason)}</small>`:''}<div class="deal-value-line"><strong class="deal-value">${formatMoney(deal.value)}</strong><span class="deal-health health-${health.tone}" title="${escapeHtml(health.reason)}"><i></i>Saúde ${health.score}</span></div><div class="deal-readiness"><span><i style="width:${checklist.percent}%"></i></span><small>${checklist.percent}% pronto para avançar</small></div><div class="deal-next ${deal.next&&deal.nextDate?'':'missing'}"><small>PRÓXIMO PASSO · ${deal.nextDate?deal.nextDate===todayISO()?'HOJE':formatDate(deal.nextDate):'SEM DATA'}</small><p>${escapeHtml(deal.next||'Defina uma ação concreta')}</p></div><footer class="deal-footer"><span class="owner-avatar" title="${escapeHtml(deal.owner)}">${ownerInitials(deal.owner)}</span><span class="contact-age" title="Tempo desde a última interação">${escapeHtml(contactAge)}</span><span class="move-hint">${daysSince(deal.movedAt||deal.createdAt)}d na etapa</span><select class="card-move" data-move-deal="${escapeHtml(deal.id)}" aria-label="Mover ${escapeHtml(deal.title)} para outra etapa"><option value="">Mover para...</option>${pipelineStages.filter(stage=>stage.id!==deal.stage).map(stage=>`<option value="${escapeHtml(stage.id)}">${escapeHtml(stage.label)}</option>`).join('')}</select></footer></article>`}

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

function confirmStageAdvance(deal,newStage){const commercial=commercialPipelineStages(pipelineStages),fromIndex=commercial.findIndex(stage=>stage.id===deal.stage),toIndex=commercial.findIndex(stage=>stage.id===newStage);if(toIndex<=fromIndex||toIndex<0)return true;const validation=validateNegotiation(deal);if(!validation.valid){alert(`${validation.message} Abra a oportunidade e defina o compromisso antes de avançar.`);return false}const checklist=stageChecklistForDeal(deal,pipelineStages),missing=checklist.items.filter(item=>!item.done);if(!missing.length)return true;return confirm(`Esta oportunidade está ${checklist.percent}% pronta. Ainda falta: ${missing.map(item=>item.label.toLowerCase()).join(', ')}. Deseja avançar mesmo assim?`)}
function moveDeal(id,newStage,method){const deals=getDeals();const deal=deals.find(item=>item.id===id);if(!deal||deal.stage===newStage)return;if(newStage==='lost'){appState.activeDealId=id;openLossModal();return}if(!confirmStageAdvance(deal,newStage)){renderPipeline($('#dealSearch').value);return}if(deal.paymentStatus==='received'&&!['won','after-sales'].includes(newStage)){alert('Um recebimento já confirmado não pode voltar para uma etapa comercial.');return}const previous=deal.stage,from=pipelineStages.find(stage=>stage.id===previous)?.label,to=pipelineStages.find(stage=>stage.id===newStage)?.label,trackedFields=['status','paymentStatus','wonAt','lostAt','receiptId','receiptCreatedAt','receiptProvisional','receivedAmount','dueDate','receivedAt'],previousState=Object.fromEntries(trackedFields.map(field=>[field,deal[field]])),firstWin=previousState.status!=='won'&&['won','after-sales'].includes(newStage),movedAt=new Date().toISOString();deal.stage=newStage;deal.movedAt=movedAt;if(['won','after-sales'].includes(newStage)){applyWonDealRules(deal,newStage);deal.wonAt=deal.wonAt||movedAt;if(!deal.receiptId)createProvisionalReceipt(deal)}else if(deal.status==='won'||deal.status==='lost'){deal.status='open';deal.lostAt=null}addEntityHistory(deal,'Etapa alterada',`${from} → ${to} · ${method}`,{eventType:'stage_change',fromStage:previous,toStage:newStage,enteredAt:movedAt,method});saveDeals(deals);appState.lastMoveAction={dealId:id,from:previous,to:newStage,previousState};showUndo(`${deal.title}: ${from} → ${to}`);renderPipeline($('#dealSearch').value);if(firstWin){showMicroCelebration('sale',formatMoney(deal.value));openReceiptModal(deal.id,true)}}
function showUndo(message){clearTimeout(appState.undoTimer);$('#undoMessage').textContent=message;$('#undoToast').classList.remove('hidden');appState.undoTimer=setTimeout(hideUndo,8000)}
function hideUndo(){$('#undoToast').classList.add('hidden');appState.lastMoveAction=null;clearTimeout(appState.undoTimer)}
function undoLastMove(){if(!appState.lastMoveAction)return;const action=appState.lastMoveAction,deals=getDeals(),deal=deals.find(item=>item.id===action.dealId);if(deal&&deal.stage===action.to){const from=pipelineStages.find(stage=>stage.id===action.to)?.label,to=pipelineStages.find(stage=>stage.id===action.from)?.label,movedAt=new Date().toISOString();deal.stage=action.from;deal.movedAt=movedAt;Object.entries(action.previousState||{}).forEach(([field,value])=>{if(value===undefined)delete deal[field];else deal[field]=value});addEntityHistory(deal,'Movimentação desfeita',`${from} → ${to}`,{eventType:'stage_change',fromStage:action.to,toStage:action.from,enteredAt:movedAt,method:'Desfazer movimentação'});saveDeals(deals);renderPipeline($('#dealSearch').value)}hideUndo()}

function addEntityHistory(entity,title,text,metadata={}){entity.history=entity.history||[];entity.history.unshift({id:'history-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),title,text,date:new Date().toISOString(),actor:appState.currentUser?.name||getOwner()?.name||'Sistema',...metadata});return entity}
function orbitMemoryMarkup(memory,emptyMessage){if(!memory?.summary)return`<div class="orbit-memory-empty">${escapeHtml(emptyMessage)}</div>`;return`<div class="orbit-memory-summary"><span class="orbit-mini">O</span><div><strong>${escapeHtml(memory.summary)}</strong><small>${memory.lastConversationAt||memory.updatedAt?`Atualizada em ${new Date(memory.lastConversationAt||memory.updatedAt).toLocaleString('pt-BR')}`:'Memória comercial'}</small></div></div><div class="orbit-memory-tags">${(memory.pains||[]).map(item=>`<span>Dor: ${escapeHtml(item)}</span>`).join('')}${(memory.objections||[]).map(item=>`<span>Objeção: ${escapeHtml(item)}</span>`).join('')}${memory.risk?`<span>Saúde: ${escapeHtml(memory.risk)}</span>`:''}</div>${memory.lastNextStep?`<p><b>Próximo passo:</b> ${escapeHtml(memory.lastNextStep)}</p>`:''}`}
function renderDealOrbitMemory(deal){let section=$('#dealOrbitMemory');if(!section){$('#dealHistory').closest('.deal-detail-section').insertAdjacentHTML('beforebegin','<section id="dealOrbitMemory" class="deal-detail-section orbit-memory-section"><div class="detail-section-title"><h3>Memória da negociação</h3><small>Orbit IA</small></div><div class="orbit-memory-content"></div></section>');section=$('#dealOrbitMemory')}section.querySelector('.orbit-memory-content').innerHTML=orbitMemoryMarkup(deal.orbitMemory,'Analise uma conversa no Orbit IA para construir a memória desta negociação.')}
function renderClientOrbitMemory(client){let section=$('#clientOrbitMemory');if(!section){$('#clientDealsList').closest('.deal-detail-section').insertAdjacentHTML('beforebegin','<section id="clientOrbitMemory" class="deal-detail-section orbit-memory-section"><div class="detail-section-title"><h3>Memória do cliente</h3><small>Orbit IA</small></div><div class="orbit-memory-content"></div></section>');section=$('#clientOrbitMemory')}section.querySelector('.orbit-memory-content').innerHTML=orbitMemoryMarkup(client.orbitMemory,'A memória aparecerá automaticamente depois que uma conversa for analisada e confirmada.')}
function openDealDrawer(id){
  const deal=getDeals().find(item=>item.id===id);if(!deal)return;appState.activeDealId=id;
  $('#drawerDealTitle').textContent=deal.title;$('#drawerDealClient').textContent=deal.client;$('#drawerDealValue').value=deal.value;$('#drawerDealOwner').value=deal.owner;$('#drawerDealLeadSource').value=deal.leadSource||'';$('#drawerDealSourceDetail').value=deal.sourceDetail||'';$('#drawerDealNext').value=deal.next;$('#drawerDealNextDate').value=deal.nextDate||todayISO();
  $('#drawerDealPain').value=deal.pain||deal.orbitMemory?.pains?.[0]||'';$('#drawerDealDecisionMaker').value=deal.decisionMaker||deal.orbitMemory?.decisionMakers?.[0]||'';$('#drawerDealBudget').value=deal.budget||deal.orbitMemory?.budget||'';$('#drawerDealObjection').value=deal.objection||deal.orbitMemory?.objections?.[0]||'';
  $('#drawerDealUrgency').value=deal.urgency||'';$('#drawerDealCompetitor').value=deal.competitor||'';$('#drawerDealSuccessCriteria').value=deal.successCriteria||'';
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
  const health=healthForDeal(deal),checklist=stageChecklistForDeal(deal,pipelineStages);$('#drawerHealthScore').textContent=health.score;$('#drawerHealthLabel').textContent=health.label;$('#drawerHealthReason').textContent=`${health.reason}. O Orbit usa atividade, prazo e exposição financeira para explicar esta prioridade.`;$('#drawerHealthScore').parentElement.dataset.tone=health.tone;$('#drawerChecklistProgress').textContent=`${checklist.done} de ${checklist.total} concluídos`;$('#drawerStageChecklist').innerHTML=checklist.items.map(item=>`<div class="checklist-item ${item.done?'done':'pending'}"><span>${item.done?'✓':'!'}</span><strong>${escapeHtml(item.label)}</strong><small>${item.done?'Confirmado':'Precisa de atenção'}</small></div>`).join('');
  const client=clientForDeal(deal),activities=getActivities().filter(item=>!item.done&&item.client.trim().toLowerCase()===deal.client.trim().toLowerCase()),proposals=getProposals().filter(item=>item.dealId===deal.id||item.client.trim().toLowerCase()===deal.client.trim().toLowerCase());
  const committee=analyzeBuyingCommittee(client?.stakeholders||[]);$('#dealConnectedContext').innerHTML=`<article class="connected-context-card"><small>CLIENTE</small><strong>${escapeHtml(client?.name||deal.client)}</strong><p>${escapeHtml(client?.mainContact||client?.phone||'Contato principal ainda não definido')}</p></article><article class="connected-context-card"><small>ATIVIDADES PENDENTES</small><strong>${activities.length}</strong><p>${escapeHtml(activities[0]?.title||'Nenhuma ação pendente')}</p></article><article class="connected-context-card"><small>PROPOSTAS</small><strong>${proposals.length}</strong><p>${escapeHtml(proposals[0]?.title||'Nenhuma proposta vinculada')}</p></article><article class="connected-context-card"><small>COMITÊ DE COMPRA</small><strong>${committee.coverage}% mapeado</strong><p>${escapeHtml(committee.recommendations[0])}</p></article>`;
  renderDealOrbitMemory(deal);
  document.querySelectorAll('[data-detail-stage]').forEach(button=>button.onclick=()=>changeDealStage(button.dataset.detailStage));
  $('#dealDrawer').classList.remove('hidden');$('#dealDrawer').setAttribute('aria-hidden','false');
}
function installHandoffSummary(){if($('#handoffSummaryCard'))return;$('#saveDealDetails').insertAdjacentHTML('afterend','<section id="handoffSummaryCard" class="handoff-summary hidden"><div class="handoff-summary-head"><span class="handoff-orbit">O</span><small>PASSAGEM DE BASTÃO</small></div><strong id="handoffSummaryTitle"></strong><p id="handoffSummaryText"></p><span id="handoffSummaryMeta"></span></section>')}
function renderHandoffSummary(deal){installHandoffSummary();const card=$('#handoffSummaryCard'),summary=deal?.handoffSummary;card.classList.toggle('hidden',!summary);if(!summary)return;$('#handoffSummaryTitle').textContent=`${summary.toOwner} recebeu esta oportunidade`;$('#handoffSummaryText').textContent=summary.text;$('#handoffSummaryMeta').textContent=`Resumo criado pelo Orbit em ${new Date(summary.createdAt).toLocaleString('pt-BR')}`}
function closeDealDrawer(){$('#dealDrawer').classList.add('hidden');$('#dealDrawer').setAttribute('aria-hidden','true');appState.activeDealId=null}
function updateActiveDeal(change,title,text){const deals=getDeals();const deal=deals.find(item=>item.id===appState.activeDealId);if(!deal)return;Object.assign(deal,change);addEntityHistory(deal,title,text);saveDeals(deals);openDealDrawer(deal.id);if(appState.currentView==='pipeline')renderPipeline($('#dealSearch').value)}
function changeDealStage(stage){const deal=getDeals().find(item=>item.id===appState.activeDealId);if(!deal||deal.stage===stage)return;if(stage==='lost'){openLossModal();return}if(['won','after-sales'].includes(stage)){winActiveDeal(stage);return}if(!confirmStageAdvance(deal,stage))return;const previous=deal.stage,from=pipelineStages.find(item=>item.id===previous)?.label,to=pipelineStages.find(item=>item.id===stage)?.label,movedAt=new Date().toISOString();const deals=getDeals(),stored=deals.find(item=>item.id===deal.id);stored.stage=stage;stored.movedAt=movedAt;addEntityHistory(stored,'Etapa alterada',`${from} → ${to} · Ficha da oportunidade`,{eventType:'stage_change',fromStage:previous,toStage:stage,enteredAt:movedAt,method:'Ficha da oportunidade'});saveDeals(deals);openDealDrawer(stored.id);if(appState.currentView==='pipeline')renderPipeline($('#dealSearch').value)}
function saveDealDetailChanges(){const deals=getDeals(),deal=deals.find(item=>item.id===appState.activeDealId);if(!deal)return;const previousOwner=deal.owner,previousRole=deal.ownerRole||'Colaborador comercial',newOwner=$('#drawerDealOwner').value.trim(),newRole=$('#drawerDealRole').value,reason=$('#drawerTransferReason').value.trim(),ownerChanged=newOwner!==previousOwner||newRole!==previousRole;deal.value=Number($('#drawerDealValue').value);deal.owner=newOwner;deal.ownerRole=newRole;deal.leadSource=$('#drawerDealLeadSource').value;deal.sourceDetail=$('#drawerDealSourceDetail').value.trim();deal.next=$('#drawerDealNext').value.trim();deal.nextDate=$('#drawerDealNextDate').value;deal.pain=$('#drawerDealPain').value.trim();deal.decisionMaker=$('#drawerDealDecisionMaker').value.trim();deal.budget=$('#drawerDealBudget').value.trim();deal.objection=$('#drawerDealObjection').value.trim();deal.urgency=$('#drawerDealUrgency').value;deal.competitor=$('#drawerDealCompetitor').value.trim();deal.successCriteria=$('#drawerDealSuccessCriteria').value.trim();deal.updatedAt=new Date().toISOString();const validation=validateNegotiation(deal);if(!validation.valid){alert(validation.message);return}if(ownerChanged){const stageLabel=pipelineStages.find(stage=>stage.id===deal.stage)?.label||deal.stage,handoff=createHandoffSummary(deal,clientForDeal(deal),{fromOwner:previousOwner,toOwner:newOwner,fromRole:previousRole,toRole:newRole,reason,stageLabel});deal.handoffSummary=handoff;addEntityHistory(deal,'Responsável transferido',`${previousOwner} (${previousRole}) → ${newOwner} (${newRole})${reason?` · Motivo: ${reason}`:''}`);addEntityHistory(deal,'Resumo de passagem criado',handoff.text,{handoffSummary:handoff.text})}else addEntityHistory(deal,'Plano da negociação atualizado','Próximo passo, origem e critérios comerciais revisados');saveDeals(deals);openDealDrawer(deal.id);if(appState.currentView==='pipeline')renderPipeline($('#dealSearch').value);if(appState.currentView==='today')renderTodayActivities()}

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
function renderCustomerSuccess(){const portfolio=buildCustomerSuccessPortfolio(getClients(),getDeals(),getActivities());$('#successRevenue').textContent=formatMoney(portfolio.totalRevenue);$('#successAccounts').textContent=portfolio.accounts.length;$('#successRisk').textContent=portfolio.atRisk;$('#successRenewals').textContent=portfolio.renewals;$('#successExpansion').textContent=portfolio.expansion;$('#successPortfolio').innerHTML=portfolio.accounts.length?portfolio.accounts.sort((a,b)=>a.score-b.score||b.revenue-a.revenue).map(item=>`<article class="success-account ${item.tone}"><header><div><span>${escapeHtml(item.client.name.charAt(0))}</span><div><h3>${escapeHtml(item.client.name)}</h3><p>${escapeHtml(item.client.segment||'Cliente')}</p></div></div><b>${item.score} saúde</b></header><div class="success-account-metrics"><div><small>RECEITA</small><strong>${formatMoney(item.revenue)}</strong></div><div><small>RENOVAÇÃO</small><strong>${item.renewalDays===null?'Não definida':item.renewalDays<0?'Vencida':`${item.renewalDays} dias`}</strong></div><div><small>EXPANSÃO</small><strong>${item.expansion?'Sinal positivo':'Acompanhar'}</strong></div></div><div class="success-account-reason"><small>ORBIT RECOMENDA</small><p>${escapeHtml(item.reasons.length?`Priorize: ${item.reasons.join(', ')}.`:item.expansion?'Cliente saudável: valide novos usuários, unidades ou serviços.':'Mantenha o acompanhamento do resultado contratado.')}</p></div><footer><button type="button" class="secondary" data-success-client="${escapeHtml(item.client.id)}">Abrir Cliente 360°</button><button type="button" class="primary" data-success-followup="${escapeHtml(item.client.id)}">${item.nextAction?'Reforçar acompanhamento':'Criar acompanhamento'}</button></footer></article>`).join(''):orbitEmptyState('A carteira começa na primeira venda','Quando uma oportunidade for ganha, o Orbit acompanhará retenção, renovação e expansão.');document.querySelectorAll('[data-success-client]').forEach(button=>button.onclick=()=>openClientDrawer(button.dataset.successClient));document.querySelectorAll('[data-success-followup]').forEach(button=>button.onclick=()=>createSuccessFollowUp(button.dataset.successFollowup))}
function createSuccessFollowUp(clientId){const client=getClients().find(item=>item.id===clientId);if(!client)return;const activities=getActivities(),date=new Date();date.setDate(date.getDate()+7);const due=date.toISOString().slice(0,10),duplicate=activities.some(item=>!item.done&&item.client===client.name&&item.note?.includes('Sucesso do cliente'));if(!duplicate){activities.push({id:'activity-'+Date.now(),title:'Revisar resultados e próximos objetivos',type:'Pós-venda',client:client.name,date:due,time:'09:00',note:'Orbit IA · Sucesso do cliente',owner:client.accountOwner||appState.currentUser?.name||'',done:false});saveActivities(activities)}renderCustomerSuccess()}
function renderBuyingCommittee(client){const stakeholders=client.stakeholders||[],analysis=analyzeBuyingCommittee(stakeholders),roleLabels=Object.fromEntries(stakeholderRoles.map(item=>[item.id,item.label])),sentimentLabels={support:'Apoia',neutral:'Neutro',resist:'Resiste'},influenceLabels={high:'Alta influência',medium:'Média influência',low:'Baixa influência'};$('#committeeCoverage').textContent=`${analysis.coverage}% mapeado`;$('#committeeCoverage').dataset.tone=analysis.risk;$('#committeeOrbitInsight').innerHTML=`<span class="orbit-mini">O</span><div><strong>${analysis.risk==='high'?'Risco político alto':analysis.risk==='attention'?'Mapa ainda incompleto':'Comitê bem coberto'}</strong><p>${escapeHtml(analysis.recommendations.join(' '))}</p></div>`;$('#stakeholderRole').innerHTML=stakeholderRoles.map(item=>`<option value="${item.id}">${escapeHtml(item.label)}</option>`).join('');$('#stakeholdersList').innerHTML=stakeholders.length?stakeholders.map(item=>`<article class="stakeholder-item ${item.sentiment}"><span>${escapeHtml(item.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(roleLabels[item.role]||item.role)} · ${escapeHtml(influenceLabels[item.influence]||'Influência não definida')}</p><small>${escapeHtml(item.contact||'Sem observação')}</small></div><b>${escapeHtml(sentimentLabels[item.sentiment]||'Neutro')}</b><button type="button" data-remove-stakeholder="${escapeHtml(item.id)}" aria-label="Remover">×</button></article>`).join(''):'<div class="history-empty">Adicione as pessoas envolvidas na compra para o Orbit analisar a cobertura política.</div>';document.querySelectorAll('[data-remove-stakeholder]').forEach(button=>button.onclick=()=>removeStakeholder(button.dataset.removeStakeholder))}
function removeStakeholder(id){const clients=getClients(),client=clients.find(item=>item.id===appState.activeClientId);if(!client)return;client.stakeholders=(client.stakeholders||[]).filter(item=>item.id!==id);addEntityHistory(client,'Comitê de compra atualizado','Pessoa removida do mapa de decisão');saveClients(clients);openClientDrawer(client.id)}
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
  const proposals=getProposals().filter(proposal=>proposal.client.trim().toLowerCase()===client.name.trim().toLowerCase()||deals.some(deal=>deal.id===proposal.dealId));
  const pending=activities.filter(activity=>!activity.done);
  $('#drawerClientName').textContent=client.name;$('#drawerClientSegment').textContent=client.segment;$('#drawerClientInitial').textContent=client.name.charAt(0).toUpperCase();$('#drawerClientStatus').textContent=client.status;$('#drawerClientStatus').classList.toggle('prospect',client.status==='Prospect');$('#drawerClientLocation').textContent=client.city||'Localização não informada';$('#drawerClientContact').textContent=`${client.phone||'Sem telefone'} · ${client.email||'Sem e-mail'}`;
  $('#clientDealsCount').textContent=deals.length;$('#clientDealsValue').textContent=formatMoney(deals.reduce((sum,deal)=>sum+Number(deal.value),0));$('#clientActivitiesCount').textContent=pending.length;
  $('#drawerClientMainContact').value=client.mainContact||'';$('#drawerClientDecisionMaker').value=client.decisionMaker||'';$('#drawerClientAccountOwner').value=client.accountOwner||'';$('#drawerClientIcpFit').value=client.icpFit||'unknown';$('#drawerClientRenewalDate').value=client.renewalDate||'';$('#drawerClientSatisfaction').value=client.satisfaction||'unknown';$('#drawerClientGoal').value=client.goal||'';$('#drawerClientStrategicNotes').value=client.strategicNotes||'';
  const relationship=clientRelationshipCompleteness(client);$('#clientStrategyForm .detail-section-title small').textContent=`${relationship.percent}% do mapa preenchido`;
  renderBuyingCommittee(client);
  renderClientOrbitMemory(client);
  $('#clientDealsList').innerHTML=deals.length?deals.map(deal=>`<button type="button" class="related-item related-item-button" data-client-deal="${escapeHtml(deal.id)}"><div><strong>${escapeHtml(deal.title)}</strong><p>${pipelineStages.find(stage=>stage.id===deal.stage)?.label||'Sem etapa'} · ${escapeHtml(deal.next)}</p></div><span>${formatMoney(deal.value)}</span></button>`).join(''):'<div class="history-empty">Nenhuma oportunidade vinculada.</div>';
  $('#clientCommercialLinks').innerHTML=`<article class="connected-context-card"><small>PRÓXIMA ATIVIDADE</small><strong>${escapeHtml(pending.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0]?.title||'Agenda livre')}</strong><p>${pending[0]?`${formatDate(pending[0].date)} às ${pending[0].time}`:'Nenhuma atividade pendente'}</p></article><article class="connected-context-card"><small>PROPOSTAS</small><strong>${proposals.length}</strong><p>${escapeHtml(proposals[0]?.title||'Nenhuma proposta vinculada')}</p></article><article class="connected-context-card"><small>MAPA COMERCIAL</small><strong>${relationship.percent}% completo</strong><p>${escapeHtml(relationship.items.filter(item=>!item.done).map(item=>item.label).slice(0,2).join(' · ')||'Contexto essencial preenchido')}</p></article>`;
  const timeline=[...(client.interactions||[]).map(item=>({...item,kind:'Interação'})),...activities.map(item=>({id:item.id,title:item.done?'Atividade concluída':'Atividade registrada',text:`${item.type}: ${item.title}`,date:item.completedAt||`${item.date}T${item.time||'12:00'}`,kind:'Atividade'})),...deals.flatMap(deal=>(deal.history||[]).map(item=>({...item,kind:'Negociação'})))].sort((a,b)=>new Date(b.date)-new Date(a.date));
  $('#clientTimeline').innerHTML=timeline.length?timeline.map(item=>`<div class="history-item"><strong>${escapeHtml(item.title||item.kind)}</strong><p>${escapeHtml(item.text)} · ${new Date(item.date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</p></div>`).join(''):'<div class="history-empty">O histórico de conversas, tarefas e negociações aparecerá aqui.</div>';
  document.querySelectorAll('[data-client-deal]').forEach(button=>button.onclick=()=>{closeClientDrawer();openDealDrawer(button.dataset.clientDeal)});
  $('#clientDrawer').classList.remove('hidden');$('#clientDrawer').setAttribute('aria-hidden','false');
}
function closeClientDrawer(){$('#clientDrawer').classList.add('hidden');$('#clientDrawer').setAttribute('aria-hidden','true');appState.activeClientId=null;$('#interactionForm').reset()}

const activitiesStore=createStore(ACTIVITIES_KEY,initialActivities,{afterSave:()=>updateActivityBadge()});
function getActivities(){return activitiesStore.get()}
function saveActivities(activities){activitiesStore.save(activities)}

const cadencesStore=createStore(CADENCES_KEY,[]);
function getCadences(){return cadencesStore.get()}
function saveCadences(items){cadencesStore.save(items)}
function renderCadencePreview(){const template=cadenceTemplates.find(item=>item.id===$('#cadenceTemplate').value),target=$('#cadencePreviewSteps');if(!template)return;$('#cadencePreviewDescription').textContent=template.description;target.innerHTML=template.steps.map(([title,type,offset],index)=>`<article class="cadence-preview-step"><span>${index+1}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(type)} · ${offset===0?'no início':`após ${offset} dias`}</small></div></article>`).join('')}
function syncCadenceDeals(){const client=getClients().find(item=>item.id===$('#cadenceClient').value),select=$('#cadenceDeal'),selected=select.value;select.innerHTML='<option value="">Sem oportunidade vinculada</option>'+getDeals().filter(deal=>client&&deal.client.trim().toLowerCase()===client.name.trim().toLowerCase()).map(deal=>`<option value="${escapeHtml(deal.id)}">${escapeHtml(deal.title)}</option>`).join('');select.value=selected}
function renderCadences(){const template=$('#cadenceTemplate'),client=$('#cadenceClient'),selectedTemplate=template.value,selectedClient=client.value;template.innerHTML=cadenceTemplates.map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');template.value=selectedTemplate||cadenceTemplates[0].id;client.innerHTML='<option value="">Selecione um cliente</option>'+getClients().map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');client.value=selectedClient;$('#cadenceStart').value=$('#cadenceStart').value||todayISO();$('#cadenceOwner').value=$('#cadenceOwner').value||appState.currentUser?.name||'';syncCadenceDeals();renderCadencePreview();const activities=getActivities(),cadences=getCadences(),active=cadences.filter(item=>!cadenceProgress(item,activities).complete&&item.status!=='paused');$('#activeCadencesCount').textContent=active.length;$('#cadencesList').innerHTML=cadences.length?cadences.map(item=>{const progress=cadenceProgress(item,activities);return `<article class="cadence-run ${progress.complete?'complete':''}"><header><div><small>${escapeHtml(item.templateName)}</small><h3>${escapeHtml(item.client)}</h3></div><span>${progress.complete?'Concluída':item.status==='paused'?'Pausada':'Em andamento'}</span></header><div class="cadence-progress"><span><i style="width:${progress.percent}%"></i></span><strong>${progress.percent}%</strong></div><p>${progress.next?`Próxima ação: ${escapeHtml(progress.next.title)} · ${formatDate(progress.next.date)}`:'Sequência finalizada'}</p><footer><small>${progress.done} de ${progress.total} ações concluídas</small>${!progress.complete?`<button type="button" data-toggle-cadence="${escapeHtml(item.id)}">${item.status==='paused'?'Retomar':'Pausar'}</button>`:''}</footer></article>`}).join(''):orbitEmptyState('Nenhuma cadência ativa','Crie uma sequência e o Orbit organizará os contatos na agenda.');document.querySelectorAll('[data-toggle-cadence]').forEach(button=>button.onclick=()=>{const items=getCadences(),item=items.find(entry=>entry.id===button.dataset.toggleCadence);item.status=item.status==='paused'?'active':'paused';saveCadences(items);renderCadences()})}
function activateCadence(event){event.preventDefault();const client=getClients().find(item=>item.id===$('#cadenceClient').value);if(!client){$('#cadenceClient').focus();return}const cadence=buildCadencePlan({templateId:$('#cadenceTemplate').value,startDate:$('#cadenceStart').value,client:client.name,dealId:$('#cadenceDeal').value,owner:$('#cadenceOwner').value.trim()});if(!cadence)return;const cadences=getCadences();cadences.unshift(cadence);saveCadences(cadences);const activities=getActivities();cadence.steps.forEach((step,index)=>activities.push({id:`activity-${Date.now()}-${index}`,cadenceId:cadence.id,cadenceStepId:step.id,title:step.title,type:step.type,client:client.name,date:step.date,time:'09:00',note:`Cadência Orbit · ${cadence.templateName}`,owner:cadence.owner,done:false}));saveActivities(activities);if(cadence.dealId){const deals=getDeals(),deal=deals.find(item=>item.id===cadence.dealId);if(deal){addEntityHistory(deal,'Cadência comercial ativada',`${cadence.templateName} · ${cadence.steps.length} ações planejadas`);saveDeals(deals)}}event.target.reset();$('#cadenceStart').value=todayISO();renderCadences()}

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
const NEXT_ACTION_DONE_KEY='niviontech_orbit_executed_actions';
function executedNextActions(){try{return JSON.parse(localStorage.getItem(NEXT_ACTION_DONE_KEY))||[]}catch{return[]}}
function currentNextBestActions(){const done=new Set(executedNextActions());return buildNextBestActions({deals:dealsVisibleToCurrentUser(getDeals()),clients:getClients(),activities:getActivities(),proposals:getProposals(),stages:pipelineStages}).filter(item=>!done.has(item.id))}
function renderOrbitExecution(actions){const box=$('#orbitExecution'),top=actions[0];if(!box)return;box.classList.toggle('empty',!top);if(!top){$('#orbitExecutionTitle').textContent='Operação sob controle';$('#orbitExecutionReason').textContent='Nenhuma ação crítica está aguardando execução agora.';$('#orbitExecutionClient').textContent='Continue registrando os próximos passos';$('#orbitExecutionValue').textContent='';$('#orbitExecutionButton').hidden=true;return}$('#orbitExecutionTitle').textContent=top.title;$('#orbitExecutionReason').textContent=top.reason;$('#orbitExecutionClient').textContent=`${top.client} · ${top.stageLabel}`;$('#orbitExecutionValue').textContent=top.value?formatMoney(top.value):'';$('#orbitExecutionButton').hidden=false;$('#orbitExecutionButton').innerHTML=`${escapeHtml(top.action)} <span>→</span>`;$('#orbitExecutionButton').onclick=()=>openNextBestAction(top.id)}
function renderTodayOrbitRecommendations(){const target=$('#todayOrbitRecommendations');if(!target)return;const actions=currentNextBestActions();target.innerHTML=actions.length?actions.slice(0,4).map((item,index)=>`<button class="recommendation recommendation-action next-action-card" data-next-action="${escapeHtml(item.id)}"><span>${index+1}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.client)} · ${escapeHtml(item.reason)}</p><small>${escapeHtml(item.action)}</small></div><b>${item.value?formatMoney(item.value):'Agora'}</b></button>`).join(''):orbitEmptyState('Operação sob controle','Quando surgir risco ou compromisso vencido, o Orbit mostrará a ação recomendada aqui.');target.querySelectorAll('[data-next-action]').forEach(button=>button.onclick=()=>openNextBestAction(button.dataset.nextAction));renderOrbitExecution(actions)}
let activeNextBestAction=null;
function ensureNextActionDrawer(){if($('#nextActionDrawer'))return;document.body.insertAdjacentHTML('beforeend',`<div class="next-action-backdrop hidden" id="nextActionBackdrop"></div><aside class="next-action-drawer hidden" id="nextActionDrawer" aria-hidden="true"><header><div><small>ORBIT · EXECUÇÃO COMERCIAL</small><h2 id="nextActionTitle"></h2></div><button type="button" id="closeNextAction" aria-label="Fechar">×</button></header><div class="next-action-body"><section class="next-action-why"><span>Por que agora</span><p id="nextActionReason"></p><div><b id="nextActionClient"></b><strong id="nextActionValue"></strong></div></section><section><label>Mensagem sugerida<textarea id="nextActionMessage" rows="6"></textarea></label><button type="button" class="secondary next-copy" id="copyNextActionMessage">Copiar mensagem</button></section><section class="next-action-schedule"><label>Próxima ação<input id="nextActionTask"></label><label>Data<input id="nextActionDate" type="date"></label></section><section class="next-action-stage"><span>ORIENTAÇÃO DE ETAPA</span><p id="nextActionStage"></p></section></div><footer><button type="button" class="secondary" id="openNextActionDeal">Abrir oportunidade</button><button type="button" class="secondary" id="scheduleNextAction">Criar atividade</button><button type="button" class="primary" id="completeNextAction">Marcar como tratado</button></footer></aside>`);$('#closeNextAction').onclick=closeNextBestAction;$('#nextActionBackdrop').onclick=closeNextBestAction;$('#copyNextActionMessage').onclick=copyNextActionMessage;$('#scheduleNextAction').onclick=scheduleNextBestAction;$('#completeNextAction').onclick=completeNextBestAction;$('#openNextActionDeal').onclick=()=>{const id=activeNextBestAction?.dealId;closeNextBestAction();if(id)openDealDrawer(id)}}
function openNextBestAction(id){const action=currentNextBestActions().find(item=>item.id===id);if(!action)return;ensureNextActionDrawer();activeNextBestAction=action;$('#nextActionTitle').textContent=action.title;$('#nextActionReason').textContent=action.reason;$('#nextActionClient').textContent=`${action.client} · ${action.deal}`;$('#nextActionValue').textContent=action.value?formatMoney(action.value):'';$('#nextActionMessage').value=action.message;$('#nextActionTask').value=action.suggestedTask;$('#nextActionDate').value=action.suggestedDate;$('#nextActionStage').textContent=action.stageSuggestion;$('#openNextActionDeal').hidden=!action.dealId;$('#nextActionDrawer').classList.remove('hidden');$('#nextActionBackdrop').classList.remove('hidden');$('#nextActionDrawer').setAttribute('aria-hidden','false')}
function closeNextBestAction(){$('#nextActionDrawer')?.classList.add('hidden');$('#nextActionBackdrop')?.classList.add('hidden');$('#nextActionDrawer')?.setAttribute('aria-hidden','true');activeNextBestAction=null}
async function copyNextActionMessage(){if(!activeNextBestAction)return;try{await navigator.clipboard.writeText($('#nextActionMessage').value);$('#copyNextActionMessage').textContent='Mensagem copiada ✓'}catch{alert($('#nextActionMessage').value)}}
function scheduleNextBestAction(){if(!activeNextBestAction)return;const title=$('#nextActionTask').value.trim(),date=$('#nextActionDate').value;if(!title||!date)return;const activities=getActivities(),duplicate=activities.some(item=>!item.done&&item.client===activeNextBestAction.client&&item.title===title&&item.date===date);if(!duplicate){activities.push({id:'activity-'+Date.now(),title,type:'Follow-up',client:activeNextBestAction.client,date,time:'09:00',note:'Criada pela próxima melhor ação do Orbit IA',owner:appState.currentUser?.name||'',done:false});saveActivities(activities)}if(activeNextBestAction.dealId){const deals=getDeals(),deal=deals.find(item=>item.id===activeNextBestAction.dealId);if(deal){deal.next=title;deal.nextDate=date;addEntityHistory(deal,'Próxima ação organizada pelo Orbit IA',`${title} · ${date}`);saveDeals(deals)}}$('#scheduleNextAction').textContent=duplicate?'Atividade já existe ✓':'Atividade criada ✓';renderTodayActivities()}
function completeNextBestAction(){if(!activeNextBestAction)return;if(activeNextBestAction.activityId){const activities=getActivities(),activity=activities.find(item=>item.id===activeNextBestAction.activityId);if(activity){activity.done=true;activity.completedAt=new Date().toISOString();saveActivities(activities)}}const clients=getClients(),client=clients.find(item=>item.name.trim().toLocaleLowerCase('pt-BR')===activeNextBestAction.client.trim().toLocaleLowerCase('pt-BR'));if(client){client.interactions=client.interactions||[];client.interactions.unshift({id:'interaction-'+Date.now(),title:`Ação tratada · ${activeNextBestAction.title}`,text:$('#nextActionMessage').value.trim(),date:new Date().toISOString()});addEntityHistory(client,'Recomendação do Orbit tratada',activeNextBestAction.title);saveClients(clients)}const done=executedNextActions();if(!done.includes(activeNextBestAction.id))done.push(activeNextBestAction.id);localStorage.setItem(NEXT_ACTION_DONE_KEY,JSON.stringify(done.slice(-300)));closeNextBestAction();renderTodayActivities()}
function renderTodayActivities(){const activities=getActivities(),pending=activities.filter(activity=>!activity.done),deals=dealsVisibleToCurrentUser(getDeals()),ranked=rankTodayActivities(activities,deals,pipelineStages),stale=findStaleDeals(deals,getClients(),getStaleDealDays()),entries=[...ranked.map(item=>({type:'activity',score:item.score,item})),...stale.map(item=>({type:'stale',score:staleDealPriority(item),item}))].sort((a,b)=>b.score-a.score);$('#todayPendingCount').textContent=pending.length+stale.length;$('#todayActivityHint').textContent=`${entries.length} ${entries.length===1?'prioridade':'prioridades'}`;$('#todayTasks').innerHTML=entries.length?entries.slice(0,6).map(entry=>{if(entry.type==='stale'){const {deal,inactiveDays}=entry.item,stage=pipelineStages.find(item=>item.id===deal.stage)?.label||'Funil',health=healthForDeal(deal);return `<div class="task stale-deal-task"><button data-open-stale-deal="${deal.id}" title="Abrir negociação">↗</button><div><strong>Retomar ${escapeHtml(deal.title)}</strong><p>${escapeHtml(deal.client)} · ${escapeHtml(stage)}</p><small class="task-priority-reason">Saúde em ${health.label.toLowerCase()}: ${escapeHtml(health.reason)}. Essa negociação está esperando por você.</small></div><time>Há ${inactiveDays}d</time></div>`}const activity=entry.item.activity;return `<div class="task"><button class="complete-activity" data-complete-activity="${activity.id}">○</button><div><strong>${escapeHtml(activity.title)}</strong><p>${escapeHtml(activity.client)} · ${escapeHtml(activity.type)}</p><small class="task-priority-reason">${escapeHtml(todayPriorityReason(entry.item))}</small></div><time>${activity.time}</time></div>`}).join(''):'<div class="agenda-empty"><strong>Tudo em dia</strong>O Orbit não encontrou nenhuma pendência para hoje.</div>';bindActivityButtons();bindStaleDealButtons();renderTodayOrbitRecommendations();updateActivityBadge();updateDashboardMetrics();renderRoleFocus();applyTodayMetricSemantics()}
function updateDashboardMetrics(){const deals=dealsVisibleToCurrentUser(getDeals()),clients=getClients(),open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost'),total=open.reduce((sum,deal)=>sum+Number(deal.value||0),0),closingStage=stageByMeaning('closing'),closing=open.filter(deal=>deal.stage===closingStage).reduce((sum,deal)=>sum+Number(deal.value||0),0);$('#todayOpenDeals').textContent=open.length;$('#todayPipelineValue').textContent=`${formatMoney(total)} no funil`;$('#todayClosingValue').textContent=formatMoney(closing);$('#todayClientsCount').textContent=clients.length}
function updateActivityBadge(){const pending=getActivities().filter(activity=>!activity.done).length;$('#activityBadge').textContent=pending;$('#activityBadge').style.display=pending?'inline-block':'none'}
function openActivityModal(){$('#activityDate').value=todayISO();$('#activityModal').classList.remove('hidden');$('#activityModal').setAttribute('aria-hidden','false');$('#activityForm [name="title"]').focus()}
function closeActivityModal(){$('#activityModal').classList.add('hidden');$('#activityModal').setAttribute('aria-hidden','true');$('#activityForm').reset()}

function analyzeLocally(text){return analyzeConversationText(text,{newStage:stageByMeaning('new'),proposalStage:stageByMeaning('proposal')})}
const proposalsStore=createStore(PROPOSALS_KEY,initialProposals);
function getProposals(){return proposalsStore.get()}
function saveProposals(items){proposalsStore.save(items)}

function renderProposals(){const search=$('#proposalSearch').value.toLowerCase(),all=getProposals(),visible=all.filter(item=>(appState.activeProposalFilter==='all'||item.status===appState.activeProposalFilter)&&(item.title+' '+item.client).toLowerCase().includes(search));$('#proposalsTotal').textContent=formatMoney(all.filter(item=>item.status!=='refused').reduce((sum,item)=>sum+Number(item.value),0));$('#proposalsList').innerHTML=visible.length?visible.map(item=>`<article class="record-card proposal-record"><button type="button" class="proposal-record-main" data-open-proposal="${escapeHtml(item.id)}"><span class="proposal-version">V${Number(item.version||1)}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.client)} · Validade ${formatDate(item.validUntil)}</p><small>${item.items?.length||1} ${(item.items?.length||1)===1?'item':'itens'}${item.viewCount?` · ${item.viewCount} ${item.viewCount===1?'visualização':'visualizações'}`:''}</small></div></button><div class="record-cell"><small>VALOR</small><strong>${formatMoney(item.value)}</strong>${item.discount?`<span>${item.discount}% de desconto</span>`:''}</div><div><span class="record-status ${item.status}">${proposalStatusLabel(item.status)}</span>${item.acceptance?`<small class="proposal-accepted-by">Por ${escapeHtml(item.acceptance.name)}</small>`:''}</div><select class="record-action" data-proposal-status="${item.id}"><option value="">Alterar estado...</option><option value="draft">Rascunho</option><option value="sent">Enviada</option><option value="viewed">Visualizada</option><option value="approved">Aprovada</option><option value="refused">Recusada</option></select></article>`).join(''):orbitEmptyState('Uma boa proposta começa aqui','Crie uma oferta premium e conduza a oportunidade até a decisão.');document.querySelectorAll('[data-proposal-status]').forEach(select=>select.onchange=()=>changeProposalStatus(select.dataset.proposalStatus,select.value));document.querySelectorAll('[data-open-proposal]').forEach(button=>button.onclick=()=>openProposalPreview(button.dataset.openProposal))}
let celebrationTimer;
function showMicroCelebration(type,value){const layer=$('#microCelebration');if(!layer)return;clearTimeout(celebrationTimer);layer.className=`micro-celebration ${type}`;$('#celebrationTitle').textContent=type==='sale'?'Venda conquistada':'Dinheiro recebido';$('#celebrationMessage').textContent=type==='sale'?`${value} avançou para recebimento.`:`${value} confirmado no caixa.`;layer.setAttribute('aria-hidden','false');void layer.offsetWidth;layer.classList.add('is-visible');celebrationTimer=setTimeout(()=>{layer.classList.remove('is-visible');layer.setAttribute('aria-hidden','true')},2400)}
function changeProposalStatus(id,status){if(!status)return;const proposals=getProposals(),proposal=proposals.find(item=>item.id===id),previous=proposal.status;proposal.status=status;proposal.updatedAt=new Date().toISOString();if(previous!==status)addEntityHistory(proposal,'Status da proposta alterado',`${proposalStatusLabel(previous)} → ${proposalStatusLabel(status)}`);saveProposals(proposals);let wonDeal=null;if(status==='approved'){const deals=getDeals(),deal=deals.find(item=>item.id===proposal.dealId);if(deal){applyWonDealRules(deal);deal.value=Number(proposal.value||deal.value);createProvisionalReceipt(deal);addEntityHistory(deal,'Proposta aprovada',`${proposal.title} foi aprovada`);addEntityHistory(deal,'Recebimento criado',`${formatMoney(deal.value)} previsto · vencimento ${formatDate(deal.dueDate)}`);saveDeals(deals);wonDeal=deal}}renderProposals();if(wonDeal){openReceiptModal(wonDeal.id,true);showMicroCelebration('sale',formatMoney(wonDeal.value))}}
function proposalItemRow(item={description:'',quantity:1,unitPrice:0}){return`<div class="proposal-item-row"><label>Item ou entrega<input data-proposal-item="description" value="${escapeHtml(item.description)}" placeholder="Ex.: Implantação e configuração" required></label><label>Qtd.<input data-proposal-item="quantity" type="number" min="0.01" step="0.01" value="${Number(item.quantity)||1}" required></label><label>Valor unitário<input data-proposal-item="unitPrice" type="number" min="0" step="0.01" value="${Number(item.unitPrice)||0}" required></label><button type="button" data-remove-proposal-item aria-label="Remover item">×</button></div>`}
function proposalBuilderItems(){return[...document.querySelectorAll('.proposal-item-row')].map(row=>({description:row.querySelector('[data-proposal-item="description"]').value.trim(),quantity:Number(row.querySelector('[data-proposal-item="quantity"]').value),unitPrice:Number(row.querySelector('[data-proposal-item="unitPrice"]').value)})).filter(item=>item.description)}
function updateProposalBuilderTotal(){const totals=calculateProposalTotals(proposalBuilderItems(),$('#proposalForm [name="discount"]').value);$('#proposalBuilderTotal').textContent=formatMoney(totals.total)}
function bindProposalItemRows(){document.querySelectorAll('[data-remove-proposal-item]').forEach(button=>button.onclick=()=>{if(document.querySelectorAll('.proposal-item-row').length>1)button.closest('.proposal-item-row').remove();updateProposalBuilderTotal()});document.querySelectorAll('[data-proposal-item]').forEach(input=>input.oninput=updateProposalBuilderTotal)}
function addProposalItem(item){$('#proposalItemsEditor').insertAdjacentHTML('beforeend',proposalItemRow(item));bindProposalItemRows();updateProposalBuilderTotal()}
function openProposalModal(){const deals=getDeals();$('#proposalDeal').innerHTML='<option value="">Sem vínculo</option>'+deals.filter(deal=>deal.status!=='lost').map(deal=>`<option value="${deal.id}">${escapeHtml(deal.title)} · ${escapeHtml(deal.client)}</option>`).join('');$('#proposalItemsEditor').innerHTML='';addProposalItem();$('#proposalModal').classList.remove('hidden');$('#proposalModal').setAttribute('aria-hidden','false');$('#proposalForm [name="validUntil"]').value=new Date(Date.now()+7*86400000).toISOString().slice(0,10);$('#proposalForm [name="title"]').focus()}
function closeProposalModal(){$('#proposalModal').classList.add('hidden');$('#proposalModal').setAttribute('aria-hidden','true');$('#proposalForm').reset()}
let activeProposalPreviewId='';
function ensureProposalPreview(){if($('#proposalPreviewDrawer'))return;document.body.insertAdjacentHTML('beforeend',`<div class="proposal-preview-backdrop hidden" id="proposalPreviewBackdrop"></div><aside class="proposal-preview-drawer hidden" id="proposalPreviewDrawer" aria-hidden="true"><header class="proposal-preview-toolbar"><div><small>NIVIONTECH CLOSE</small><strong>Apresentação da proposta</strong></div><div><button type="button" id="createProposalVersion">Criar nova versão</button><button type="button" id="recordProposalView">Registrar visualização</button><button type="button" id="printProposal">Imprimir / PDF</button><button type="button" id="closeProposalPreview">×</button></div></header><div id="proposalPreviewDocument"></div></aside>`);$('#closeProposalPreview').onclick=closeProposalPreview;$('#proposalPreviewBackdrop').onclick=closeProposalPreview;$('#createProposalVersion').onclick=createProposalVersion;$('#recordProposalView').onclick=recordProposalView;$('#printProposal').onclick=()=>{document.body.classList.add('printing-proposal');window.print();setTimeout(()=>document.body.classList.remove('printing-proposal'),300)}}
function proposalDocumentMarkup(proposal){const company=getCompany()||{},items=proposal.items?.length?proposal.items:[{description:proposal.title,quantity:1,unitPrice:Number(proposal.value||0)}],totals=calculateProposalTotals(items,proposal.discount),accepted=proposal.acceptance;return`<article class="proposal-document"><header><div class="proposal-brand"><span>N</span><div><strong>${escapeHtml(company.fantasyName||company.name||'NivionTech')}</strong><small>PROPOSTA COMERCIAL · V${Number(proposal.version||1)}</small></div></div><div class="proposal-doc-meta"><span>${proposalStatusLabel(proposal.status)}</span><small>Válida até ${formatDate(proposal.validUntil)}</small></div></header><section class="proposal-cover"><p>PREPARADO PARA</p><h1>${escapeHtml(proposal.client)}</h1><h2>${escapeHtml(proposal.title)}</h2><p>${escapeHtml(proposal.opening||'Uma proposta criada para transformar a oportunidade em resultado com clareza.')}</p></section>${proposal.scope?`<section class="proposal-scope"><small>ESCOPO E BENEFÍCIOS</small><p>${escapeHtml(proposal.scope).replace(/\n/g,'<br>')}</p></section>`:''}<section class="proposal-items"><header><strong>Investimento</strong><small>Itens incluídos nesta versão</small></header><div>${items.map(item=>`<article><div><strong>${escapeHtml(item.description)}</strong><small>${Number(item.quantity)} × ${formatMoney(item.unitPrice)}</small></div><b>${formatMoney(Number(item.quantity)*Number(item.unitPrice))}</b></article>`).join('')}</div><footer><div>${totals.discountPercent?`<span>Subtotal <b>${formatMoney(totals.subtotal)}</b></span><span>Desconto ${totals.discountPercent}% <b>− ${formatMoney(totals.discountValue)}</b></span>`:''}</div><p><span>Valor final</span><strong>${formatMoney(totals.total)}</strong></p></footer></section><section class="proposal-commercial-terms"><article><small>CONDIÇÕES DE PAGAMENTO</small><p>${escapeHtml(proposal.paymentTerms||'A combinar com o cliente.')}</p></article><article><small>PRAZO DE IMPLANTAÇÃO</small><p>${escapeHtml(proposal.deliveryTerms||'A combinar após aprovação.')}</p></article></section>${proposal.notes?`<section class="proposal-notes"><small>CONDIÇÕES E OBSERVAÇÕES</small><p>${escapeHtml(proposal.notes)}</p></section>`:''}<section class="proposal-acceptance ${accepted?'accepted':''}"><div><small>${accepted?'PROPOSTA APROVADA':'ACEITE COMERCIAL'}</small><h3>${accepted?`Aprovada por ${escapeHtml(accepted.name)}`:'Pronto para avançar?'}</h3><p>${accepted?`${new Date(accepted.acceptedAt).toLocaleString('pt-BR')} · Versão ${accepted.version}`:'Registre o responsável pela aprovação para concluir esta etapa.'}</p></div>${accepted?'<span>✓</span>':`<form id="proposalAcceptanceForm"><label>Nome do responsável<input name="name" required placeholder="Nome completo"></label><label>E-mail<input name="email" type="email" placeholder="email@empresa.com"></label><label class="proposal-accept-check"><input name="confirmed" type="checkbox" required> Confirmo a aprovação desta proposta e suas condições.</label><button class="primary" type="submit">Registrar aceite</button></form>`}</section><footer class="proposal-doc-footer"><span>NivionTech Close</span><small>Proposta criada em ${new Date(proposal.createdAt).toLocaleDateString('pt-BR')}</small></footer></article>`}
function openProposalPreview(id){ensureProposalPreview();const proposal=getProposals().find(item=>item.id===id);if(!proposal)return;activeProposalPreviewId=id;$('#proposalPreviewDocument').innerHTML=proposalDocumentMarkup(proposal);$('#proposalPreviewDrawer').classList.remove('hidden');$('#proposalPreviewBackdrop').classList.remove('hidden');$('#proposalPreviewDrawer').setAttribute('aria-hidden','false');$('#proposalAcceptanceForm')?.addEventListener('submit',submitProposalAcceptance)}
function closeProposalPreview(){$('#proposalPreviewDrawer')?.classList.add('hidden');$('#proposalPreviewBackdrop')?.classList.add('hidden');$('#proposalPreviewDrawer')?.setAttribute('aria-hidden','true');activeProposalPreviewId=''}
function recordProposalView(){const proposals=getProposals(),proposal=proposals.find(item=>item.id===activeProposalPreviewId);if(!proposal)return;markProposalViewed(proposal);addEntityHistory(proposal,'Visualização registrada',`Visualização ${proposal.viewCount} registrada no acompanhamento`);saveProposals(proposals);openProposalPreview(proposal.id);renderProposals();$('#recordProposalView').textContent='Visualização registrada ✓'}
function createProposalVersion(){const proposals=getProposals(),original=proposals.find(item=>item.id===activeProposalPreviewId);if(!original)return;const copy={...structuredClone(original),id:'proposal-'+Date.now(),version:Number(original.version||1)+1,status:'draft',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),viewCount:0,firstViewedAt:undefined,lastViewedAt:undefined,acceptance:undefined,history:[]};addEntityHistory(copy,'Nova versão criada',`Versão ${copy.version} criada a partir da versão ${Number(original.version||1)}`);proposals.push(copy);saveProposals(proposals);renderProposals();openProposalPreview(copy.id)}
function submitProposalAcceptance(event){event.preventDefault();const proposals=getProposals(),proposal=proposals.find(item=>item.id===activeProposalPreviewId);if(!proposal)return;const form=Object.fromEntries(new FormData(event.currentTarget)),result=acceptProposal(proposal,form);if(!result.valid){alert(result.message);return}addEntityHistory(proposal,'Aceite registrado',`${proposal.acceptance.name} aprovou a versão ${proposal.acceptance.version}`);saveProposals(proposals);const id=proposal.id;changeProposalStatus(id,'approved');openProposalPreview(id)}
function renderReceipts(){const won=dealsVisibleToCurrentUser(getDeals()).filter(deal=>deal.status==='won'),sold=won.reduce((sum,deal)=>sum+Number(deal.value),0),received=won.reduce((sum,deal)=>sum+Number(deal.receivedAmount||(deal.paymentStatus==='received'?deal.value:0)),0),open=Math.max(0,sold-received);$('#amountSold').textContent=formatMoney(sold);$('#amountReceived').textContent=formatMoney(received);$('#amountOpen').textContent=formatMoney(open);$('#amountPending').textContent=formatMoney(open);$('#receiptsList').innerHTML=won.length?won.map(deal=>{const status=deal.paymentStatus||'pending',paid=Number(deal.receivedAmount||(status==='received'?deal.value:0));return `<article class="record-card"><div><h3>${escapeHtml(deal.title)}</h3><p>${escapeHtml(deal.client)} · ${deal.dueDate?`Vence ${formatDate(deal.dueDate)}`:'Sem vencimento'}</p></div><div class="record-cell"><small>VENDA / RECEBIDO</small><strong>${formatMoney(deal.value)} / ${formatMoney(paid)}</strong></div><div><span class="record-status ${status}">${{pending:'Pendente',partial:'Parcial',received:'Recebido'}[status]}</span></div><button class="record-action" data-edit-receipt="${deal.id}">Atualizar</button></article>`}).join(''):orbitEmptyState('O caixa começa depois da conquista','Quando você marcar a primeira venda como ganha, o Orbit acompanhará o dinheiro até a entrada.');document.querySelectorAll('[data-edit-receipt]').forEach(button=>button.onclick=()=>openReceiptModal(button.dataset.editReceipt))}
function openReceiptModal(id,celebration=false){const deal=getDeals().find(item=>item.id===id);if(!deal)return;$('#receiptModal').classList.toggle('receipt-win-mode',celebration);$('#receiptModalEyebrow').textContent=celebration?'VENDA GANHA':'ATUALIZAR PAGAMENTO';$('#receiptModalTitle').textContent=celebration?'Você venceu!':deal.title;$('#receiptModalPrompt').textContent=celebration?`Vamos registrar o recebimento de ${formatMoney(deal.value)} agora? Você pode ajustar os dados provisórios.`:`Atualize o recebimento de ${deal.title}.`;$('#receiptForm [name="dealId"]').value=id;$('#receiptForm [name="total"]').value=deal.value;$('#receiptForm [name="received"]').value=deal.receivedAmount||(deal.paymentStatus==='received'?deal.value:0);$('#receiptForm [name="dueDate"]').value=deal.dueDate||todayISO();$('#receiptForm [name="status"]').value=deal.paymentStatus||'pending';$('#receiptModal').classList.remove('hidden');$('#receiptModal').setAttribute('aria-hidden','false')}
function closeReceiptModal(){$('#receiptModal').classList.add('hidden');$('#receiptModal').setAttribute('aria-hidden','true');$('#receiptForm').reset()}
function openLossModal(){const deal=getDeals().find(item=>item.id===appState.activeDealId);if(!deal)return;const form=$('#lossForm');form.reset();form.elements.recoveryPotential.value='low';form.elements.recoveryDate.value=new Date(Date.now()+90*86400000).toISOString().slice(0,10);$('#lossModal').classList.remove('hidden');$('#lossModal').setAttribute('aria-hidden','false');form.elements.lossReason.focus()}
function closeLossModal(){$('#lossModal').classList.add('hidden');$('#lossModal').setAttribute('aria-hidden','true');$('#lossForm').reset()}
function renderSettings(){
  const company=getCompany()||{},owner=getOwner()||{},brandName=company.fantasyName||company.name||'';
  $('#companySettings').innerHTML=`<section class="company-brand-config"><div class="company-brand-preview"><span>${company.logoData?`<img src="${company.logoData}" alt="Logo ${escapeHtml(brandName)}">`:'N'}</span><div><small>IDENTIDADE NO CRM</small><strong>${escapeHtml(brandName||'Sua empresa')}</strong><em>NivionTech CRM</em></div></div><label>Nome fantasia<input id="companyFantasyName" maxlength="48" value="${escapeHtml(brandName)}" placeholder="Ex.: Almeida Engenharia"></label><label class="company-logo-field">Logo da empresa<input id="companyLogoInput" type="file" accept="image/png,image/jpeg,image/webp"><span>PNG, JPG ou WebP · até 3 MB</span></label><div class="company-brand-actions"><button type="button" id="saveCompanyBrand" class="primary">Salvar identidade</button>${company.logoData?'<button type="button" id="removeCompanyLogo" class="secondary">Remover logo</button>':''}</div><p id="companyBrandMessage" role="status"></p></section><div><span>Razão de cadastro</span><b>${escapeHtml(company.name||'Não informada')}</b></div><div><span>Segmento</span><b>${escapeHtml(company.segment||'Não informado')}</b></div><div><span>Equipe</span><b>${escapeHtml(company.size||'Não informada')}</b></div><div><span>Plano</span><b>${companyPlanLabel(company.plan)}</b></div><div><span>Proprietário</span><b>${escapeHtml(owner.name||'')}</b></div><div><span>Armazenamento</span><b>Local e sincronização privada</b></div>`;
  let pendingLogo=company.logoData||'';const message=$('#companyBrandMessage'),fileInput=$('#companyLogoInput'),preview=$('.company-brand-preview img');applyAdaptiveImageFit(preview,Boolean(company.logoData));
  fileInput.onchange=async()=>{try{pendingLogo=await resizeCompanyLogo(fileInput.files?.[0]);message.textContent='Logo pronta. Clique em salvar identidade.'}catch(error){fileInput.value='';message.textContent=error.message}};
  $('#saveCompanyBrand').onclick=()=>{const fantasyName=$('#companyFantasyName').value.trim();if(!fantasyName){message.textContent='Informe o nome fantasia da empresa.';return}saveCompany({...company,fantasyName,logoData:pendingLogo,brandUpdatedAt:new Date().toISOString()});renderCompanyBrand();renderSettings()};
  const remove=$('#removeCompanyLogo');if(remove)remove.onclick=()=>{saveCompany({...company,fantasyName:$('#companyFantasyName').value.trim()||brandName,logoData:'',brandUpdatedAt:new Date().toISOString()});renderCompanyBrand();renderSettings()};
  const input=$('#staleDealDays');if(input){input.value=getStaleDealDays();input.onchange=()=>{input.value=saveStaleDealDays(input.value);if(appState.currentView==='today')renderTodayActivities()}}
}
function renderTeam(){const users=getUsers(),active=users.filter(user=>user.status==='active');$('#activeUsersCount').textContent=`${active.length} ${active.length===1?'usuário':'usuários'}`;$('#teamGrid').innerHTML=users.map(user=>`<article class="team-card"><div class="team-card-top"><span class="user-avatar">${ownerInitials(user.name)}</span><div><h3>${escapeHtml(user.name)}</h3><p>${escapeHtml(user.email)}</p></div><i class="user-state ${user.status==='inactive'?'inactive':''}" title="${user.status==='active'?'Ativo':'Inativo'}"></i></div><div class="team-card-info"><div><small>PERFIL</small><strong>${escapeHtml(user.profile)}</strong></div><div><small>VISIBILIDADE</small><strong>${user.visibility==='all'?'Todo o funil':'Carteira própria'}</strong></div></div><div class="team-card-actions">${user.profile==='Proprietário/Admin'?'<button disabled>Acesso principal</button>':`<button data-toggle-user="${user.id}">${user.status==='active'?'Desativar':'Ativar'}</button>`}</div></article>`).join('');document.querySelectorAll('[data-toggle-user]').forEach(button=>button.onclick=()=>toggleUserStatus(button.dataset.toggleUser));renderGoalsEditor(users)}
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

const COACH_HISTORY_KEY='niviontech_orbit_ia_training_history';
const ORBIT_ICP_KEY='niviontech_orbit_ia_icp';
const ORBIT_CONVERSATIONS_KEY='niviontech_orbit_ia_conversations';
const ORBIT_PREPARATIONS_KEY='niviontech_orbit_ia_preparations';
function getOrbitIcp(){try{return JSON.parse(localStorage.getItem(ORBIT_ICP_KEY))||{}}catch{return{}}}
function saveOrbitIcp(value){localStorage.setItem(ORBIT_ICP_KEY,JSON.stringify({...value,updatedAt:new Date().toISOString(),updatedBy:appState.currentUser?.id||''}))}
function getOrbitConversations(){try{return JSON.parse(localStorage.getItem(ORBIT_CONVERSATIONS_KEY))||[]}catch{return[]}}
function saveOrbitConversations(items){localStorage.setItem(ORBIT_CONVERSATIONS_KEY,JSON.stringify(items.slice(0,200)))}
function getOrbitPreparations(){try{return JSON.parse(localStorage.getItem(ORBIT_PREPARATIONS_KEY))||[]}catch{return[]}}
function saveOrbitPreparations(items){localStorage.setItem(ORBIT_PREPARATIONS_KEY,JSON.stringify(items.slice(0,100)))}
const coachPersonas={
  analytical:{name:'Cliente analítico',opening:'Antes de avançarmos, preciso entender exatamente como isso funciona e quais resultados podemos medir.',followups:['Quais indicadores mostram que essa solução realmente funciona?','Como seria a implantação na prática?','Que riscos eu devo considerar antes de decidir?']},
  skeptical:{name:'Cliente cético',opening:'Já ouvi promessas parecidas antes. Por que eu deveria acreditar que desta vez será diferente?',followups:['Isso parece caro. Onde está o retorno?','O que acontece se a equipe não aderir?','Por que eu não deveria continuar como estou hoje?']},
  urgent:{name:'Cliente com pressa',opening:'Tenho pouco tempo. Diga diretamente qual problema vocês resolvem e o que eu preciso fazer depois.',followups:['Qual é o principal benefício para mim?','Em quanto tempo conseguimos começar?','Qual é o próximo passo objetivo?']}
};
const coachCriteria=[
  {id:'context',label:'Abertura e contexto',keywords:['objetivo','agenda','tempo','contexto','conversa']},
  {id:'diagnosis',label:'Diagnóstico das necessidades',keywords:['como','qual','problema','desafio','impacto','hoje','processo']},
  {id:'value',label:'Demonstração de valor',keywords:['resultado','benefício','economia','ganho','valor','melhorar','reduzir']},
  {id:'objection',label:'Tratamento de objeções',keywords:['entendo','faz sentido','risco','retorno','segurança','prova','exemplo']},
  {id:'next',label:'Próximo passo',keywords:['próximo','agendar','data','reunião','enviar','combinar','quando']},
  {id:'listening',label:'Escuta ativa',keywords:['você','entendi','correto','confirma','conte','explique','prioridade']}
];
let coachState={persona:'analytical',goal:'diagnosis',dealId:'',turns:[],startedAt:null};
function coachHistory(){try{return JSON.parse(localStorage.getItem(COACH_HISTORY_KEY))||[]}catch{return[]}}
function saveCoachHistory(items){localStorage.setItem(COACH_HISTORY_KEY,JSON.stringify(items.slice(0,20)))}
function selectedCoachDeal(){return getDeals().find(deal=>deal.id===$('#coachDealSelect').value)}
function renderCoachContext(){const deal=selectedCoachDeal(),target=$('#coachContextPreview');if(!target)return;target.innerHTML=deal?`<span>${escapeHtml(deal.client)}</span><strong>${escapeHtml(deal.title)}</strong><p>${formatMoney(deal.value)} · ${escapeHtml(deal.next||'Próximo passo não definido')}</p>`:'<span>SIMULAÇÃO LIVRE</span><strong>Treino sem oportunidade vinculada</strong><p>Pratique sua abordagem sem alterar os dados do CRM.</p>'}
function renderCoachHistory(){const target=$('#coachHistoryList'),items=coachHistory();if(!target)return;target.innerHTML=items.length?items.map(item=>`<article><span>${item.score}</span><div><strong>${escapeHtml(item.client)}</strong><p>${escapeHtml(item.goal)} · ${new Date(item.date).toLocaleDateString('pt-BR')}</p></div><small>${item.turns} interações</small></article>`).join(''):orbitEmptyState('Seu progresso começa aqui','Conclua o primeiro treino para acompanhar sua evolução.','coach-empty')}
function renderOrbitCoach(){
  const select=$('#coachDealSelect');if(!select)return;const deals=dealsVisibleToCurrentUser(getDeals()),selected=select.value;
  select.innerHTML='<option value="">Cenário de treinamento livre</option>'+deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost').map(deal=>`<option value="${escapeHtml(deal.id)}">${escapeHtml(deal.client)} — ${escapeHtml(deal.title)}</option>`).join('');select.value=selected;
  const dealOptions='<option value="">Selecione uma oportunidade</option>'+deals.map(deal=>`<option value="${escapeHtml(deal.id)}">${escapeHtml(deal.client)} — ${escapeHtml(deal.title)}</option>`).join('');
  if($('#prepareDealSelect'))$('#prepareDealSelect').innerHTML=dealOptions;
  const clients=getClients();if($('#analysisClientSelect'))$('#analysisClientSelect').innerHTML='<option value="">Selecione um cliente</option>'+clients.map(client=>`<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join('');
  if($('#analysisDealSelect'))$('#analysisDealSelect').innerHTML=dealOptions;
  const icp=getOrbitIcp(),form=$('#icpForm');if(form)Object.entries(icp).forEach(([key,value])=>{const field=form.elements.namedItem(key);if(field)field.value=value||''});
  if($('#icpStatus'))$('#icpStatus').textContent=icp.updatedAt?'ICP configurado ✓':'Configurar ICP';
  renderCoachContext();renderCoachHistory();renderOrbitAnalysisHistory();renderPreparationHistory()
}
function coachChecklistMarkup(){return coachCriteria.map(item=>`<article data-coach-check="${item.id}"><i>✓</i><div><strong>${item.label}</strong><small>Aguardando evidência na conversa</small></div></article>`).join('')}
function startCoachTraining(){coachState={persona:coachState.persona,goal:$('#coachGoal').value,dealId:$('#coachDealSelect').value,turns:[],startedAt:new Date().toISOString()};const persona=coachPersonas[coachState.persona],deal=selectedCoachDeal(),icp=getOrbitIcp(),objection=String(icp.objections||'').split(',').map(item=>item.trim()).filter(Boolean)[0],opening=objection?`${persona.opening} Minha principal preocupação é ${objection.toLowerCase()}.`:persona.opening;$('#orbitCoachStart').classList.add('hidden');$('#coachResult').classList.add('hidden');$('#orbitTraining').classList.remove('hidden');$('#coachClientName').textContent=deal?.client||persona.name;$('#coachScriptTitle').textContent=$('#coachGoal').selectedOptions[0].textContent;$('#coachChecklist').innerHTML=coachChecklistMarkup();$('#coachMessages').innerHTML=`<article class="coach-message client"><span>${escapeHtml((deal?.client||persona.name).charAt(0))}</span><div><small>CLIENTE</small><p>${escapeHtml(opening)}</p></div></article>`;updateCoachProgress();$('#coachMessage').focus()}
function coachText(){return coachState.turns.join(' ').toLocaleLowerCase('pt-BR')}
function criterionScore(criterion){const text=coachText(),matches=criterion.keywords.filter(word=>text.includes(word)).length,turnBonus=Math.min(18,coachState.turns.length*3);return Math.min(100,28+matches*13+turnBonus)}
function updateCoachProgress(){const scores=coachCriteria.map(criterionScore),progress=Math.round(scores.reduce((sum,value)=>sum+value,0)/scores.length);$('#coachProgress').textContent=`${progress}%`;$('#coachTurnCount').textContent=`${coachState.turns.length} ${coachState.turns.length===1?'interação':'interações'}`;coachCriteria.forEach((criterion,index)=>{const row=document.querySelector(`[data-coach-check="${criterion.id}"]`),score=scores[index];row?.classList.toggle('done',score>=55);const detail=row?.querySelector('small');if(detail)detail.textContent=score>=55?'Abordado durante a conversa':'Ainda pode ser explorado'})}
function coachReply(){const persona=coachPersonas[coachState.persona],index=Math.min(coachState.turns.length-1,persona.followups.length-1);return persona.followups[index]||'Entendi. O que você recomenda como próximo passo?'}
function submitCoachMessage(event){event.preventDefault();const input=$('#coachMessage'),message=input.value.trim();if(!message)return;coachState.turns.push(message);$('#coachMessages').insertAdjacentHTML('beforeend',`<article class="coach-message seller"><span>${escapeHtml((appState.currentUser?.name||'V').charAt(0))}</span><div><small>VOCÊ</small><p>${escapeHtml(message)}</p></div></article><article class="coach-message client"><span>${escapeHtml((selectedCoachDeal()?.client||coachPersonas[coachState.persona].name).charAt(0))}</span><div><small>CLIENTE</small><p>${escapeHtml(coachReply())}</p></div></article>`);input.value='';updateCoachProgress();$('#coachMessages').scrollTop=$('#coachMessages').scrollHeight}
function finishCoachTraining(){if(!coachState.turns.length){$('#coachMessage').focus();return}const scores=coachCriteria.map(criterion=>({...criterion,score:criterionScore(criterion)})),overall=Math.round(scores.reduce((sum,item)=>sum+item.score,0)/scores.length),deal=selectedCoachDeal(),strengths=[...scores].sort((a,b)=>b.score-a.score).slice(0,2),improvements=[...scores].sort((a,b)=>a.score-b.score).slice(0,2);$('#orbitTraining').classList.add('hidden');$('#coachResult').classList.remove('hidden');$('#coachOverallScore').textContent=overall;$('#coachResultTitle').textContent=overall>=80?'Apresentação consistente':overall>=60?'Boa base para evoluir':'Há espaço para praticar';$('#coachResultSummary').textContent=`Você concluiu ${coachState.turns.length} interações. O Orbit IA identificou os pontos abordados e montou seu próximo foco de treinamento.`;$('#coachScoreGrid').innerHTML=scores.map(item=>`<article><div><span>${item.label}</span><strong>${item.score}%</strong></div><i><b style="width:${item.score}%"></b></i></article>`).join('');$('#coachStrengths').innerHTML=strengths.map(item=>`<p><span>✓</span><strong>${item.label}</strong><small>Continue usando essa abordagem.</small></p>`).join('');$('#coachImprovements').innerHTML=improvements.map(item=>`<p><span>↗</span><strong>${item.label}</strong><small>Inclua perguntas e uma confirmação clara.</small></p>`).join('');const history=coachHistory();history.unshift({id:crypto.randomUUID(),score:overall,client:deal?.client||coachPersonas[coachState.persona].name,goal:$('#coachGoal').selectedOptions[0].textContent,turns:coachState.turns.length,date:new Date().toISOString(),userId:appState.currentUser?.id||''});saveCoachHistory(history);renderCoachHistory()}
function restartCoachTraining(){$('#coachResult').classList.add('hidden');$('#orbitTraining').classList.add('hidden');$('#orbitCoachStart').classList.remove('hidden');renderOrbitCoach()}
function orbitModule(name){document.querySelectorAll('[data-orbit-module]').forEach(button=>button.classList.toggle('active',button.dataset.orbitModule===name));document.querySelectorAll('[data-orbit-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.orbitPanel!==name));if(name==='prepare'||name==='analyze')renderOrbitCoach()}
function saveIcp(event){event.preventDefault();saveOrbitIcp(Object.fromEntries(new FormData(event.currentTarget)));$('#icpStatus').textContent='ICP configurado ✓';alert('DNA comercial salvo. Os próximos treinamentos usarão esse contexto.')}
function splitTerms(value=''){return String(value).split(/[,;\n]/).map(item=>item.trim()).filter(Boolean)}
function renderPreparationHistory(){const target=$('#preparationHistoryList'),items=getOrbitPreparations();if(!target)return;$('#preparationHistoryCount').textContent=`${items.length} ${items.length===1?'preparação':'preparações'}`;target.innerHTML=items.length?items.slice(0,6).map(item=>`<article><span>${item.readiness}%</span><div><strong>${escapeHtml(item.client)}</strong><p>${escapeHtml(item.deal)} · ${escapeHtml(item.meetingLabel)}</p><small>${new Date(item.date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})} · ${escapeHtml(item.actor)}</small></div></article>`).join(''):orbitEmptyState('Prepare a primeira reunião','O histórico mostrará como o vendedor chegou preparado para cada conversa.')}
function preparationPlainText(preparation,deal,client){return[`BRIEFING ORBIT IA — ${client.name||deal.client}`,`${deal.title} · ${formatMoney(deal.value)} · ${preparation.stageLabel}`,'',`OBJETIVO\n${preparation.objective}`,'',`CONTEXTO\n${preparation.context}`,'',`ESTRATÉGIA\n${preparation.strategy}`,'',`RISCOS\n${(preparation.risks.length?preparation.risks:['Nenhum risco crítico identificado.']).map(item=>`- ${item}`).join('\n')}`,'',`PERGUNTAS\n${preparation.questions.map(item=>`- ${item}`).join('\n')}`,'',`COMPROMISSO DESEJADO\n${preparation.desiredCommitment}`].join('\n')}
function prepareSelectedDeal(){const deal=getDeals().find(item=>item.id===$('#prepareDealSelect').value),target=$('#prepareOutput');if(!deal){$('#prepareDealSelect').focus();return}const client=clientForDeal(deal)||{name:deal.client},meetingType=$('#prepareMeetingType').value,meetingLabel=$('#prepareMeetingType').selectedOptions[0].textContent,stageLabel=pipelineStages.find(stage=>stage.id===deal.stage)?.label||deal.stage,preparation=buildMeetingPreparation({deal,client,activities:getActivities(),icp:getOrbitIcp(),meetingType,stageLabel}),people=preparation.people.length?preparation.people.map(person=>`<article><span>${escapeHtml(person.name.charAt(0))}</span><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role)} · ${person.influence==='high'?'alta influência':person.influence==='medium'?'média influência':'influência não informada'}</small></div><em class="${person.sentiment}">${person.sentiment==='support'?'Apoia':person.sentiment==='resist'?'Resiste':'Neutro'}</em></article>`).join(''):'<p class="prep-empty">Nenhuma pessoa mapeada. Pergunte quem participa da decisão.</p>',risks=(preparation.risks.length?preparation.risks:['Nenhum risco crítico identificado com os dados atuais.']).map(item=>`<li>${escapeHtml(item)}</li>`).join(''),questions=preparation.questions.map((item,index)=>`<li><span>${index+1}</span>${escapeHtml(item)}</li>`).join(''),pending=preparation.pending.length?preparation.pending.map(item=>`<li><strong>${escapeHtml(item.title)}</strong><small>${formatDate(item.date)}${item.time?` · ${escapeHtml(item.time)}`:''}</small></li>`).join(''):'<li><strong>Nenhuma pendência aberta</strong><small>Confirme se há algum compromisso fora do CRM.</small></li>',checklist=preparation.checklist.map(item=>`<li class="${item.done?'done':''}"><span>${item.done?'✓':'!'}</span>${escapeHtml(item.label)}</li>`).join('');target.innerHTML=`<div class="orbit-prep-head"><span class="orbit-large">O</span><div><p class="overline">BRIEFING ORBIT · ${escapeHtml(meetingLabel)}</p><h3>${escapeHtml(client.name||deal.client)}</h3><small>${escapeHtml(deal.title)} · ${formatMoney(deal.value)} · ${escapeHtml(stageLabel)}</small></div><strong class="prep-readiness">${preparation.readiness}%<small>pronto</small></strong></div><section class="prep-hero"><small>OBJETIVO DESTA CONVERSA</small><h4>${escapeHtml(preparation.objective)}</h4><p><b>Compromisso a conquistar:</b> ${escapeHtml(preparation.desiredCommitment)}</p></section><div class="prep-context-grid"><section><small>O QUE JÁ SABEMOS</small><p>${escapeHtml(preparation.context)}</p>${preparation.accountGoal?`<p><b>Objetivo da conta:</b> ${escapeHtml(preparation.accountGoal)}</p>`:''}</section><section><small>ESTRATÉGIA RECOMENDADA</small><p>${escapeHtml(preparation.strategy)}</p></section></div><section class="prep-block"><header><strong>Pessoas envolvidas</strong><small>Mapa político da reunião</small></header><div class="prep-people">${people}</div></section><div class="prep-two-columns"><section class="prep-block risk"><header><strong>Riscos para antecipar</strong></header><ul>${risks}</ul></section><section class="prep-block"><header><strong>Pendências e compromissos</strong></header><ul class="prep-pending">${pending}</ul></section></div><section class="prep-block questions"><header><strong>Perguntas recomendadas</strong><small>Use como guia, não como interrogatório</small></header><ol>${questions}</ol></section><section class="prep-block checklist"><header><strong>Checklist de prontidão</strong></header><ul>${checklist}</ul></section><div class="prep-actions"><button type="button" class="secondary" id="copyPreparation">Copiar briefing</button><button type="button" class="primary" id="finishPreparation">Marcar como preparado</button></div>`;const plainText=preparationPlainText(preparation,deal,client);$('#copyPreparation').onclick=async()=>{try{await navigator.clipboard.writeText(plainText);$('#copyPreparation').textContent='Briefing copiado ✓'}catch{alert(plainText)}};$('#finishPreparation').onclick=()=>{const items=getOrbitPreparations();items.unshift({id:crypto.randomUUID(),dealId:deal.id,client:client.name||deal.client,deal:deal.title,meetingType,meetingLabel,readiness:preparation.readiness,date:new Date().toISOString(),actor:appState.currentUser?.name||'Usuário'});saveOrbitPreparations(items);$('#finishPreparation').textContent='Preparação concluída ✓';$('#finishPreparation').disabled=true;renderPreparationHistory()}}
let pendingOrbitAnalysis=null;
function renderOrbitAnalysisHistory(){const target=$('#analysisHistoryList'),items=getOrbitConversations();if(!target)return;$('#analysisHistoryCount').textContent=`${items.length} ${items.length===1?'registro':'registros'}`;target.innerHTML=items.length?items.slice(0,8).map(item=>`<article><span class="analysis-history-icon">${escapeHtml((item.source||'A').charAt(0))}</span><div><strong>${escapeHtml(item.title||item.signals?.reportTitle||'Conversa comercial')}</strong><p>${escapeHtml(item.summary||'Sem resumo')} </p><small>${escapeHtml(item.clientName||'Cliente')} · ${new Date(item.date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</small></div><em class="${item.risk==='Saudável'?'healthy':''}">${escapeHtml(item.risk||'Analisado')}</em></article>`).join(''):orbitEmptyState('A memória começa na primeira conversa','Analise um atendimento para criar o histórico comercial do cliente.')}
function analyzeDealConversation(){const text=$('#analysisText').value.trim(),client=getClients().find(item=>item.id===$('#analysisClientSelect').value),deal=getDeals().find(item=>item.id===$('#analysisDealSelect').value),target=$('#analysisOutput');if(!client){$('#analysisClientSelect').focus();return}if(!text){$('#analysisText').focus();return}const signals=analyzeCommercialConversation(text,{client,deal,icp:getOrbitIcp()}),nextDate=deal?.nextDate||todayISO(),source=$('#analysisSource').value,title=$('#analysisTitle').value.trim()||`${source} · ${client.name}`;pendingOrbitAnalysis={id:crypto.randomUUID(),clientId:client.id,clientName:client.name,dealId:deal?.id||'',dealTitle:deal?.title||'',source,title,text,summary:signals.summary,signals,risk:signals.risk,next:signals.next,nextDate,date:new Date().toISOString(),actor:appState.currentUser?.name||'Usuário'};const evidence=signals.evidenceQuotes.length?signals.evidenceQuotes.map(item=>`<article><span>${escapeHtml(item.label)}</span><q>${escapeHtml(item.quote)}</q></article>`).join(''):'<p class="analysis-no-evidence">Nenhum trecho conclusivo foi encontrado. Revise os campos antes de salvar.</p>',updates=signals.suggestedUpdates.map(item=>`<li><span>${escapeHtml(item.field)}</span><strong>${escapeHtml(item.value)}</strong></li>`).join('');target.innerHTML=`<div class="orbit-analysis-head"><span class="orbit-large">O</span><div><p class="overline">DIAGNÓSTICO ORBIT · REVISE ANTES DE SALVAR</p><h3>${escapeHtml(title)}</h3><small>${escapeHtml(source)} · ${escapeHtml(client.name)}</small></div></div><div class="analysis-signals"><article><small>QUALIFICAÇÃO</small><strong>${signals.score}%</strong></article><article><small>SAÚDE</small><strong>${signals.risk}</strong></article><article><small>OBJEÇÕES</small><strong>${signals.objections.length}</strong></article><article><small>SINAIS DE COMPRA</small><strong>${signals.buying.length}</strong></article></div><label>Resumo executivo<textarea id="analysisSummaryEdit" rows="4">${escapeHtml(signals.summary)}</textarea></label><div class="orbit-intelligence-grid"><article><small>LACUNAS PARA AVANÇAR</small><p>${escapeHtml(signals.gaps.join(' · ')||'Os principais critérios foram identificados.')}</p></article><article><small>COMO RESPONDER À OBJEÇÃO</small><p>${escapeHtml(signals.objectionGuidance)}</p></article></div><div class="analysis-discoveries"><article><small>DECISORES</small><strong>${escapeHtml(signals.decisionMakers.join(', ')||'Não identificados')}</strong></article><article><small>CONCORRENTES</small><strong>${escapeHtml(signals.competitors.join(', ')||'Não identificados')}</strong></article><article><small>COMPROMISSOS</small><strong>${escapeHtml(signals.commitments.join(' · ')||'Não identificados')}</strong></article></div><section class="analysis-evidence"><header><div><strong>Por que o Orbit concluiu isso?</strong><small>Evidências retiradas da conversa</small></div></header><div>${evidence}</div></section><div class="analysis-next-grid"><label>Próximo passo<input id="analysisNextEdit" value="${escapeHtml(signals.next)}"></label><label>Data da ação<input id="analysisNextDateEdit" type="date" value="${escapeHtml(nextDate)}"></label></div><label>Follow-up pronto para copiar<textarea id="analysisFollowUpEdit" rows="4">${escapeHtml(signals.followUp)}</textarea></label><div class="analysis-change-preview"><strong>Escolha o que será atualizado</strong><ul>${updates}</ul><label><input type="checkbox" data-analysis-apply="memory" checked> Salvar memória e relatório no cliente</label><label><input type="checkbox" data-analysis-apply="deal" ${deal?'checked':'disabled'}> Atualizar oportunidade vinculada</label><label><input type="checkbox" data-analysis-apply="activity" checked> Criar próxima atividade</label></div><button class="primary wide" type="button" id="confirmOrbitAnalysis">Aprovar mudanças e atualizar CRM</button>`;$('#confirmOrbitAnalysis').onclick=confirmOrbitAnalysis}
function confirmOrbitAnalysis(){if(!pendingOrbitAnalysis)return;pendingOrbitAnalysis.summary=$('#analysisSummaryEdit').value.trim();pendingOrbitAnalysis.next=$('#analysisNextEdit').value.trim();pendingOrbitAnalysis.nextDate=$('#analysisNextDateEdit').value;pendingOrbitAnalysis.followUp=$('#analysisFollowUpEdit').value.trim();pendingOrbitAnalysis.applied=[...document.querySelectorAll('[data-analysis-apply]:checked')].map(input=>input.dataset.analysisApply);const clients=getClients(),client=clients.find(item=>item.id===pendingOrbitAnalysis.clientId);if(!client)return;const applyMemory=pendingOrbitAnalysis.applied.includes('memory'),applyDeal=pendingOrbitAnalysis.applied.includes('deal'),applyActivity=pendingOrbitAnalysis.applied.includes('activity');if(applyMemory){client.orbitMemory={summary:pendingOrbitAnalysis.summary,pains:pendingOrbitAnalysis.signals.pains,objections:pendingOrbitAnalysis.signals.objections,decisionMakers:pendingOrbitAnalysis.signals.decisionMakers,competitors:pendingOrbitAnalysis.signals.competitors,commitments:pendingOrbitAnalysis.signals.commitments,evidenceQuotes:pendingOrbitAnalysis.signals.evidenceQuotes,lastConversationAt:pendingOrbitAnalysis.date,lastNextStep:pendingOrbitAnalysis.next,risk:pendingOrbitAnalysis.risk,qualificationScore:pendingOrbitAnalysis.signals.score,gaps:pendingOrbitAnalysis.signals.gaps,followUp:pendingOrbitAnalysis.followUp};if(pendingOrbitAnalysis.signals.decisionMakers[0]&&!client.decisionMaker)client.decisionMaker=pendingOrbitAnalysis.signals.decisionMakers[0];client.interactions=client.interactions||[];client.interactions.unshift({id:'interaction-'+Date.now(),title:pendingOrbitAnalysis.title,text:pendingOrbitAnalysis.summary,source:pendingOrbitAnalysis.source,date:pendingOrbitAnalysis.date});addEntityHistory(client,'Memória atualizada pelo Orbit IA',pendingOrbitAnalysis.summary);saveClients(clients)}if(applyDeal&&pendingOrbitAnalysis.dealId){const deals=getDeals(),deal=deals.find(item=>item.id===pendingOrbitAnalysis.dealId);if(deal){deal.orbitMemory={summary:pendingOrbitAnalysis.summary,pains:pendingOrbitAnalysis.signals.pains,objections:pendingOrbitAnalysis.signals.objections,decisionMakers:pendingOrbitAnalysis.signals.decisionMakers,competitors:pendingOrbitAnalysis.signals.competitors,commitments:pendingOrbitAnalysis.signals.commitments,evidenceQuotes:pendingOrbitAnalysis.signals.evidenceQuotes,budget:pendingOrbitAnalysis.signals.money,urgency:pendingOrbitAnalysis.signals.date,risk:pendingOrbitAnalysis.risk,qualificationScore:pendingOrbitAnalysis.signals.score,gaps:pendingOrbitAnalysis.signals.gaps,followUp:pendingOrbitAnalysis.followUp,updatedAt:pendingOrbitAnalysis.date};deal.next=pendingOrbitAnalysis.next||deal.next;deal.nextDate=pendingOrbitAnalysis.nextDate||deal.nextDate;deal.pain=deal.pain||pendingOrbitAnalysis.signals.pains[0]||'';deal.objection=deal.objection||pendingOrbitAnalysis.signals.objections[0]||'';deal.budget=deal.budget||pendingOrbitAnalysis.signals.money||'';deal.decisionMaker=deal.decisionMaker||pendingOrbitAnalysis.signals.decisionMakers[0]||'';deal.competitor=deal.competitor||pendingOrbitAnalysis.signals.competitors[0]||'';addEntityHistory(deal,'Diagnóstico comercial criado pelo Orbit IA',`${pendingOrbitAnalysis.summary} · Qualificação ${pendingOrbitAnalysis.signals.score}%`);saveDeals(deals)}}if(applyActivity&&pendingOrbitAnalysis.next&&pendingOrbitAnalysis.nextDate){const activities=getActivities(),duplicate=activities.some(item=>!item.done&&item.client===client.name&&item.title===pendingOrbitAnalysis.next&&item.date===pendingOrbitAnalysis.nextDate);if(!duplicate){activities.push({id:'activity-'+Date.now(),title:pendingOrbitAnalysis.next,type:'Follow-up',client:client.name,date:pendingOrbitAnalysis.nextDate,time:'09:00',note:`Criada após ${pendingOrbitAnalysis.source.toLowerCase()} analisada pelo Orbit IA`,owner:appState.currentUser?.name||'',done:false});saveActivities(activities)}}const conversations=getOrbitConversations();conversations.unshift(pendingOrbitAnalysis);saveOrbitConversations(conversations);$('#analysisOutput').innerHTML=`<div class="orbit-saved-state"><span>✓</span><h3>Memória comercial atualizada</h3><p>${pendingOrbitAnalysis.applied.length} ações aprovadas. O relatório ficou vinculado a ${escapeHtml(client.name)} e o histórico está disponível abaixo.</p><button class="secondary" type="button" data-view="clients">Abrir cliente</button></div>`;$('#analysisOutput [data-view]').onclick=()=>showView('clients');$('#analysisText').value='';$('#analysisTitle').value='';$('#analysisFile').value='';$('#analysisFileName').textContent='TXT, MD ou CSV · até 2 MB';pendingOrbitAnalysis=null;renderOrbitAnalysisHistory()}
function importAnalysisFile(event){const file=event.target.files?.[0];if(!file)return;if(file.size>2*1024*1024){alert('O arquivo deve ter no máximo 2 MB.');event.target.value='';return}const reader=new FileReader();reader.onload=()=>{$('#analysisText').value=String(reader.result||'');$('#analysisFileName').textContent=`${file.name} · pronto para analisar`;if(!$('#analysisTitle').value)$('#analysisTitle').value=file.name.replace(/\.[^.]+$/,'')};reader.onerror=()=>alert('Não foi possível ler essa transcrição.');reader.readAsText(file,'UTF-8')}
$('#coachDealSelect').onchange=renderCoachContext;
document.querySelectorAll('[data-orbit-module]').forEach(button=>button.onclick=()=>orbitModule(button.dataset.orbitModule));
$('#icpForm').onsubmit=saveIcp;
$('#prepareDealButton').onclick=prepareSelectedDeal;
$('#analysisClientSelect').onchange=()=>{const client=getClients().find(item=>item.id===$('#analysisClientSelect').value),select=$('#analysisDealSelect');select.innerHTML='<option value="">Sem oportunidade vinculada</option>'+getDeals().filter(deal=>client&&deal.client.trim().toLocaleLowerCase('pt-BR')===client.name.trim().toLocaleLowerCase('pt-BR')).map(deal=>`<option value="${escapeHtml(deal.id)}">${escapeHtml(deal.title)}</option>`).join('')};
$('#analyzeDealConversation').onclick=analyzeDealConversation;
$('#analysisFile').onchange=importAnalysisFile;
$('#cadenceTemplate').onchange=renderCadencePreview;$('#cadenceClient').onchange=syncCadenceDeals;$('#cadenceForm').onsubmit=activateCadence;
document.querySelectorAll('[data-coach-persona]').forEach(button=>button.onclick=()=>{coachState.persona=button.dataset.coachPersona;document.querySelectorAll('[data-coach-persona]').forEach(item=>item.classList.toggle('active',item===button))});
$('#startCoachTraining').onclick=startCoachTraining;
$('#coachMessageForm').onsubmit=submitCoachMessage;
$('#finishCoachTraining').onclick=finishCoachTraining;
$('#restartCoachTraining').onclick=restartCoachTraining;

document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>showView(button.dataset.view));
document.querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=closeDealModal);
document.querySelectorAll('[data-close-client-modal]').forEach(button=>button.onclick=closeClientModal);
document.querySelectorAll('[data-close-activity-modal]').forEach(button=>button.onclick=closeActivityModal);
document.querySelectorAll('[data-close-proposal-modal]').forEach(button=>button.onclick=closeProposalModal);
document.querySelectorAll('[data-close-receipt-modal]').forEach(button=>button.onclick=closeReceiptModal);
document.querySelectorAll('[data-close-loss-modal]').forEach(button=>button.onclick=closeLossModal);
document.querySelectorAll('[data-close-user-modal]').forEach(button=>button.onclick=closeUserModal);
document.querySelectorAll('[data-close-drawer]').forEach(button=>button.onclick=closeDealDrawer);
document.querySelectorAll('[data-close-client-drawer]').forEach(button=>button.onclick=closeClientDrawer);
$('#undoMove').onclick=undoLastMove;$('#dismissUndo').onclick=hideUndo;
$('#newButton').onclick=()=>{if(appState.currentView==='clients')openClientModal();else if(appState.currentView==='activities')openActivityModal();else if(appState.currentView==='proposals')openProposalModal();else if(appState.currentView==='team')openUserModal();else{if(appState.currentView!=='pipeline'&&appState.currentView!=='today')showView('pipeline');openDealModal()}};
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
$('#addProposalItem').onclick=()=>addProposalItem();
$('#proposalForm [name="discount"]').oninput=updateProposalBuilderTotal;
$('#proposalDeal').onchange=()=>{const deal=getDeals().find(item=>item.id===$('#proposalDeal').value);if(!deal)return;const form=$('#proposalForm');form.elements.client.value=deal.client;if(!form.elements.title.value)form.elements.title.value=deal.title;const rows=document.querySelectorAll('.proposal-item-row');if(rows.length===1&&!rows[0].querySelector('[data-proposal-item="description"]').value){rows[0].querySelector('[data-proposal-item="description"]').value=deal.title;rows[0].querySelector('[data-proposal-item="unitPrice"]').value=Number(deal.value||0);updateProposalBuilderTotal()}};
$('#proposalForm').onsubmit=event=>{event.preventDefault();const proposal=Object.fromEntries(new FormData(event.target)),totals=calculateProposalTotals(proposalBuilderItems(),proposal.discount);if(!totals.items.length){alert('Adicione pelo menos um item à proposta.');return}delete proposal.proposalIntent;proposal.id='proposal-'+Date.now();proposal.items=totals.items;proposal.subtotal=totals.subtotal;proposal.discount=totals.discountPercent;proposal.discountValue=totals.discountValue;proposal.value=totals.total;proposal.version=1;proposal.status=event.submitter?.value==='sent'?'sent':'draft';proposal.createdAt=new Date().toISOString();proposal.createdBy=appState.currentUser?.name||'';proposal.viewCount=0;const proposals=getProposals();proposals.push(proposal);saveProposals(proposals);if(proposal.dealId){const deals=getDeals(),deal=deals.find(item=>item.id===proposal.dealId);if(deal){deal.stage=stageByMeaning('proposal');deal.value=proposal.value;deal.next=proposal.status==='sent'?'Acompanhar decisão sobre proposta':'Revisar e enviar proposta';deal.nextDate=proposal.validUntil;addEntityHistory(deal,'Proposta premium criada',`${proposal.title} · ${formatMoney(proposal.value)} · versão 1`);saveDeals(deals)}}closeProposalModal();showView('proposals');openProposalPreview(proposal.id)};
$('#receiptForm').onsubmit=event=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.target)),deals=getDeals(),deal=deals.find(item=>item.id===form.dealId);if(!deal)return;const wasReceived=deal.paymentStatus==='received';applyReceiptRules(deal,form);addEntityHistory(deal,'Recebimento atualizado',`${formatMoney(deal.receivedAmount)} recebido · Status ${deal.paymentStatus}`);saveDeals(deals);closeReceiptModal();renderReceipts();if(!wasReceived&&deal.paymentStatus==='received')showMicroCelebration('payment',formatMoney(deal.receivedAmount))};
$('#lossForm').onsubmit=event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget)),deals=getDeals(),deal=deals.find(item=>item.id===appState.activeDealId);if(!deal)return;const previous=deal.stage,movedAt=new Date().toISOString();applyLostDealRules(deal,new Date(movedAt));deal.movedAt=movedAt;Object.assign(deal,data,{updatedAt:movedAt});addEntityHistory(deal,'Venda perdida',`${data.lossReason}${data.lostToCompetitor?` · Concorrente: ${data.lostToCompetitor}`:''} · Recuperação ${data.recoveryPotential}`,{eventType:'stage_change',fromStage:previous,toStage:'lost',enteredAt:movedAt,method:'Fluxo de perda'});if(data.recoveryPotential!=='low'&&data.recoveryDate){const activities=getActivities(),title='Retomar oportunidade perdida';if(!activities.some(item=>!item.done&&item.client===deal.client&&item.title===title)){activities.push({id:'activity-recovery-'+Date.now(),title,type:'Recuperação',client:deal.client,date:data.recoveryDate,time:'09:00',note:`Motivo anterior: ${data.lossReason}`,owner:deal.owner||appState.currentUser?.name||'',done:false});saveActivities(activities)}}saveDeals(deals);closeLossModal();openDealDrawer(deal.id);if(appState.currentView==='pipeline')renderPipeline($('#dealSearch').value)};
$('#userForm').onsubmit=event=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.target)),users=getUsers(),email=form.email.trim().toLowerCase();if(users.some(user=>user.email.toLowerCase()===email)){alert('Já existe um usuário com este e-mail.');return}users.push(withoutLocalCredentials({id:'user-'+Date.now(),name:form.name.trim(),email,profile:form.profile,visibility:form.visibility,status:form.status,accessStatus:'pending_email_code',createdAt:new Date().toISOString(),createdBy:appState.currentUser?.id}));saveUsers(users);closeUserModal();renderTeam();syncRankingAccess();alert('Colaborador salvo sem senha local. O acesso será liberado por código de e-mail.')};
$('#saveDealDetails').onclick=saveDealDetailChanges;
$('#prepareActiveDeal').onclick=()=>{const dealId=appState.activeDealId;closeDealDrawer();showView('orbitCoach');orbitModule('prepare');$('#prepareDealSelect').value=dealId;prepareSelectedDeal()};
$('#analyzeActiveDeal').onclick=()=>{const dealId=appState.activeDealId,deal=getDeals().find(item=>item.id===dealId),client=deal&&clientForDeal(deal);closeDealDrawer();showView('orbitCoach');orbitModule('analyze');if(client){$('#analysisClientSelect').value=client.id;$('#analysisClientSelect').dispatchEvent(new Event('change'));$('#analysisDealSelect').value=dealId}$('#analysisText').focus()};
function winActiveDeal(targetStage='won'){const deals=getDeals(),deal=deals.find(item=>item.id===appState.activeDealId);if(!deal)return;const previous=deal.stage,movedAt=new Date().toISOString();applyWonDealRules(deal,targetStage);deal.wonAt=movedAt;deal.movedAt=movedAt;createProvisionalReceipt(deal);addEntityHistory(deal,'Venda ganha','Negociação marcada como ganha',{eventType:'stage_change',fromStage:previous,toStage:targetStage,enteredAt:movedAt,method:'Fluxo de ganho'});addEntityHistory(deal,'Recebimento criado',`${formatMoney(deal.value)} previsto · vencimento ${formatDate(deal.dueDate)}`);saveDeals(deals);openDealDrawer(deal.id);if(appState.currentView==='pipeline')renderPipeline($('#dealSearch').value);openReceiptModal(deal.id,true);showMicroCelebration('sale',formatMoney(deal.value))}
$('#markWon').onclick=()=>winActiveDeal('won');
$('#markLost').onclick=openLossModal;
$('#markReceived').onclick=()=>{const value=Number($('#drawerDealValue').value);updateActiveDeal({paymentStatus:'received',receivedAmount:value,receivedAt:new Date().toISOString()},'Pagamento recebido',`Recebimento de ${formatMoney(value)} confirmado`);showMicroCelebration('payment',formatMoney(value))};
$('#interactionForm').onsubmit=event=>{event.preventDefault();const text=new FormData(event.target).get('text').trim();if(!text)return;const clients=getClients();const client=clients.find(item=>item.id===appState.activeClientId);client.interactions=client.interactions||[];client.interactions.unshift({id:'interaction-'+Date.now(),title:'Interação registrada',text,date:new Date().toISOString()});addEntityHistory(client,'Cliente atualizado','Nova interação registrada');saveClients(clients);event.target.reset();openClientDrawer(client.id)};
$('#clientStrategyForm').onsubmit=event=>{event.preventDefault();const clients=getClients(),client=clients.find(item=>item.id===appState.activeClientId);if(!client)return;client.mainContact=$('#drawerClientMainContact').value.trim();client.decisionMaker=$('#drawerClientDecisionMaker').value.trim();client.accountOwner=$('#drawerClientAccountOwner').value.trim();client.icpFit=$('#drawerClientIcpFit').value;client.renewalDate=$('#drawerClientRenewalDate').value;client.satisfaction=$('#drawerClientSatisfaction').value;client.goal=$('#drawerClientGoal').value.trim();client.strategicNotes=$('#drawerClientStrategicNotes').value.trim();client.updatedAt=new Date().toISOString();addEntityHistory(client,'Mapa do relacionamento atualizado','Contato, decisão, aderência ao ICP, renovação e objetivo comercial revisados');saveClients(clients);openClientDrawer(client.id)};
$('#stakeholderForm').onsubmit=event=>{event.preventDefault();const clients=getClients(),client=clients.find(item=>item.id===appState.activeClientId);if(!client)return;const stakeholder=Object.fromEntries(new FormData(event.currentTarget));stakeholder.id='stakeholder-'+Date.now();stakeholder.createdAt=new Date().toISOString();client.stakeholders=client.stakeholders||[];client.stakeholders.push(stakeholder);if(stakeholder.role==='decision'&&!client.decisionMaker)client.decisionMaker=stakeholder.name;if(stakeholder.role==='champion'&&!client.mainContact)client.mainContact=stakeholder.name;addEntityHistory(client,'Comitê de compra atualizado',`${stakeholder.name} adicionado como ${stakeholderRoles.find(item=>item.id===stakeholder.role)?.label||stakeholder.role}`);saveClients(clients);event.currentTarget.reset();openClientDrawer(client.id)};
$('#exportBackup').onclick=exportBackup;$('#exportClientsCsv').onclick=exportClientsCsv;

function logout(){sessionStorage.removeItem(SESSION);if(clerkIdentity){window.parent.postMessage({type:'niviontech:sign-out'},location.origin);return}location.href='/'}
$('#logoutButton').onclick=logout;
$('#onboardingLogout').onclick=logout;
$('#menuButton').onclick=()=>$('.sidebar').classList.toggle('open');
function renderDateCardIdentity(){const target=$('#dateCardUser');if(target)target.textContent=appState.currentUser?.name||''}
function renderMenuNewBadges(){document.querySelectorAll('.sidebar nav button[data-view]').forEach(button=>{button.querySelector('.menu-new-badge')?.remove();if(NEW_MENU_ITEMS.includes(button.dataset.view))button.insertAdjacentHTML('beforeend','<em class="menu-new-badge">NOVO</em>')})}
if(clerkIdentity)migrateClerkIdentity(localStorage,sessionStorage,clerkIdentity);
bootstrapCloudSync().then(result=>{
  if(result.reloading)return;
  initialize();
  requestAnimationFrame(()=>document.body.classList.remove('app-booting'));
});
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
  const teamGoal=Number(getGoals()[goalPeriodNow()]?.team?.sold||0),management=buildManagementForecast(deals,pipelineStages,teamGoal);
  setText('#managementWeighted',formatMoney(management.weighted));setText('#managementRisk',formatMoney(management.riskValue));setText('#managementConcentration',management.concentration+'%');setText('#managementCoverageBadge',management.coverage===null?'Configure uma meta de equipe':management.coverage+'% de cobertura da meta');
  $('#managementCoverageBadge')?.classList.toggle('attention',management.coverage!==null&&management.coverage<80);$('#managementRisk')?.closest('article')?.classList.toggle('attention',management.riskValue>0);$('#managementConcentration')?.closest('article')?.classList.toggle('attention',management.concentration>45);
  const recommendationBox=$('#managementRecommendations');if(recommendationBox)recommendationBox.innerHTML=management.recommendations.map((text,index)=>`<article><span>${index+1}</span><p>${escapeHtml(text)}</p></article>`).join('');
  const topDealsBox=$('#managementTopDeals');if(topDealsBox)topDealsBox.innerHTML=management.topDeals.length?management.topDeals.map(item=>`<button type="button" data-management-deal="${escapeHtml(item.deal.id)}"><div><strong>${escapeHtml(item.deal.title)}</strong><small>${escapeHtml(item.deal.client)} · ${Math.round(item.probability*100)}% de probabilidade</small></div><span>${formatMoney(item.weighted)}</span></button>`).join(''):orbitEmptyState('Previsão aguardando dados','Cadastre oportunidades para o Orbit calcular a previsão.');document.querySelectorAll('[data-management-deal]').forEach(button=>button.onclick=()=>openDealDrawer(button.dataset.managementDeal));
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
  const withoutNext=open.filter(deal=>!deal.next||!deal.nextDate).length;
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
  renderForecastRoom(deals);
}
function getForecastSnapshots(){try{return JSON.parse(localStorage.getItem(FORECAST_SNAPSHOTS_KEY))||[]}catch{return[]}}
function renderForecastRoom(deals=getDeals()){
  const governance=buildForecastGovernance(deals,pipelineStages),set=(selector,value)=>{const element=$(selector);if(element)element.textContent=value};set('#forecastCommit',formatMoney(governance.totals.commit));set('#forecastBest',formatMoney(governance.totals.best));set('#forecastPipelineRaw',formatMoney(governance.totals.pipeline));set('#forecastQuality',`${governance.quality}%`);set('#forecastQualityHint',governance.quality>=80?'Previsão bem sustentada':governance.quality>=60?'Há dados para confirmar':'Complete os negócios');set('#forecastRiskBadge',`${governance.atRisk.length} ${governance.atRisk.length===1?'compromisso em risco':'compromissos em risco'}`);
  const review=$('#forecastDealReview');if(review)review.innerHTML=governance.records.length?governance.records.map(item=>`<article class="forecast-review-row ${item.category}"><button type="button" data-forecast-deal="${escapeHtml(item.deal.id)}"><span>${escapeHtml(item.deal.client?.charAt(0)||'N')}</span><div><strong>${escapeHtml(item.deal.title)}</strong><small>${escapeHtml(item.deal.client)} · ${formatMoney(item.deal.value)}</small></div></button><label><small>CENÁRIO</small><select data-forecast-category="${escapeHtml(item.deal.id)}"><option value="commit">Comprometido</option><option value="best">Melhor caso</option><option value="pipeline">Pipeline</option><option value="omit">Fora da previsão</option></select></label><div class="forecast-quality"><span><i style="width:${item.quality}%"></i></span><small>${item.quality}% completo</small>${item.missing.length?`<em>Falta: ${escapeHtml(item.missing.join(', '))}</em>`:'<em class="ready">Pronto para revisão</em>'}</div></article>`).join(''):orbitEmptyState('Nenhum negócio para prever','Abra oportunidades no pipeline para construir o forecast.');
  document.querySelectorAll('[data-forecast-category]').forEach(select=>{const record=governance.records.find(item=>item.deal.id===select.dataset.forecastCategory);select.value=record?.category||'pipeline';select.onchange=()=>{const all=getDeals(),deal=all.find(item=>item.id===select.dataset.forecastCategory);if(!deal)return;deal.forecastCategory=select.value;addEntityHistory(deal,'Cenário do forecast atualizado',select.selectedOptions[0].textContent);saveDeals(all);renderReports()}});document.querySelectorAll('[data-forecast-deal]').forEach(button=>button.onclick=()=>openDealDrawer(button.dataset.forecastDeal));
  const snapshots=getForecastSnapshots(),history=$('#forecastSnapshotHistory');if(history)history.innerHTML=snapshots.length?snapshots.slice(0,8).map((item,index)=>{const comparison=compareForecastSnapshots(item,snapshots[index+1]);return`<article><span>${formatDate(item.date.slice(0,10))}</span><strong>${formatMoney(item.weighted)}</strong><small>${item.quality}% de qualidade · ${item.dealCount} negócios</small>${comparison.direction!=='new'?`<em class="${comparison.direction}">${comparison.amount>=0?'+':''}${comparison.percent}%</em>`:'<em>Base inicial</em>'}</article>`}).join(''):orbitEmptyState('Salve a primeira fotografia','Registre o forecast para acompanhar se a previsão está ficando mais forte.','forecast-empty');
  const save=$('#saveForecastSnapshot');if(save)save.onclick=()=>{const items=getForecastSnapshots();items.unshift(createForecastSnapshot(governance));localStorage.setItem(FORECAST_SNAPSHOTS_KEY,JSON.stringify(items.slice(0,24)));renderForecastRoom(getDeals());save.textContent='Fotografia salva ✓';setTimeout(()=>{save.textContent='Salvar fotografia'},1800)};
}
function getOrbitAttentionItems(){
  if(!appState.currentUser)return[];
  const deals=dealsVisibleToCurrentUser(getDeals());
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost');
  const items=[];
  getActivities().filter(activity=>!activity.done&&activity.date&&activity.date<todayISO()).forEach(activity=>items.push({priority:1,type:'Atividade atrasada',title:activity.title||'Atividade pendente',detail:(activity.client||'Sem cliente')+' · prevista para '+activity.date,target:'activities'}));
  open.filter(deal=>!deal.next||!deal.nextDate).forEach(deal=>items.push({priority:2,type:'Sem próximo passo',title:deal.title||deal.name||'Oportunidade',detail:'Defina uma ação e uma data para manter a negociação viva.',target:'pipeline'}));
  open.filter(deal=>daysSince(deal.movedAt)>7).forEach(deal=>items.push({priority:3,type:'Negociação parada',title:deal.title||deal.name||'Oportunidade',detail:'Sem avanço há '+daysSince(deal.movedAt)+' dias.',target:'pipeline'}));
  deals.filter(deal=>deal.status==='won'&&deal.paymentStatus!=='received').forEach(deal=>items.push({priority:4,type:'Recebimento pendente',title:deal.title||deal.name||'Venda concluída',detail:formatMoney(Math.max(0,(Number(deal.value)||0)-(Number(deal.receivedAmount)||0)))+' ainda não recebido.',target:'receipts'}));
  return items.sort((a,b)=>a.priority-b.priority).slice(0,20);
}
const ORBIT_DISMISSED_KEY='niviontech_orbit_dismissed_attention';
function orbitAttentionFingerprint(item){return [item.type,item.title,item.detail].join('|')}
function getDismissedOrbitAttention(){try{return JSON.parse(localStorage.getItem(ORBIT_DISMISSED_KEY)||'[]')}catch{return[]}}
function getVisibleOrbitAttentionItems(){const dismissed=new Set(getDismissedOrbitAttention());return getOrbitAttentionItems().filter(item=>!dismissed.has(orbitAttentionFingerprint(item)))}
function dismissOrbitAttentionItem(item){const dismissed=getDismissedOrbitAttention(),fingerprint=orbitAttentionFingerprint(item);if(!dismissed.includes(fingerprint))dismissed.push(fingerprint);localStorage.setItem(ORBIT_DISMISSED_KEY,JSON.stringify(dismissed.slice(-100)));refreshOrbitAttention();renderOrbitAttention()}

function refreshOrbitAttention(){
  const trigger=$('#orbitAttentionTrigger');
  if(!trigger)return;
  trigger.hidden=!appState.currentUser;
  if(!appState.currentUser)return;
  const items=getVisibleOrbitAttentionItems();
  const previousCount=Number(trigger.dataset.previousCount||0);
  const riskCount=items.filter(item=>item.priority===1).length;
  const state=riskCount>=3?'risk':items.length?'attention':'available';
  trigger.classList.remove('orbit-state-available','orbit-state-attention','orbit-state-risk');
  trigger.classList.add('orbit-state-'+state);
  trigger.dataset.orbitState=state;
  trigger.title={available:'Orbit disponível · Tudo sob controle',attention:`Orbit encontrou ${items.length} ${items.length===1?'ponto de atenção':'pontos de atenção'}`,risk:`Orbit encontrou ${riskCount} prioridades vencidas`}[state];
  trigger.setAttribute('aria-label',trigger.title+'. Clique para abrir ou arraste para mover.');
  const signature=items.map(item=>item.type+'|'+item.title+'|'+item.detail).join('::');
  const seenSignature=sessionStorage.getItem('niviontech_orbit_seen_attention')||'';
  trigger.classList.toggle('orbit-has-news',Boolean(items.length&&signature!==seenSignature));
  trigger.dataset.attentionSignature=signature;
  if(previousCount>0&&!items.length){
    trigger.classList.add('orbit-state-success');
    setTimeout(()=>trigger.classList.remove('orbit-state-success'),1800);
  }
  trigger.dataset.previousCount=String(items.length);
  const badge=$('#orbitAttentionCount');
  if(badge){badge.textContent=items.length>9?'9+':items.length;badge.hidden=!items.length}
  trigger.setAttribute('aria-label',items.length?items.length+' pontos precisam de atenção':'Nenhum ponto urgente');
}

function getOrbitContext(){
  const view=document.querySelector('.sidebar [data-view].active')?.dataset.view||appState.currentView||'today';
  const deals=dealsVisibleToCurrentUser(getDeals());
  const clients=getClients();
  const activities=getActivities();
  const today=new Date();today.setHours(0,0,0,0);
  const openDeals=deals.filter(deal=>!['won','lost'].includes(deal.status));
  const withoutNext=openDeals.filter(deal=>!deal.nextAction||!deal.nextActionDate).length;
  const stalled=openDeals.filter(deal=>Math.floor((Date.now()-new Date(deal.movedAt||deal.createdAt||Date.now()).getTime())/86400000)>getStaleDealDays()).length;
  const overdue=activities.filter(activity=>!activity.done&&activity.date&&new Date(activity.date+'T00:00:00')<today).length;
  const incompleteClients=clients.filter(client=>!client.phone||!client.email).length;
  const pendingReceipts=deals.filter(deal=>deal.status==='won'&&deal.paymentStatus!=='received').length;
  const contexts={
    today:{eyebrow:'ORBIT · SEU DIA',title:overdue?'Comece pelo que venceu':'Seu dia está organizado',text:overdue?`${overdue} ${overdue===1?'atividade precisa':'atividades precisam'} da sua atenção antes dos novos compromissos.`:'As próximas ações registradas estão guiando suas prioridades.',action:'activities',label:'Ver agenda'},
    pipeline:{eyebrow:'ORBIT · FUNIL',title:stalled?'Há negociações esperando por você':'Funil em movimento',text:stalled?`${stalled} ${stalled===1?'oportunidade está parada':'oportunidades estão paradas'} além do ritmo configurado.`:withoutNext?`${withoutNext} ${withoutNext===1?'negociação precisa':'negociações precisam'} de próximo passo e data.`:'As oportunidades abertas possuem continuidade definida.',action:'pipeline',label:'Revisar funil'},
    clients:{eyebrow:'ORBIT · RELACIONAMENTOS',title:incompleteClients?'Complete sua base de clientes':'Base pronta para crescer',text:incompleteClients?`${incompleteClients} ${incompleteClients===1?'cadastro está incompleto':'cadastros estão incompletos'} em telefone ou e-mail.`:`Você já possui ${clients.length} ${clients.length===1?'relacionamento registrado':'relacionamentos registrados'}.`,action:'clients',label:'Ver clientes'},
    activities:{eyebrow:'ORBIT · AGENDA',title:overdue?'Retornos vencidos primeiro':'Ritmo comercial em dia',text:overdue?`Resolva ${overdue} ${overdue===1?'atividade atrasada':'atividades atrasadas'} antes que os leads esfriem.`:'Nenhuma atividade vencida foi encontrada agora.',action:'activities',label:'Abrir agenda'},
    organize:{eyebrow:'ORBIT · ORGANIZAÇÃO',title:'Transforme conversa em próximo passo',text:'Cole uma conversa ou anotação. Eu preparo um rascunho e você confirma antes de salvar.',action:'organize',label:'Começar leitura'},
    proposals:{eyebrow:'ORBIT · PROPOSTAS',title:'Acompanhe cada decisão',text:'Revise propostas enviadas e transforme aprovações em avanço real no funil.',action:'proposals',label:'Ver propostas'},
    receipts:{eyebrow:'ORBIT · RECEBIMENTOS',title:pendingReceipts?'Venda ganha, recebimento pendente':'Vendas e recebimentos alinhados',text:pendingReceipts?`${pendingReceipts} ${pendingReceipts===1?'venda ainda precisa':'vendas ainda precisam'} de confirmação financeira.`:'Nenhuma venda ganha está aguardando confirmação de entrada.',action:'receipts',label:'Ver recebimentos'},
    reports:{eyebrow:'ORBIT · ANÁLISE',title:'Transforme números em decisão',text:`Seu funil possui ${openDeals.length} ${openDeals.length===1?'oportunidade aberta':'oportunidades abertas'} para acompanhar.`,action:'reports',label:'Abrir indicadores'},
    team:{eyebrow:'ORBIT · EQUIPE',title:'Responsabilidade clara faz o funil avançar',text:'Revise papéis, acessos e responsáveis para que nenhuma oportunidade fique sem dono.',action:'team',label:'Ver equipe'},
    settings:{eyebrow:'ORBIT · CONFIGURAÇÃO',title:'Ajuste o CRM ao seu ritmo',text:'Defina o período de inatividade e mantenha uma cópia segura dos seus dados.',action:'settings',label:'Ver ajustes'}
  };
  return contexts[view]||contexts.today;
}
function renderOrbitContext(){
  const box=$('#orbitContextCard');
  if(!box)return;
  const context=getOrbitContext();
  $('#orbitContextEyebrow').textContent=context.eyebrow;
  $('#orbitContextTitle').textContent=context.title;
  $('#orbitContextText').textContent=context.text;
  const action=$('#orbitContextAction');
  action.textContent=context.label;
  action.dataset.contextView=context.action;
}
function renderOrbitAttention(){
  const list=$('#orbitAttentionList');
  if(!list)return;
  renderOrbitContext();
  const items=getVisibleOrbitAttentionItems();
  list.innerHTML=items.length?items.map((item,index)=>'<article class="orbit-attention-item priority-'+item.priority+'"><button type="button" class="orbit-attention-main" data-attention-target="'+item.target+'"><span class="attention-index">'+(index+1)+'</span><span><small>'+item.type+'</small><strong>'+escapeHtml(item.title)+'</strong><p>'+escapeHtml(item.detail)+'</p></span><i>›</i></button><button type="button" class="orbit-attention-dismiss" data-attention-dismiss="'+index+'">Dar como visto</button></article>').join(''):'<div class="orbit-attention-empty"><span>✓</span><strong>Tudo sob controle</strong><p>O Orbit não encontrou nenhum ponto urgente agora.</p></div>';
  list.querySelectorAll('[data-attention-target]').forEach(button=>button.addEventListener('click',()=>{closeOrbitAttention();showView(button.dataset.attentionTarget)}));
  list.querySelectorAll('[data-attention-dismiss]').forEach(button=>button.addEventListener('click',()=>dismissOrbitAttentionItem(items[Number(button.dataset.attentionDismiss)])));
  const summary=$('#orbitAttentionSummary');
  if(summary)summary.textContent=items.length?items.length+' recomendações ordenadas por prioridade':'Seu dia está organizado';
}

function openOrbitAttention(){
  renderOrbitAttention();
  const trigger=$('#orbitAttentionTrigger');
  if(trigger){
    sessionStorage.setItem('niviontech_orbit_seen_attention',trigger.dataset.attentionSignature||'');
    trigger.classList.remove('orbit-has-news');
  }
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
  document.body.insertAdjacentHTML('beforeend','<button type="button" id="orbitAttentionTrigger" class="orbit-attention-trigger" aria-haspopup="dialog" hidden><span class="orbit-attention-orb">O</span><b id="orbitAttentionCount" hidden>0</b></button><div id="orbitAttentionBackdrop" class="orbit-attention-backdrop"></div><aside id="orbitAttentionPanel" class="orbit-attention-panel" role="dialog" aria-modal="true" aria-labelledby="orbitAttentionTitle"><header><div><small>ORBIT · ASSISTENTE COMERCIAL</small><h2 id="orbitAttentionTitle">Como posso ajudar?</h2><p id="orbitAttentionSummary">Atalhos e prioridades do seu CRM</p></div><button type="button" id="closeOrbitAttention" aria-label="Fechar">×</button></header><section id="orbitContextCard" class="orbit-context-card"><span class="orbit-context-mark">O</span><div><small id="orbitContextEyebrow">ORBIT · CONTEXTO</small><strong id="orbitContextTitle">Leitura da tela atual</strong><p id="orbitContextText"></p><button type="button" id="orbitContextAction">Ver detalhes</button></div></section><section class="orbit-quick-section" aria-labelledby="orbitQuickTitle"><div class="orbit-section-label"><strong id="orbitQuickTitle">Ações rápidas</strong><span>Escolha uma ação</span></div><div class="orbit-quick-actions"><button type="button" data-orbit-command="search"><i>⌕</i><span><strong>Buscar no CRM</strong><small>Clientes, leads e atividades</small></span></button><button type="button" data-orbit-command="deal"><i>↗</i><span><strong>Nova oportunidade</strong><small>Adicionar ao funil</small></span></button><button type="button" data-orbit-command="client"><i>+</i><span><strong>Novo cliente</strong><small>Criar relacionamento</small></span></button><button type="button" data-orbit-command="activity"><i>✓</i><span><strong>Nova atividade</strong><small>Agendar próximo passo</small></span></button><button type="button" data-orbit-command="organize"><i>✦</i><span><strong>Cole e organize</strong><small>Transformar conversa em rascunho</small></span></button><button type="button" data-orbit-command="today"><i>◎</i><span><strong>Ver meu dia</strong><small>Abrir prioridades de hoje</small></span></button></div></section><div class="orbit-section-label orbit-priority-label"><strong>O Orbit recomenda</strong><span>Calculado com seus dados</span></div><div id="orbitAttentionList" class="orbit-attention-list"></div><footer>As recomendações são calculadas localmente com os dados do seu CRM.</footer></aside>');
  const trigger=$('#orbitAttentionTrigger');
  const positionKey='niviontech_orbit_position';
  const margin=14;
  let drag=null;
  let suppressClick=false;
  const clamp=(value,min,max)=>Math.min(Math.max(value,min),Math.max(min,max));
  const place=(left,top,animate=false)=>{
    const rect=trigger.getBoundingClientRect();
    trigger.classList.toggle('orbit-is-snapping',animate);
    trigger.style.left=clamp(left,margin,window.innerWidth-rect.width-margin)+'px';
    trigger.style.top=clamp(top,margin,window.innerHeight-rect.height-margin)+'px';
    trigger.style.right='auto';
    trigger.style.bottom='auto';
  };
  const restorePosition=()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(positionKey)||'null');
      if(saved&&Number.isFinite(saved.left)&&Number.isFinite(saved.top))place(saved.left,saved.top);
    }catch(error){localStorage.removeItem(positionKey)}
  };
  const saveAndSnap=()=>{
    const rect=trigger.getBoundingClientRect();
    const left=rect.left+rect.width/2<window.innerWidth/2?margin:window.innerWidth-rect.width-margin;
    const top=clamp(rect.top,margin,window.innerHeight-rect.height-margin);
    place(left,top,true);
    localStorage.setItem(positionKey,JSON.stringify({left,top}));
    setTimeout(()=>trigger.classList.remove('orbit-is-snapping'),260);
  };
  trigger.addEventListener('pointerdown',event=>{
    if(event.button!==undefined&&event.button!==0)return;
    event.preventDefault();
    const rect=trigger.getBoundingClientRect();
    drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,moved:false};
    trigger.setPointerCapture?.(event.pointerId);
    trigger.classList.add('orbit-is-dragging');
  });
  trigger.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>5)drag.moved=true;
    if(!drag.moved)return;
    event.preventDefault();
    place(event.clientX-drag.offsetX,event.clientY-drag.offsetY);
  });
  const finishDrag=event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    const moved=drag.moved;
    drag=null;
    trigger.classList.remove('orbit-is-dragging');
    if(moved){suppressClick=true;saveAndSnap();setTimeout(()=>suppressClick=false,80)}
  };
  trigger.addEventListener('pointerup',finishDrag);
  trigger.addEventListener('pointercancel',finishDrag);
  trigger.addEventListener('click',()=>{if(!suppressClick)openOrbitAttention()});
  const openExistingAction=(view,selectors=[])=>{
    closeOrbitAttention();
    showView(view);
    requestAnimationFrame(()=>{
      const action=selectors.map(selector=>document.querySelector(selector)).find(Boolean);
      action?.click();
    });
  };
  const runOrbitCommand=command=>{
    if(command==='search'){
      closeOrbitAttention();
      if(typeof openGlobalSearch==='function')openGlobalSearch();else $('#globalSearchTrigger')?.click();
      return;
    }
    if(command==='deal'){openExistingAction('pipeline',['#newDeal','#addDeal','[data-new-deal]']);return}
    if(command==='client'){openExistingAction('clients',['#newClient','#addClient','[data-new-client]']);return}
    if(command==='activity'){openExistingAction('activities',['#newActivity','#addActivity','[data-new-activity]']);return}
    if(command==='organize'){openExistingAction('organize');return}
    if(command==='today')openExistingAction('today');
  };
  document.querySelectorAll('[data-orbit-command]').forEach(button=>button.addEventListener('click',()=>runOrbitCommand(button.dataset.orbitCommand)));
  $('#orbitContextAction').addEventListener('click',event=>openExistingAction(event.currentTarget.dataset.contextView||'today'));
  window.addEventListener('resize',()=>{
    const rect=trigger.getBoundingClientRect();
    if(rect.left<margin||rect.top<margin||rect.right>window.innerWidth-margin||rect.bottom>window.innerHeight-margin)saveAndSnap();
  });
  restorePosition();
  $('#closeOrbitAttention').addEventListener('click',closeOrbitAttention);
  $('#orbitAttentionBackdrop').addEventListener('click',closeOrbitAttention);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeOrbitAttention()});
  const appScreen=$('#appScreen');
  if(appScreen)new MutationObserver(refreshOrbitAttention).observe(appScreen,{attributes:true,attributeFilter:['class']});
  refreshOrbitAttention();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installOrbitAttention);else installOrbitAttention();

function installSupportContact(){
  const footer=document.querySelector('.sidebar-footer');
  if(!footer||$('#crmSupportContact'))return;
  footer.insertAdjacentHTML('afterbegin','<a id="crmSupportContact" class="crm-support-contact" href="mailto:crm@niviontech.com.br?subject=Suporte%20NivionTech%20CRM" title="Enviar e-mail para crm@niviontech.com.br"><i>?</i><span><strong>Suporte</strong><small>crm@niviontech.com.br</small></span></a>');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSupportContact);else installSupportContact();
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

function installLovableTopbar(){
  const search=$('#topbarSearch'),orbit=$('#topbarOrbit'),count=$('#topbarOrbitCount');
  if(search&&!search.dataset.ready){search.dataset.ready='1';search.addEventListener('click',()=>openGlobalSearch())}
  const syncCount=()=>{const source=$('#orbitAttentionCount');if(count){const value=Number(source?.textContent||0);count.textContent=String(value);count.hidden=value===0}};
  if(orbit&&!orbit.dataset.ready){orbit.dataset.ready='1';orbit.addEventListener('click',()=>{syncCount();openOrbitAttention()})}
  syncCount();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installLovableTopbar);else installLovableTopbar();
