import assert from 'node:assert/strict';
import {applyLostDealRules,applyWonDealRules,commercialPipelineStages,findStaleDeals,stageChecklistForDeal,validateNegotiation} from '../modules/pipeline.js';
import {todayISO} from '../modules/activities.js';
import {applyReceiptRules} from '../modules/receipts.js';
import {calculateProposalTotals,markProposalViewed,acceptProposal} from '../modules/proposals.js';
import {clientRelationshipCompleteness,validateClientRegistration} from '../modules/clients.js';
import {analyzeConversationText,createHandoffSummary} from '../modules/organize.js';
import {analyzeCommercialConversation} from '../modules/orbit-intelligence.js';
import {buildManagementForecast} from '../modules/management-intelligence.js';
import {buildCadencePlan,cadenceProgress} from '../modules/cadences.js';
import {buildCustomerSuccessPortfolio} from '../modules/customer-success.js';
import {analyzeBuyingCommittee} from '../modules/buying-committee.js';
import {buildMeetingPreparation} from '../modules/meeting-preparation.js';
import {buildNextBestActions} from '../modules/next-best-action.js';
import {parseIcs,parseEml,matchClientForChannel,filterNewChannelRecords} from '../modules/channel-imports.js';
import {collectSyncStorage,replaceSyncStorage,resolveStartupSync,snapshotFingerprint} from '../modules/sync.js';
import {migrateClerkIdentity,withoutLocalCredentials} from '../public/crm/modules/auth.js';
import {INTRO_TIMINGS,callOnce,markBrandIntroPlayed,rescaleParticles,resolveDpr,resolveLogoScale,shouldPlayBrandIntro} from '../modules/brand-intro-core.js';

const tests=[];
function test(name,run){tests.push({name,run})}

