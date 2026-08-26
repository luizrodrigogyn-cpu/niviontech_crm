import assert from 'node:assert/strict';
import {applyLostDealRules,applyWonDealRules,commercialPipelineStages,findStaleDeals,validateNegotiation} from '../modules/pipeline.js';
import {todayISO} from '../modules/activities.js';
import {applyReceiptRules} from '../modules/receipts.js';
import {validateClientRegistration} from '../modules/clients.js';
import {analyzeConversationText,createHandoffSummary} from '../modules/organize.js';
import {collectSyncStorage,replaceSyncStorage,resolveStartupSync,snapshotFingerprint} from '../modules/sync.js';

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

test('sincronização baixa a nuvem apenas quando a cópia local está limpa',()=>{
  const local={niviontech_owner:'local'},cloud={payload:{niviontech_owner:'cloud'},revision:2};
  const cleanMeta={revision:1,fingerprint:snapshotFingerprint(local)};
  assert.equal(resolveStartupSync({localSnapshot:local,cloudSnapshot:cloud,meta:cleanMeta}).action,'download');
  const changed={...local,niviontech_clients:'[]'};
  assert.equal(resolveStartupSync({localSnapshot:changed,cloudSnapshot:cloud,meta:cleanMeta}).action,'conflict');
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
