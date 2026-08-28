const outcomes=new Set(['won','after-sales','lost']);
const amount=item=>Number(item?.value||0);
const norm=value=>String(value||'').trim().toLocaleLowerCase('pt-BR');
const daysBetween=(from,to)=>Math.floor((new Date(`${to}T12:00:00`)-new Date(`${from}T12:00:00`))/86400000);
export const automationTemplates=[
  {id:'overdue-followup',name:'Resgatar atividade atrasada',event:'Atividade venceu',action:'Criar prioridade para hoje',description:'Traz retornos vencidos para o topo da rotina.'},
  {id:'proposal-silence',name:'Proposta sem resposta',event:'Proposta parada por 5 dias',action:'Criar follow-up de decisão',description:'Evita que propostas enviadas esfriem.'},
  {id:'high-value-risk',name:'Negócio importante em risco',event:'Alto valor sem próximo passo',action:'Alertar e criar ação',description:'Protege as maiores oportunidades do funil.'},
  {id:'won-handoff',name:'Passagem para pós-venda',event:'Venda marcada como ganha',action:'Criar reunião de implantação',description:'Garante continuidade depois do fechamento.'}
];
export function buildDealScorecard(deal,stages=[],today=new Date().toISOString().slice(0,10)){
  const commercial=stages.filter(stage=>!outcomes.has(stage.id)),index=Math.max(0,commercial.findIndex(stage=>stage.id===deal.stage)),progress=(index+1)/Math.max(1,commercial.length),fields=['next','nextDate','pain','decisionMaker','budget','successCriteria'],present=fields.filter(field=>deal[field]||deal.orbitMemory?.[field]||deal.orbitMemory?.[`${field}s`]?.length),signals=[],risks=[];let score=15+Math.round(progress*30)+present.length*6;
  if(deal.next&&deal.nextDate){score+=10;signals.push('Próximo compromisso definido')}else risks.push('Sem próximo compromisso');
  if(deal.decisionMaker||deal.orbitMemory?.decisionMakers?.length)signals.push('Decisor mapeado');
  if(deal.budget||deal.orbitMemory?.budget)signals.push('Investimento discutido');
  if(deal.orbitMemory?.commitments?.length){score+=8;signals.push('Cliente assumiu compromisso')}
  if(deal.nextDate&&deal.nextDate<today){score-=15;risks.push('Compromisso vencido')}
  if(deal.orbitMemory?.risk==='Atenção'){score-=12;risks.push('Orbit identificou risco')}
  score=Math.max(5,Math.min(100,score));return{deal,score,temperature:score>=75?'hot':score>=50?'warm':'cold',label:score>=75?'Alta intenção':score>=50?'Em evolução':'Precisa de evidência',signals,risks,missing:fields.filter(field=>!present.includes(field))};
}
export function runAutomationRules({deals=[],activities=[],enabledRules=[],stages=[],today=new Date().toISOString().slice(0,10)}={}){
  const actions=[],enabled=new Set(enabledRules),open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost'),activityExists=(title,client)=>activities.some(item=>!item.done&&norm(item.title)===norm(title)&&norm(item.client)===norm(client));
  if(enabled.has('overdue-followup'))activities.filter(item=>!item.done&&item.date<today).forEach(item=>{const title=`Retomar: ${item.title}`;if(!activityExists(title,item.client))actions.push({ruleId:'overdue-followup',title,client:item.client,date:today,type:'Prioridade',sourceId:item.id})});
  if(enabled.has('proposal-silence'))open.filter(deal=>/proposal|proposta|budget|orçamento/i.test(deal.stage)&&deal.movedAt&&daysBetween(String(deal.movedAt).slice(0,10),today)>=5).forEach(deal=>{const title='Confirmar decisão sobre proposta';if(!activityExists(title,deal.client))actions.push({ruleId:'proposal-silence',title,client:deal.client,date:today,type:'Follow-up',dealId:deal.id})});
  const values=open.map(amount).sort((a,b)=>b-a),highThreshold=values[Math.max(0,Math.floor(values.length*.25)-1)]||0;if(enabled.has('high-value-risk'))open.filter(deal=>amount(deal)>=highThreshold&&(!deal.next||!deal.nextDate)).forEach(deal=>{const title='Definir próximo passo do negócio prioritário';if(!activityExists(title,deal.client))actions.push({ruleId:'high-value-risk',title,client:deal.client,date:today,type:'Prioridade',dealId:deal.id})});
  if(enabled.has('won-handoff'))deals.filter(deal=>deal.status==='won').forEach(deal=>{const title='Reunião de início e passagem para pós-venda';if(!activityExists(title,deal.client))actions.push({ruleId:'won-handoff',title,client:deal.client,date:today,type:'Pós-venda',dealId:deal.id})});return actions;
}
export function buildCoachingBrief(user,deals=[],activities=[],period=''){
  const owner=norm(user?.name),owned=record=>norm(record.owner)===owner,teamDeals=deals.filter(owned),open=teamDeals.filter(deal=>deal.status!=='won'&&deal.status!=='lost'),won=teamDeals.filter(deal=>deal.status==='won'&&(!period||String(deal.wonAt||'').startsWith(period))),tasks=activities.filter(owned),completed=tasks.filter(item=>item.done),onTime=completed.filter(item=>!item.date||String(item.completedAt||item.date).slice(0,10)<=item.date),missingNext=open.filter(deal=>!deal.next||!deal.nextDate),pipeline=open.reduce((sum,deal)=>sum+amount(deal),0),sold=won.reduce((sum,deal)=>sum+amount(deal),0),execution=completed.length?Math.round(onTime.length/completed.length*100):0,focus=[];if(missingNext.length)focus.push(`${missingNext.length} negociações precisam de próximo passo`);if(execution<75)focus.push('Melhorar cumprimento dos compromissos no prazo');if(!won.length)focus.push('Escolher uma oportunidade para plano de fechamento');if(!focus.length)focus.push('Aumentar geração de oportunidades qualificadas');return{user,pipeline,sold,open:open.length,won:won.length,execution,focus,strengths:[execution>=80&&'Boa disciplina de execução',won.length>0&&'Conversão registrada no período',open.every(deal=>deal.next&&deal.nextDate)&&'Funil com continuidade definida'].filter(Boolean),agenda:[`Revisar resultado e evolução de ${user?.name||'vendedor'}`,focus[0],'Combinar uma ação de desenvolvimento','Registrar compromisso para a próxima conversa']};
}
export function buildRevenueCockpit(deals=[],activities=[],stages=[],today=new Date().toISOString().slice(0,10)){
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost'),cards=open.map(deal=>buildDealScorecard(deal,stages,today)),pipeline=open.reduce((sum,deal)=>sum+amount(deal),0),weighted=cards.reduce((sum,item)=>sum+amount(item.deal)*(item.score/100),0),atRisk=cards.filter(item=>item.risks.length),hot=cards.filter(item=>item.temperature==='hot'),overdue=activities.filter(item=>!item.done&&item.date<today),priorities=[...atRisk.sort((a,b)=>amount(b.deal)-amount(a.deal)).slice(0,3).map(item=>({title:item.deal.title,text:`${item.deal.client} · ${item.risks[0]}`,value:amount(item.deal),target:'pipeline'})),...overdue.slice(0,2).map(item=>({title:item.title,text:`${item.client} · atividade atrasada`,value:0,target:'activities'}))];return{pipeline,weighted,atRiskValue:atRisk.reduce((sum,item)=>sum+amount(item.deal),0),hotValue:hot.reduce((sum,item)=>sum+amount(item.deal),0),hotCount:hot.length,overdue:overdue.length,priorities,cards};
}

