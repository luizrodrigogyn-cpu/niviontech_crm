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
import {buildForecastGovernance,createForecastSnapshot,compareForecastSnapshots} from '../modules/forecast-governance.js';
import {createPlaybookFromIcp,evaluateDealAgainstPlaybook,playbookAdoption} from '../modules/playbooks.js';
import {createMutualActionPlan,mutualPlanProgress,toggleMutualMilestone,mutualPlanPlainText} from '../modules/mutual-action-plans.js';
import {buildDealScorecard,runAutomationRules,buildCoachingBrief,buildRevenueCockpit,buildIcpRadar,buildBuyingInfluenceMap,buildConversationIntelligence,buildRevenueLeakMap,buildGrowthMissions} from '../modules/growth-os.js';
import {buildCommercialTruth,buildFunnelVelocity,buildDailyCommand} from '../modules/commercial-evolution.js';
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

test('Nova Fase 6: forecast separa compromisso, melhor caso e pipeline',()=>{
  const stages=[{id:'new'},{id:'proposal'},{id:'closing'},{id:'won'}],deals=[{id:'1',stage:'closing',value:10000,next:'Assinar',nextDate:'2026-08-30',decisionMaker:'Ana'},{id:'2',stage:'proposal',value:5000,next:'Revisar proposta'},{id:'3',stage:'new',value:2000}];
  const forecast=buildForecastGovernance(deals,stages);
  assert.equal(forecast.totals.commit,10000);
  assert.equal(forecast.totals.best,5000);
  assert.equal(forecast.totals.pipeline,2000);
  assert.equal(forecast.weighted,13850);
});

test('Nova Fase 6: compromisso incompleto é exposto como risco',()=>{
  const forecast=buildForecastGovernance([{id:'1',stage:'closing',value:9000,forecastCategory:'commit'}],[{id:'closing'}]);
  assert.equal(forecast.atRisk.length,1);
  assert.deepEqual(forecast.records[0].missing,['próxima ação','data','decisor']);
});

test('Nova Fase 6: fotografias mostram a evolução da previsão',()=>{
  const previous=createForecastSnapshot({weighted:10000,quality:60,totals:{},records:[1]},new Date('2026-08-20T12:00:00Z')),current=createForecastSnapshot({weighted:12500,quality:80,totals:{},records:[1,2]},new Date('2026-08-27T12:00:00Z')),change=compareForecastSnapshots(current,previous);
  assert.equal(change.amount,2500);
  assert.equal(change.percent,25);
  assert.equal(change.direction,'up');
});

test('Nova Fase 7: DNA comercial gera playbook alinhado ao segmento',()=>{
  const playbook=createPlaybookFromIcp({stages:[{id:'lead',label:'Lead'},{id:'diagnosis',label:'Diagnóstico'},{id:'proposal',label:'Proposta'},{id:'won',label:'Ganhou'}],icp:{segments:'Clínicas, Consultórios',pains:'Falta de previsibilidade',objections:'Preço',proofs:'Case com 30% de ganho'}});
  assert.equal(playbook.name,'Playbook Clínicas');
  assert.equal(playbook.stages.length,3);
  assert.match(playbook.stages[0].questions.at(-1),/falta de previsibilidade/i);
  assert.match(playbook.stages[0].objections[0].response,/30% de ganho/);
});

test('Nova Fase 7: prontidão expõe exatamente o que falta para avançar',()=>{
  const playbook=createPlaybookFromIcp({stages:[{id:'lead',label:'Lead'},{id:'diagnosis',label:'Diagnóstico'},{id:'proposal',label:'Proposta'},{id:'closing',label:'Fechamento'}]}),evaluation=evaluateDealAgainstPlaybook({stage:'diagnosis',owner:'Ana',next:'Apresentar',nextDate:'2026-09-01'},playbook);
  assert.equal(evaluation.ready,false);
  assert.ok(evaluation.missing.includes('dor principal'));
  assert.ok(evaluation.missing.includes('decisor'));
});

test('Nova Fase 7: adesão mede a qualidade do processo sem contar negócios encerrados',()=>{
  const playbook={stages:[{stageId:'lead',criteria:['owner','next'],questions:[],objections:[]}]},adoption=playbookAdoption([{stage:'lead',owner:'Ana',next:'Ligar'},{stage:'lead',owner:'Bia'},{stage:'lead',owner:'Caio',next:'Feito',status:'won'}],playbook);
  assert.equal(adoption.deals,2);
  assert.equal(adoption.ready,1);
  assert.equal(adoption.percent,75);
});

