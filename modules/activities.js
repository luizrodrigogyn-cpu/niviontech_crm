export const activitiesDomain=Object.freeze({name:'activities',label:'Atividades e agenda'});
export function todayISO(now=new Date()){
  const year=now.getFullYear(),month=String(now.getMonth()+1).padStart(2,'0'),day=String(now.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}
export function formatDate(date){return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(date+'T12:00:00')).replace('.','')}

function normalizedName(value=''){return value.trim().toLocaleLowerCase('pt-BR')}
function daysBetween(start,end){return Math.max(0,Math.floor((new Date(end+'T12:00:00')-new Date(start+'T12:00:00'))/86400000))}

export function rankTodayActivities(activities,deals,stages,currentDate=todayISO()){
  const openDeals=deals.filter(deal=>deal.status!=='lost'&&deal.paymentStatus!=='received');
  const commercialStages=stages.filter(stage=>!['won','after-sales','lost'].includes(stage.id));
  const candidates=activities.filter(activity=>!activity.done&&activity.date<=currentDate).map(activity=>{
    const relatedDeals=openDeals.filter(deal=>normalizedName(deal.client)===normalizedName(activity.client));
    const deal=relatedDeals.sort((a,b)=>Number(b.value||0)-Number(a.value||0))[0]||null;
    const dueDate=deal?.nextDate||activity.date;
    const overdueDays=dueDate<currentDate?daysBetween(dueDate,currentDate):0;
    const value=Number(deal?.value||0);
    const stageIndex=Math.max(0,commercialStages.findIndex(stage=>stage.id===deal?.stage));
    const stageProgress=commercialStages.length>1?stageIndex/(commercialStages.length-1):0;
    const score=Math.min(55,overdueDays*11)+Math.min(25,Math.log10(value+1)*6)+stageProgress*20;
    return{activity,deal,value,overdueDays,stageIndex,stageLabel:commercialStages[stageIndex]?.label||'',score};
  });
  const highestValue=Math.max(0,...candidates.map(item=>item.value));
  return candidates.map(item=>({...item,isHighestValue:item.value>0&&item.value===highestValue})).sort((a,b)=>b.score-a.score||a.activity.time.localeCompare(b.activity.time));
}