export function buildIcpRadar(clients=[],deals=[],company={}){
  const won=deals.filter(deal=>deal.status==='won'),wonNames=new Set(won.map(deal=>norm(deal.client))),segments=new Map();
  clients.forEach(client=>{const key=client.segment||'Não informado',current=segments.get(key)||{segment:key,clients:0,wins:0,pipeline:0,revenue:0};current.clients+=1;if(wonNames.has(norm(client.name)))current.wins+=1;deals.filter(deal=>norm(deal.client)===norm(client.name)).forEach(deal=>{if(deal.status==='won')current.revenue+=amount(deal);else if(deal.status!=='lost')current.pipeline+=amount(deal)});segments.set(key,current)});
  const ranked=[...segments.values()].map(item=>({...item,score:Math.min(100,Math.round(25+item.wins*25+Math.min(30,item.pipeline/5000)+Math.min(20,item.clients*4)))})).sort((a,b)=>b.score-a.score),best=ranked[0];
  return{companySegment:company.segment||company.market||'',best,segments:ranked,idealProfile:best?`${best.segment} · ${best.wins?`${best.wins} venda${best.wins===1?'':'s'} validada${best.wins===1?'':'s'}`:'maior potencial atual'}`:'Cadastre clientes e vendas para descobrir seu ICP'};
}

export function buildBuyingInfluenceMap(deals=[],clients=[]){
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost').map(deal=>{const client=clients.find(item=>norm(item.name)===norm(deal.client)),stakeholders=client?.stakeholders||[],roles=new Set(stakeholders.map(item=>norm(item.role))),hasDecision=Boolean(deal.decisionMaker)||[...roles].some(role=>/decisor|patrocinador|sponsor/.test(role)),hasUser=[...roles].some(role=>/usuário|usuario|influenciador|técnico|tecnico/.test(role)),hasFinance=[...roles].some(role=>/finance|compras|juríd|jurid/.test(role)),coverage=[hasDecision,hasUser,hasFinance].filter(Boolean).length,percent=Math.round(coverage/3*100);return{deal,stakeholders,coverage:percent,missing:[!hasDecision&&'Decisor econômico',!hasUser&&'Usuário ou influenciador',!hasFinance&&'Compras, financeiro ou jurídico'].filter(Boolean)}}).sort((a,b)=>a.coverage-b.coverage||amount(b.deal)-amount(a.deal));
  return{accounts:open,average:open.length?Math.round(open.reduce((sum,item)=>sum+item.coverage,0)/open.length):0,exposedValue:open.filter(item=>item.coverage<67).reduce((sum,item)=>sum+amount(item.deal),0)};
}

