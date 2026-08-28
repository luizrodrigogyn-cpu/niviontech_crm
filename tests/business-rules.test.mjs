import assert from 'node:assert/strict';
import {applyLostDealRules,applyWonDealRules,commercialPipelineStages,findStaleDeals,stageChecklistForDeal,validateNegotiation} from '../modules/pipeline.js';
import {todayISO} from '../modules/activities.js';
import {applyReceiptRules} from '../modules/receipts.js';
import {clientRelationshipCompleteness,validateClientRegistration} from '../modules/clients.js';
import {analyzeConversationText,createHandoffSummary} from '../modules/organize.js';
import {collectSyncStorage,replaceSyncStorage,resolveStartupSync,snapshotFingerprint} from '../modules/sync.js';
import {migrateClerkIdentity,withoutLocalCredentials} from '../public/crm/modules/auth.js';
import {INTRO_TIMINGS,callOnce,markBrandIntroPlayed,rescaleParticles,resolveDpr,resolveLogoScale,shouldPlayBrandIntro} from '../modules/brand-intro-core.js';

const tests=[];
function test(name,run){tests.push({name,run})}

test('RB-01: negociação ativa exige próxima ação e data',()=>{
  const missingAction=validateNegotiation({next:'',nextDate:'2026-08-26'});
  const missingDate=validateNegotiation({next:'Ligar para o cliente',nextDate:''});
  const complete=validateNegotiation({next:'Ligar para o cliente',nextDate:'2026-08-26'});

  assert.equal(missingAction.valid,false);
  assert.equal(missingDate.valid,false);
  assert.equal(missingAction.message,'Toda negociação ativa precisa de próxima ação e data.');
  assert.equal(complete.valid,true);
  assert.equal(complete.message,'');
});

test('Fase 1: checklist cresce conforme a negociação avança',()=>{
  const stages=[{id:'new'},{id:'qualified'},{id:'proposal'},{id:'closing'},{id:'won'}];
  const early=stageChecklistForDeal({stage:'new',next:'Ligar',nextDate:'2026-08-28',owner:'Ana'},stages);
  const closing=stageChecklistForDeal({stage:'closing',next:'Ligar',nextDate:'2026-08-28',owner:'Ana',pain:'Retrabalho',decisionMaker:'Carlos',budget:'R$ 20 mil',objection:'Prazo'},stages);
  assert.equal(early.total,3);
  assert.equal(early.ready,true);
  assert.equal(closing.total,7);
  assert.equal(closing.percent,100);
});

test('RB-04: venda ganha não significa pagamento recebido',()=>{
  const deal=applyWonDealRules({id:'deal-test',value:5000});

  assert.equal(deal.status,'won');
  assert.equal(deal.paymentStatus,'pending');
  assert.equal(deal.receivedAmount,undefined);
});

test('RB-04: recebimento só é confirmado pela regra financeira',()=>{
  const deal=applyWonDealRules({id:'deal-test',value:5000});
  applyReceiptRules(deal,{received:5000,dueDate:'2026-08-30',status:'received'});

  assert.equal(deal.status,'won');
  assert.equal(deal.paymentStatus,'received');
  assert.equal(deal.receivedAmount,5000);
});

test('etapas de resultado não alteram a progressão comercial',()=>{
  const stages=[{id:'new'},{id:'proposal'},{id:'won'},{id:'after-sales'},{id:'lost'}];
  assert.deepEqual(commercialPipelineStages(stages).map(stage=>stage.id),['new','proposal']);
});

test('perda sincroniza status, etapa e data',()=>{
  const deal=applyLostDealRules({id:'deal-lost',status:'open',stage:'proposal'},new Date('2026-08-25T15:00:00Z'));
  assert.equal(deal.status,'lost');
  assert.equal(deal.stage,'lost');
  assert.equal(deal.lostAt,'2026-08-25T15:00:00.000Z');
});

test('venda ganha pode seguir diretamente para o pós-venda',()=>{
  const deal=applyWonDealRules({id:'deal-after-sales',value:5000},'after-sales');
  assert.equal(deal.status,'won');
  assert.equal(deal.stage,'after-sales');
  assert.equal(deal.paymentStatus,'pending');
});

test('data do sistema usa o calendário local, não UTC',()=>{
  assert.equal(todayISO(new Date(2026,7,25,23,30)),'2026-08-25');
});

test('RB-03: cadastro idêntico aciona aviso de duplicidade',()=>{
  const clients=[{id:'client-1',name:'Almeida Engenharia',phone:'(62) 99999-1234',email:'contato@almeida.com.br'}];
  const result=validateClientRegistration({name:'ALMEIDA ENGENHARIA',phone:'',email:''},clients);

  assert.equal(result.valid,false);
  assert.equal(result.duplicate.client.id,'client-1');
  assert.ok(result.duplicate.signals.includes('mesmo nome'));
});