test('Fase 8: plano de fechamento organiza compromissos das duas partes',()=>{
  const plan=createMutualActionPlan({deal:{id:'deal-1',title:'Implantação',client:'Empresa Sol'},client:{id:'client-1'},startDate:'2026-08-27'});
  assert.equal(plan.milestones.length,6);
  assert.equal(plan.milestones[0].dueDate,'2026-08-29');
  assert.equal(plan.targetDate,'2026-09-13');
  assert.ok(plan.milestones.some(item=>item.owner==='client'));
});

test('Fase 8: progresso diferencia conclusão e atraso',()=>{
  const plan=createMutualActionPlan({deal:{id:'deal-1',title:'Implantação',client:'Empresa Sol'},startDate:'2026-08-01'});toggleMutualMilestone(plan,plan.milestones[0].id,new Date('2026-08-02T12:00:00Z'));const progress=mutualPlanProgress(plan,'2026-08-10');
  assert.equal(progress.done,1);
  assert.equal(progress.percent,17);
  assert.equal(progress.overdue,2);
  assert.equal(progress.next.title,'Confirmar decisores e processo de aprovação');
});

test('Fase 8: plano pode ser compartilhado em texto claro',()=>{
  const plan=createMutualActionPlan({deal:{id:'deal-1',title:'Implantação',client:'Empresa Sol'},startDate:'2026-08-27'}),text=mutualPlanPlainText(plan);
  assert.match(text,/PLANO DE FECHAMENTO · Empresa Sol/);
  assert.match(text,/Nossa equipe/);
  assert.match(text,/Cliente/);
});

test('Fase 9: Deal Score cresce com evidências reais de compra',()=>{
  const stages=[{id:'lead'},{id:'diagnosis'},{id:'closing'}],weak=buildDealScorecard({stage:'lead',value:10000},stages,'2026-08-27'),strong=buildDealScorecard({stage:'closing',value:10000,next:'Assinar',nextDate:'2026-08-30',pain:'Retrabalho',decisionMaker:'Ana',budget:'R$ 10 mil',successCriteria:'Prazo',orbitMemory:{commitments:['Enviar contrato']}},stages,'2026-08-27');
  assert.ok(strong.score>weak.score);
  assert.equal(strong.temperature,'hot');
  assert.ok(strong.signals.includes('Cliente assumiu compromisso'));
});

test('Fase 10: automações geram ações sem duplicar tarefas existentes',()=>{
  const input={deals:[{id:'d1',client:'Empresa A',stage:'lead',value:50000}],activities:[{id:'a1',title:'Ligar',client:'Empresa A',date:'2026-08-20',done:false}],enabledRules:['overdue-followup','high-value-risk'],stages:[{id:'lead'}],today:'2026-08-27'};
  const first=runAutomationRules(input);
  const second=runAutomationRules({...input,activities:[...input.activities,...first.map((item,index)=>({...item,id:`new-${index}`,done:false}))]});
  assert.equal(first.length,2);
  assert.equal(second.length,0);
});

test('Fase 11: briefing de coaching combina resultado, execução e foco',()=>{
  const brief=buildCoachingBrief({name:'Ana'},[{owner:'Ana',status:'open',value:12000},{owner:'Ana',status:'won',value:5000,wonAt:'2026-08-20'}],[{owner:'Ana',date:'2026-08-20',done:true,completedAt:'2026-08-20T12:00:00Z'}],'2026-08');
  assert.equal(brief.pipeline,12000);
  assert.equal(brief.sold,5000);
  assert.equal(brief.execution,100);
  assert.ok(brief.agenda.length>=4);
});

test('Fase 12: cockpit executivo transforma risco em prioridades',()=>{
  const cockpit=buildRevenueCockpit([{id:'d1',title:'Contrato anual',client:'Empresa A',stage:'closing',value:40000,nextDate:'2026-08-20',orbitMemory:{risk:'Atenção'}},{id:'d2',title:'Piloto',client:'Empresa B',stage:'lead',value:5000,next:'Reunião',nextDate:'2026-08-30'}],[{title:'Responder cliente',client:'Empresa A',date:'2026-08-20',done:false}],[{id:'lead'},{id:'closing'}],'2026-08-27');
  assert.equal(cockpit.pipeline,45000);
  assert.ok(cockpit.atRiskValue>=40000);
  assert.ok(cockpit.priorities.length>=2);
});