export function buildConversationIntelligence(deals=[]){
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost').map(deal=>{const memory=deal.orbitMemory||{},evidence=[memory.summary,(memory.pains||[]).length,(memory.objections||[]).length,memory.lastNextStep||deal.next,(memory.decisionMakers||[]).length||deal.decisionMaker,memory.commitments?.length].filter(Boolean).length,score=Math.round(evidence/6*100),gaps=[!memory.summary&&'Resumo da conversa',!(memory.pains||[]).length&&!deal.pain&&'Dor confirmada',!(memory.objections||[]).length&&!deal.objection&&'Objeções',!memory.lastNextStep&&!deal.next&&'Próximo passo'].filter(Boolean);return{deal,score,gaps,headline:score>=84?'Conversa com evidências fortes':score>=50?'Memória em construção':'Negociação sem contexto suficiente'}}).sort((a,b)=>a.score-b.score||amount(b.deal)-amount(a.deal));
  return{conversations:open,average:open.length?Math.round(open.reduce((sum,item)=>sum+item.score,0)/open.length):0,withoutMemory:open.filter(item=>item.score<50).length};
}

export function buildRevenueLeakMap(deals=[],activities=[],today=new Date().toISOString().slice(0,10)){
  const open=deals.filter(deal=>deal.status!=='won'&&deal.status!=='lost'),leaks=[];
  open.filter(deal=>!deal.next||!deal.nextDate).forEach(deal=>leaks.push({type:'Continuidade',severity:'high',deal,title:'Sem próximo passo',value:amount(deal),action:'Definir avanço e data'}));
  open.filter(deal=>deal.nextDate&&deal.nextDate<today).forEach(deal=>leaks.push({type:'Prazo',severity:'high',deal,title:'Compromisso vencido',value:amount(deal),action:'Replanejar com o cliente'}));
  open.filter(deal=>deal.movedAt&&daysBetween(String(deal.movedAt).slice(0,10),today)>=10).forEach(deal=>leaks.push({type:'Velocidade',severity:'medium',deal,title:'Negócio parado na etapa',value:amount(deal),action:'Validar avanço ou desqualificar'}));
  activities.filter(item=>!item.done&&item.date<today).forEach(item=>{const deal=open.find(entry=>norm(entry.client)===norm(item.client));if(deal)leaks.push({type:'Execução',severity:'medium',deal,title:'Atividade atrasada',value:amount(deal),action:item.title})});
  const unique=[...new Map(leaks.map(item=>[`${item.deal.id}-${item.type}`,item])).values()].sort((a,b)=>b.value-a.value);return{leaks:unique,leakingValue:new Set(unique.map(item=>item.deal.id)).size?open.filter(deal=>unique.some(item=>item.deal.id===deal.id)).reduce((sum,deal)=>sum+amount(deal),0):0,critical:unique.filter(item=>item.severity==='high').length};
}

export function buildGrowthMissions({deals=[],clients=[],activities=[],company={},today=new Date().toISOString().slice(0,10)}={}){
  const influence=buildBuyingInfluenceMap(deals,clients),conversations=buildConversationIntelligence(deals),leaks=buildRevenueLeakMap(deals,activities,today),missions=[];
  leaks.leaks.slice(0,2).forEach(item=>missions.push({kind:'Proteção de receita',title:item.action,text:`${item.deal.client} · ${item.title}`,dealId:item.deal.id,value:item.value,impact:'alto'}));
  influence.accounts.filter(item=>item.coverage<67).slice(0,2).forEach(item=>missions.push({kind:'Influência',title:`Mapear ${item.missing[0]}`,text:`${item.deal.client} · ${item.coverage}% do comitê`,dealId:item.deal.id,value:amount(item.deal),impact:'alto'}));
  conversations.conversations.filter(item=>item.score<50).slice(0,1).forEach(item=>missions.push({kind:'Inteligência',title:'Registrar memória da conversa',text:`${item.deal.client} · ${item.gaps[0]||'Contexto comercial'}`,dealId:item.deal.id,value:amount(item.deal),impact:'médio'}));
  return{missions:missions.slice(0,5),protectedValue:missions.reduce((sum,item)=>sum+item.value,0),readiness:Math.max(0,100-missions.length*12),icp:buildIcpRadar(clients,deals,company)};
}