test('RB-03: telefone e e-mail também identificam cliente existente',()=>{
  const clients=[{id:'client-1',name:'Almeida Engenharia',phone:'(62) 99999-1234',email:'contato@almeida.com.br'}];
  const result=validateClientRegistration({name:'Almeida Eng.',phone:'62 99999-1234',email:'CONTATO@ALMEIDA.COM.BR'},clients);

  assert.equal(result.valid,false);
  assert.ok(result.duplicate.signals.includes('mesmo telefone'));
  assert.ok(result.duplicate.signals.includes('mesmo e-mail'));
});

test('Fase 2: mapa de relacionamento mostra avanço e lacunas do Cliente 360°',()=>{
  const partial=clientRelationshipCompleteness({mainContact:'Paula, Compras',decisionMaker:'Carlos',icpFit:'high'});
  const complete=clientRelationshipCompleteness({mainContact:'Paula',decisionMaker:'Carlos',accountOwner:'Ana',icpFit:'high',goal:'Reduzir retrabalho'});
  assert.equal(partial.done,3);
  assert.equal(partial.percent,60);
  assert.deepEqual(partial.items.filter(item=>!item.done).map(item=>item.label),['Responsável pela conta','Objetivo do cliente']);
  assert.equal(complete.percent,100);
});

test('Orbit prioriza o sujeito completo no Cole e organize',()=>{
  const text='João da Empresa Sol pediu orçamento de R$ 8.500 para instalação. Retornar sexta-feira às 10h. Telefone (62) 99999-1234.';
  const result=analyzeConversationText(text,{now:new Date('2026-08-25T12:00:00')});

  assert.equal(result.draft.client,'João da Empresa Sol');
  assert.equal(result.draft.value,8500);
  assert.equal(result.draft.phone,'(62) 99999-1234');
  assert.equal(result.draft.time,'10:00');
});

test('negociação sem interação volta como pendência ativa',()=>{
  const now=new Date('2026-08-25T12:00:00'),deals=[{id:'deal-1',client:'Empresa Sol',status:'open',createdAt:'2026-08-10T12:00:00'}];
  const result=findStaleDeals(deals,[],7,now);

  assert.equal(result.length,1);
  assert.equal(result[0].deal.id,'deal-1');
  assert.equal(result[0].inactiveDays,15);
});

test('passagem de bastão inclui contexto, responsáveis e próximo passo',()=>{
  const summary=createHandoffSummary({client:'Empresa Sol',title:'Implantação',value:8500,stage:'proposal',next:'Enviar proposta',nextDate:'2026-08-28',history:[]},{interactions:[]},{now:new Date('2026-08-25T12:00:00'),stageLabel:'Proposta',fromOwner:'Ana',toOwner:'Carlos'});

  assert.match(summary.text,/Ana passou para Carlos/);
  assert.match(summary.text,/Enviar proposta/);
  assert.match(summary.text,/Empresa Sol/);
});

function memoryStorage(initial={}){
  const values=new Map(Object.entries(initial));
  return{get length(){return values.size},key:index=>[...values.keys()][index]??null,getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),dump:()=>Object.fromEntries(values)};
}

test('sincronização envia somente dados do NivionTech e preserva preferências locais',()=>{
  const storage=memoryStorage({niviontech_owner:'{"id":"owner"}',niviontech_device_id:'device-1',niviontech_sync_meta:'{}',theme:'dark'});
  assert.deepEqual(collectSyncStorage(storage),{niviontech_owner:'{"id":"owner"}'});
  replaceSyncStorage(storage,{niviontech_company:'{"name":"NivionTech"}'});
  assert.equal(storage.getItem('niviontech_owner'),null);
  assert.equal(storage.getItem('niviontech_device_id'),'device-1');
  assert.equal(storage.getItem('theme'),'dark');
});

test('migração Clerk preserva proprietário e remove credenciais locais',()=>{
  const storage=memoryStorage({niviontech_owner:JSON.stringify({id:'owner',name:'Rodrigo',email:'antigo@example.com',passwordHash:'segredo',salt:'sal'}),niviontech_company:'{"name":"NivionTech"}',niviontech_users:JSON.stringify([{id:'owner',password:'123456',passwordHash:'hash'}])});
  const session=memoryStorage();
  const owner=migrateClerkIdentity(storage,session,{userId:'user_clerk',orgId:'org_1',name:'Rodrigo Melo',email:'rodrigo@example.com',profile:'Proprietário/Admin'});
  assert.equal(owner.clerkUserId,'user_clerk');
  assert.equal(owner.passwordHash,undefined);
  assert.equal(owner.salt,undefined);
  assert.equal(JSON.parse(storage.getItem('niviontech_users'))[0].password,undefined);
  assert.equal(session.getItem('niviontech_session'),'owner');
});