test('Fase 5: agenda ICS vira compromisso reconhecível',()=>{
  const [event]=parseIcs(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:meeting-42\nDTSTART:20260828T143000\nDTEND:20260828T153000\nSUMMARY:Diagnóstico comercial\nDESCRIPTION:Revisar cenário e próximos passos\nATTENDEE;CN=Almeida Engenharia:mailto:contato@almeida.com.br\nEND:VEVENT\nEND:VCALENDAR`);
  assert.equal(event.sourceUid,'meeting-42');
  assert.equal(event.date,'2026-08-28');
  assert.equal(event.time,'14:30');
  assert.equal(event.attendees[0].email,'contato@almeida.com.br');
});

test('Fase 5: e-mail EML preserva remetente, assunto e mensagem',()=>{
  const email=parseEml(`From: Joana <joana@cafecerrado.com.br>\nTo: vendas@niviontech.com.br\nSubject: Aprovação da proposta\nMessage-ID: <abc-123@cafecerrado.com.br>\nDate: Thu, 27 Aug 2026 15:00:00 -0300\n\nPodemos seguir com a contratação.`);
  assert.equal(email.sourceUid,'abc-123@cafecerrado.com.br');
  assert.equal(email.from.email,'joana@cafecerrado.com.br');
  assert.equal(email.title,'Aprovação da proposta');
  assert.match(email.body,/seguir com a contratação/);
});

test('Fase 5: canal é vinculado ao cliente por e-mail ou domínio corporativo',()=>{
  const clients=[{id:'client-1',name:'Café do Cerrado',email:'vendas@cafecerrado.com.br'}];
  const exact=matchClientForChannel({from:{email:'vendas@cafecerrado.com.br'},to:[]},clients);
  const company=matchClientForChannel({from:{email:'joana@cafecerrado.com.br'},to:[]},clients);
  assert.equal(exact.client.id,'client-1');
  assert.equal(exact.confidence,'alta');
  assert.equal(company.client.id,'client-1');
  assert.equal(company.reason,'Domínio da empresa');
});

test('Fase 5: importação não repete identificadores já salvos',()=>{
  const fresh=filterNewChannelRecords([{sourceUid:'a'},{sourceUid:'b'},{sourceUid:'b'},{sourceUid:'c'}],['a']);
  assert.deepEqual(fresh.map(item=>item.sourceUid),['b','c']);
});

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

test('Fase 3: conversa vira diagnóstico, objeção e próximo passo',()=>{
  const result=analyzeCommercialConversation('Temos muito retrabalho em planilha. Achei o preço caro, mas gostei da proposta. Enviar contrato na sexta-feira. O diretor aprova.',{client:{name:'Empresa Sol'}});
  assert.ok(result.score>=60);
  assert.equal(result.risk,'Saudável');
  assert.ok(result.pains.includes('planilha'));
  assert.ok(result.objectionTypes.includes('price'));
  assert.match(result.next,/Enviar contrato/i);
  assert.match(result.objectionGuidance,/impacto financeiro/i);
  assert.match(result.followUp,/próximo passo/i);
});

test('Fase 3: diagnóstico aponta lacunas que o vendedor precisa descobrir',()=>{
  const result=analyzeCommercialConversation('Cliente pediu uma apresentação.',{});
  assert.ok(result.gaps.includes('Faixa de investimento'));
  assert.ok(result.gaps.includes('Quem decide'));
  assert.ok(result.score<50);
});

test('Nova Fase 1: conversa extrai decisor, concorrente, compromisso e evidências',()=>{
  const result=analyzeCommercialConversation('Temos retrabalho em planilha e o preço parece caro. A decisora é Marina Alves. Estamos comparando com Salesforce. Gostei da proposta. Enviar contrato na sexta-feira. O investimento é de R$ 18.500.',{client:{name:'Empresa Horizonte'}});
  assert.ok(result.decisionMakers.includes('Marina Alves'));
  assert.ok(result.competitors.includes('Salesforce'));
  assert.ok(result.commitments.some(item=>/Enviar contrato/i.test(item)));
  assert.ok(result.evidenceQuotes.some(item=>item.label==='Dor'));
  assert.ok(result.suggestedUpdates.some(item=>item.field==='Decisor'));
  assert.ok(result.suggestedUpdates.some(item=>item.field==='Concorrente'));
});

test('Nova Fase 2: preparação combina memória, comitê e pendências da conta',()=>{
  const deal={id:'d1',client:'Empresa Sol',title:'Implantação',value:18500,stage:'proposal',next:'Apresentar proposta',nextDate:'2026-08-30',pain:'Retrabalho',objection:'preço',budget:'R$ 18.500',orbitMemory:{summary:'Cliente quer reduzir retrabalho.',commitments:['Enviar estudo de implantação']}};
  const client={name:'Empresa Sol',goal:'Ganhar previsibilidade',decisionMaker:'Marina Alves',stakeholders:[{name:'Marina Alves',role:'decision',influence:'high',sentiment:'neutral'},{name:'Paulo',role:'champion',influence:'medium',sentiment:'support'}]};
  const activities=[{client:'Empresa Sol',title:'Enviar proposta revisada',date:'2026-08-29',time:'10:00',done:false},{client:'Outra empresa',title:'Ignorar',date:'2026-08-28',done:false}];
  const result=buildMeetingPreparation({deal,client,activities,meetingType:'proposal',stageLabel:'Proposta'});
  assert.equal(result.stageLabel,'Proposta');
  assert.equal(result.people.length,2);
  assert.equal(result.pending.length,1);
  assert.match(result.objective,/investimento/i);
  assert.match(result.desiredCommitment,/aprovação/i);
  assert.ok(result.questions.some(item=>/preocupação com preço/i.test(item)));
  assert.ok(result.readiness>=80);
});

test('Nova Fase 2: preparação expõe lacunas antes da reunião',()=>{
  const result=buildMeetingPreparation({deal:{client:'Empresa Nova'},client:{name:'Empresa Nova'},meetingType:'diagnosis'});
  assert.ok(result.risks.some(item=>/Decisor/i.test(item)));
  assert.ok(result.questions.some(item=>/quem participa/i.test(item)));
  assert.ok(result.readiness<60);
});

test('Nova Fase 3: compromisso vencido tem prioridade e já vem executável',()=>{
  const now=new Date(2026,7,27,12),deals=[{id:'d1',client:'Empresa Sol',title:'Implantação',value:18000,stage:'proposal',next:'Apresentar proposta',nextDate:'2026-08-30',status:'open'}],activities=[{id:'a1',client:'Empresa Sol',title:'Retornar para Marina',date:'2026-08-25',time:'10:00',done:false}];
  const result=buildNextBestActions({deals,activities,stages:[{id:'new'},{id:'proposal'}],now});
  assert.equal(result[0].type,'overdue');
  assert.equal(result[0].suggestedDate,'2026-08-27');
  assert.match(result[0].message,/Empresa/i);
  assert.equal(result[0].activityId,'a1');
});

test('Nova Fase 3: proposta sem retorno gera mensagem e orientação de etapa',()=>{
  const now=new Date(2026,7,27,12),deals=[{id:'d1',client:'Café do Cerrado',title:'Plano anual',value:22000,stage:'proposal',next:'Aguardar decisão',nextDate:'2026-08-30',status:'open',createdAt:'2026-08-20T12:00:00'}],clients=[{name:'Café do Cerrado',interactions:[{date:'2026-08-26T12:00:00'}]}],proposals=[{dealId:'d1',status:'sent',createdAt:'2026-08-20T12:00:00'}];
  const result=buildNextBestActions({deals,clients,proposals,stages:[{id:'new'},{id:'proposal'},{id:'closing'}],now});
  assert.equal(result[0].type,'proposal');
  assert.match(result[0].message,/revisar a proposta/i);
  assert.match(result[0].stageSuggestion,/negociação/i);
});

test('Nova Fase 4: proposta calcula itens, desconto e valor final',()=>{
  const result=calculateProposalTotals([{description:'Implantação',quantity:1,unitPrice:10000},{description:'Licenças',quantity:5,unitPrice:1000}],10);
  assert.equal(result.subtotal,15000);
  assert.equal(result.discountValue,1500);
  assert.equal(result.total,13500);
  assert.equal(result.items.length,2);
});

test('Nova Fase 4: visualização e aceite preservam rastreabilidade da versão',()=>{
  const proposal={id:'p1',status:'sent',version:2};
  markProposalViewed(proposal,new Date('2026-08-27T14:00:00Z'));
  assert.equal(proposal.status,'viewed');
  assert.equal(proposal.viewCount,1);
  const result=acceptProposal(proposal,{name:'Marina Alves',email:'marina@empresa.com',now:new Date('2026-08-27T15:00:00Z')});
  assert.equal(result.valid,true);
  assert.equal(proposal.status,'approved');
  assert.equal(proposal.acceptance.version,2);
  assert.equal(proposal.acceptance.name,'Marina Alves');
});

test('Nova Fase 4: aceite sem responsável é bloqueado',()=>{
  const proposal={status:'viewed',version:1};
  const result=acceptProposal(proposal,{name:'   '});
  assert.equal(result.valid,false);
  assert.equal(proposal.status,'viewed');
});

test('Fase 4: previsão considera etapa, qualificação e risco',()=>{
  const stages=[{id:'new'},{id:'proposal'},{id:'closing'},{id:'won'},{id:'lost'}];
  const healthy={id:'1',client:'A',stage:'closing',value:10000,next:'Enviar contrato',nextDate:'2026-08-30',orbitMemory:{qualificationScore:90,risk:'Saudável'}};
  const risky={id:'2',client:'B',stage:'closing',value:10000,orbitMemory:{qualificationScore:90,risk:'Atenção'}};
  const result=buildManagementForecast([healthy,risky],stages,20000);
  assert.equal(result.topDeals[0].deal.id,'1');
  assert.ok(result.topDeals[0].weighted>result.topDeals[1].weighted);
  assert.equal(result.riskValue,10000);
  assert.ok(result.coverage>0);
});

test('Fase 4: inteligência alerta concentração excessiva da carteira',()=>{
  const stages=[{id:'new'},{id:'closing'}],deals=[{id:'1',client:'Empresa A',stage:'new',value:9000,next:'Ligar',nextDate:'2026-08-30'},{id:'2',client:'Empresa B',stage:'new',value:1000,next:'Ligar',nextDate:'2026-08-30'}];
  const result=buildManagementForecast(deals,stages,0);
  assert.equal(result.concentration,90);
  assert.ok(result.recommendations.some(item=>item.includes('concentrado')));
});

test('Fase 5: cadência cria uma sequência comercial com datas futuras',()=>{
  const cadence=buildCadencePlan({templateId:'proposal',startDate:'2026-08-27',client:'Empresa Sol',dealId:'deal-1',owner:'Ana'});
  assert.equal(cadence.steps.length,3);
  assert.equal(cadence.steps[0].date,'2026-08-28');
  assert.equal(cadence.steps[2].date,'2026-09-02');
  assert.equal(cadence.client,'Empresa Sol');
});

test('Fase 5: progresso identifica próxima ação e conclusão da cadência',()=>{
  const cadence={id:'cadence-1',steps:[{id:'step-1'},{id:'step-2'}]},activities=[{id:'a1',cadenceId:'cadence-1',title:'Ligar',date:'2026-08-28',time:'09:00',done:true},{id:'a2',cadenceId:'cadence-1',title:'Enviar proposta',date:'2026-08-29',time:'09:00',done:false}];
  const progress=cadenceProgress(cadence,activities);
  assert.equal(progress.percent,50);
  assert.equal(progress.next.title,'Enviar proposta');
  assert.equal(progress.complete,false);
  assert.equal(cadenceProgress(cadence,activities.map(item=>({...item,done:true}))).complete,true);
});

test('Fase 6: carteira identifica risco de retenção e receita protegida',()=>{
  const clients=[{id:'c1',name:'Empresa A',status:'Cliente',renewalDate:'2026-09-10',orbitMemory:{risk:'Atenção'}},{id:'c2',name:'Empresa B',status:'Cliente'}],deals=[{client:'Empresa A',status:'won',value:10000,paymentStatus:'pending'},{client:'Empresa B',status:'won',value:5000,paymentStatus:'received'}],activities=[{client:'Empresa B',title:'Revisar resultado',date:'2026-09-01',time:'09:00',done:false}];
  const result=buildCustomerSuccessPortfolio(clients,deals,activities,new Date('2026-08-27T12:00:00'));
  assert.equal(result.totalRevenue,15000);
  assert.equal(result.atRisk,1);
  assert.equal(result.renewals,1);
  assert.equal(result.accounts.find(item=>item.client.id==='c1').tone,'risk');
});

test('Fase 6: cliente saudável e recebido gera sinal de expansão',()=>{
  const result=buildCustomerSuccessPortfolio([{id:'c1',name:'Empresa A',status:'Cliente'}],[{client:'Empresa A',status:'won',value:10000,paymentStatus:'received'}],[{client:'Empresa A',title:'Revisão',date:'2026-09-01',time:'09:00',done:false}],new Date('2026-08-27T12:00:00'));
  assert.equal(result.expansion,1);
  assert.equal(result.accounts[0].score,100);
  assert.equal(result.accounts[0].expansion,true);
});

test('Fase 7: comitê completo mostra cobertura comercial total',()=>{
  const result=analyzeBuyingCommittee([{name:'Ana',role:'decision',influence:'high',sentiment:'support'},{name:'Carlos',role:'champion',influence:'high',sentiment:'support'},{name:'Paula',role:'user',influence:'medium',sentiment:'neutral'}]);
  assert.equal(result.coverage,100);
  assert.equal(result.risk,'healthy');
  assert.equal(result.supporters,2);
  assert.equal(result.missing.length,0);
});

test('Fase 7: decisor resistente sinaliza risco político alto',()=>{
  const result=analyzeBuyingCommittee([{name:'Diretor',role:'decision',influence:'high',sentiment:'resist'}]);
  assert.equal(result.risk,'high');
  assert.ok(result.missing.includes('champion'));
  assert.ok(result.recommendations.some(item=>item.includes('Diretor')));
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
