export const pipelineDomain=Object.freeze({name:'pipeline',label:'Funil comercial'});
export const DEFAULT_STALE_DEAL_DAYS=7;
export const STALE_DEAL_DAYS_KEY='niviontech_stale_deal_days';
export const OUTCOME_STAGE_IDS=Object.freeze(['won','after-sales','lost']);
export function commercialPipelineStages(stages=[]){return stages.filter(stage=>!OUTCOME_STAGE_IDS.includes(stage.id))}
export function getStaleDealDays(storage=localStorage){const stored=Number(storage.getItem(STALE_DEAL_DAYS_KEY));return Number.isFinite(stored)&&stored>0?Math.round(stored):DEFAULT_STALE_DEAL_DAYS}
export function saveStaleDealDays(days,storage=localStorage){const normalized=Math.max(1,Math.min(90,Math.round(Number(days)||DEFAULT_STALE_DEAL_DAYS)));storage.setItem(STALE_DEAL_DAYS_KEY,String(normalized));return normalized}
function interactionTimestamp(value){const timestamp=new Date(value||0).getTime();return Number.isFinite(timestamp)?timestamp:0}
export function calculateDealHealth(deal,client,maxValue=0,now=new Date()){
  const today=now.getTime(),day=86400000;
  const timestamps=[deal.createdAt,deal.movedAt,deal.updatedAt,...(deal.history||[]).map(item=>item.date),...(client?.interactions||[]).map(item=>item.date)].map(interactionTimestamp).filter(Boolean);
  const lastInteraction=timestamps.length?Math.max(...timestamps):today;
  const inactiveDays=Math.max(0,Math.floor((today-lastInteraction)/day));
  const inactivityRisk=inactiveDays>14?45:inactiveDays>7?32:inactiveDays>3?16:0;
  const todayStart=new Date(now);todayStart.setHours(0,0,0,0);
  const promised=deal.nextDate?new Date(`${deal.nextDate}T00:00:00`).getTime():0;
  const daysToPromise=promised?Math.round((promised-todayStart.getTime())/day):null;
  const promiseRisk=daysToPromise===null?28:daysToPromise<0?Math.min(35,22+Math.abs(daysToPromise)*3):daysToPromise===0?18:daysToPromise<=2?10:0;
  const value=Number(deal.value||0),valueRatio=maxValue>0?Math.min(1,value/maxValue):0;
  const valueRisk=Math.round(valueRatio*20);
  const score=Math.max(0,Math.min(100,100-inactivityRisk-promiseRisk-valueRisk));
  const tone=score>=70?'healthy':score>=45?'attention':'risk';
  const label={healthy:'Saudável',attention:'Atenção',risk:'Risco'}[tone];
  const factors=[
    {weight:inactivityRisk,text:inactiveDays?`sem contato há ${inactiveDays} ${inactiveDays===1?'dia':'dias'}`:'contato recente'},
    {weight:promiseRisk,text:daysToPromise===null?'sem data prometida':daysToPromise<0?`próxima ação vencida há ${Math.abs(daysToPromise)} ${Math.abs(daysToPromise)===1?'dia':'dias'}`:daysToPromise===0?'próxima ação vence hoje':`próxima ação em ${daysToPromise} ${daysToPromise===1?'dia':'dias'}`},
    {weight:valueRisk,text:valueRatio>=.65?'valor relevante em risco':`${value?'valor acompanhado':'sem valor informado'}`}
  ].sort((a,b)=>b.weight-a.weight);
  const relevant=factors.filter(item=>item.weight>0).slice(0,2).map(item=>item.text);
  return{score,tone,label,inactiveDays,daysToPromise,valueRisk,reason:relevant.length?relevant.join(' e '):'contato recente e próximo passo dentro do prazo'};
}
export function findStaleDeals(deals,clients,thresholdDays=DEFAULT_STALE_DEAL_DAYS,now=new Date()){
  const limit=Math.max(1,Number(thresholdDays)||DEFAULT_STALE_DEAL_DAYS),today=now.getTime();
  return deals.filter(deal=>deal.status!=='lost'&&deal.status!=='won'&&deal.paymentStatus!=='received').map(deal=>{
    const client=clients.find(item=>item.name.trim().toLocaleLowerCase('pt-BR')===String(deal.client||'').trim().toLocaleLowerCase('pt-BR'));
    const timestamps=[deal.createdAt,deal.movedAt,...(deal.history||[]).map(item=>item.date),...(client?.interactions||[]).map(item=>item.date)].map(interactionTimestamp).filter(Boolean);
    const lastInteraction=timestamps.length?Math.max(...timestamps):today,inactiveDays=Math.max(0,Math.floor((today-lastInteraction)/86400000));
    return{deal,inactiveDays,lastInteraction:new Date(lastInteraction).toISOString()};
  }).filter(item=>item.inactiveDays>limit).sort((a,b)=>b.inactiveDays-a.inactiveDays||Number(b.deal.value||0)-Number(a.deal.value||0));
}
export function validateNegotiation(deal){
  if(!deal.next||!deal.nextDate)return{valid:false,message:'Toda negociação ativa precisa de próxima ação e data.'};
  return{valid:true,message:''};
}
export function applyWonDealRules(deal,stage='won'){
  deal.status='won';
  deal.stage=stage;
  deal.paymentStatus=deal.paymentStatus||'pending';
  return deal;
}
export function applyLostDealRules(deal,now=new Date()){
  deal.status='lost';
  deal.stage='lost';
  deal.lostAt=now.toISOString();
  return deal;
}