test('snapshot nunca envia senha ou hash legado',()=>{
  const storage=memoryStorage({niviontech_owner:JSON.stringify({email:'r@example.com',passwordHash:'hash',salt:'salt'}),niviontech_users:JSON.stringify([{email:'r@example.com',password:'123456'}])});
  const snapshot=collectSyncStorage(storage);
  assert.equal(JSON.parse(snapshot.niviontech_owner).passwordHash,undefined);
  assert.equal(JSON.parse(snapshot.niviontech_users)[0].password,undefined);
  assert.deepEqual(withoutLocalCredentials({name:'R',passwordHash:'x',salt:'y'}),{name:'R'});
});

test('sincronização baixa a nuvem apenas quando a cópia local está limpa',()=>{
  const local={niviontech_owner:'local'},cloud={payload:{niviontech_owner:'cloud'},revision:2};
  const cleanMeta={revision:1,fingerprint:snapshotFingerprint(local)};
  assert.equal(resolveStartupSync({localSnapshot:local,cloudSnapshot:cloud,meta:cleanMeta}).action,'download');
  const changed={...local,niviontech_clients:'[]'};
  assert.equal(resolveStartupSync({localSnapshot:changed,cloudSnapshot:cloud,meta:cleanMeta}).action,'conflict');
});

function fakeStorage(){
  const data=new Map();
  return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
}

test('abertura: toca apenas uma vez por sessão de aba',()=>{
  const storage=fakeStorage();
  assert.equal(shouldPlayBrandIntro(storage),true);
  markBrandIntroPlayed(storage);
  assert.equal(shouldPlayBrandIntro(storage),false);
});

test('abertura: nunca lança erro mesmo com sessionStorage indisponível',()=>{
  const brokenStorage={getItem(){throw new Error('bloqueado')},setItem(){throw new Error('bloqueado')}};
  assert.doesNotThrow(()=>markBrandIntroPlayed(brokenStorage));
  assert.equal(shouldPlayBrandIntro(brokenStorage),true);
});

test('abertura: duração total fica próxima de 2 segundos, como pedido no feedback',()=>{
  const total=INTRO_TIMINGS.driftMs+INTRO_TIMINGS.convergeMs+INTRO_TIMINGS.solidifyMs+INTRO_TIMINGS.fadeMs;
  assert.ok(total<=2100,`duração total (${total}ms) deveria ficar em torno de 2000ms`);
  assert.ok(total>=1500,`duração total (${total}ms) não pode ficar curta demais a ponto de parecer um corte seco`);
});

test('abertura: callOnce garante que onDone nunca dispare mais de uma vez',()=>{
  let calls=0;
  const done=callOnce(()=>{calls++});
  done();done();done();
  assert.equal(calls,1);
});

test('abertura: símbolo fica maior no celular do que no desktop',()=>{
  const mobile=resolveLogoScale(390,844);
  const desktop=resolveLogoScale(1440,900);
  assert.ok(mobile>desktop,'a escala do símbolo no celular deveria ser maior que no desktop');
});

test('abertura: símbolo no desktop ficou ~10% maior, como pedido no segundo feedback',()=>{
  const desktop=resolveLogoScale(1440,900);
  assert.ok(desktop>=.32&&desktop<=.34,`escala do desktop (${desktop}) deveria ficar em torno de 10% acima da versão anterior (0.3)`);
});

test('abertura: densidade de pixel tem teto para não sobrecarregar telas muito grandes',()=>{
  const small=resolveDpr(390,844,3);
  assert.equal(small,3);
  const huge=resolveDpr(3840,2160,3);
  assert.ok(huge<3,'em telas 4K a densidade deveria ser reduzida automaticamente');
  assert.ok(huge>=1);
});

test('abertura: rotação/redimensionamento reposiciona partículas e alvos proporcionalmente',()=>{
  const particles=[{x:100,y:200,startX:50,startY:80,tx:300,ty:400}];
  // Sem novos alvos amostrados (caso comum em Node, sem DOM): usa a mesma proporção como fallback.
  rescaleParticles(particles,2,.5,[]);
  assert.equal(particles[0].x,200);
  assert.equal(particles[0].y,100);
  assert.equal(particles[0].startX,100);
  assert.equal(particles[0].startY,40);
  assert.equal(particles[0].tx,600);
  assert.equal(particles[0].ty,200);
});

test('abertura: quando há novos alvos do glifo, eles substituem os alvos antigos (não só reescalam)',()=>{
  const particles=[{x:10,y:10,startX:10,startY:10,tx:999,ty:999}];
  rescaleParticles(particles,1,1,[{x:42,y:77}]);
  assert.equal(particles[0].tx,42);
  assert.equal(particles[0].ty,77);
});

let failures=0;
for(const {name,run} of tests){
  try{
    run();
    console.log('PASS',name);
  }catch(error){
    failures++;
    console.error('FAIL',name);
    console.error(error);
  }
}

if(failures){
  console.error(`\n${failures} teste(s) falharam.`);
  process.exitCode=1;
}else{
  console.log(`\n${tests.length} testes passaram.`);
}