test('Fase 13: radar de ICP prioriza segmentos com receita validada',()=>{
  const radar=buildIcpRadar([{name:'A',segment:'Construção'},{name:'B',segment:'Serviços'}],[{client:'A',status:'won',value:30000},{client:'B',status:'open',value:2000}]);
  assert.equal(radar.best.segment,'Construção');
  assert.equal(radar.best.wins,1);
});

test('Fase 14: mapa de influência expõe papéis ausentes',()=>{
  const map=buildBuyingInfluenceMap([{id:'d1',client:'Empresa A',status:'open',value:50000,decisionMaker:'Ana'}],[{name:'Empresa A',stakeholders:[]}]);
  assert.equal(map.accounts[0].coverage,33);
  assert.ok(map.accounts[0].missing.includes('Compras, financeiro ou jurídico'));
  assert.equal(map.exposedValue,50000);
});

test('Fase 15: inteligência de conversa mede evidências comerciais',()=>{
  const result=buildConversationIntelligence([{id:'d1',status:'open',value:10000,next:'Enviar proposta',decisionMaker:'Ana',orbitMemory:{summary:'Cliente quer reduzir retrabalho',pains:['Retrabalho'],objections:['Prazo'],commitments:['Enviar dados']}}]);
  assert.equal(result.conversations[0].score,100);
  assert.equal(result.withoutMemory,0);
});

test('Fase 16: detector soma receita com vazamentos sem duplicar negócio',()=>{
  const map=buildRevenueLeakMap([{id:'d1',client:'Empresa A',status:'open',value:40000,nextDate:'2026-08-20'}],[{client:'Empresa A',title:'Responder',date:'2026-08-19',done:false}],'2026-08-27');
  assert.equal(map.leakingValue,40000);
  assert.ok(map.leaks.length>=2);
});

test('Fase 17: missões combinam riscos e influência em foco semanal',()=>{
  const brief=buildGrowthMissions({deals:[{id:'d1',title:'Contrato',client:'Empresa A',status:'open',value:50000}],clients:[{name:'Empresa A',segment:'Tecnologia'}],activities:[],today:'2026-08-27'});
  assert.ok(brief.missions.length>=2);
  assert.ok(brief.protectedValue>=50000);
  assert.ok(brief.readiness<100);
});

test('Fase 18: verdade comercial explica perdas e recuperação',()=>{
  const truth=buildCommercialTruth([{status:'won',value:20000,leadSource:'Indicação'},{status:'lost',value:15000,leadSource:'Site',lossReason:'Preço ou orçamento',recoveryPotential:'high',lostToCompetitor:'Concorrente X'}]);
  assert.equal(truth.conversion,50);
  assert.equal(truth.recoverableValue,15000);
  assert.equal(truth.lossReasons[0].label,'Preço ou orçamento');
  assert.equal(truth.missingLossReason,0);
});

test('Fase 19: velocidade encontra ciclo e gargalo do funil',()=>{
  const velocity=buildFunnelVelocity([{status:'won',value:10000,createdAt:'2026-08-01T12:00:00Z',wonAt:'2026-08-21T12:00:00Z'},{status:'open',stage:'proposal',value:30000,movedAt:'2026-08-01T12:00:00Z'}],[{id:'lead',label:'Lead'},{id:'proposal',label:'Proposta'},{id:'won',label:'Ganhou'}],'2026-08-27T12:00:00Z');
  assert.equal(velocity.avgCycle,20);
  assert.equal(velocity.bottleneck.stage.id,'proposal');
  assert.equal(velocity.throughput30,10000);
});

test('Fase 20: comando diário resume mudanças e filas urgentes',()=>{
  const command=buildDailyCommand({deals:[{id:'d1',title:'Contrato',client:'Empresa A',status:'open',value:20000,updatedAt:'2026-08-27T10:00:00Z'}],activities:[{date:'2026-08-26',done:false}],proposals:[],clients:[],since:'2026-08-27T08:00:00Z',today:'2026-08-27'});
  assert.equal(command.metrics.changed,1);
  assert.equal(command.views.find(item=>item.id==='overdue').count,1);
  assert.equal(command.views.find(item=>item.id==='without-next').count,1);
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
