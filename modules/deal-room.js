export const dealRoomDomain=Object.freeze({name:'deal-room',label:'Sala segura da negociação'});
export function normalizeAccessCode(value=''){return String(value).replace(/\D/g,'').slice(0,6)}
export function dealRoomPayload({proposal,deal,plan,company}){
  if(!proposal?.id||!deal?.id)throw new Error('proposal_and_deal_required');
  return{version:1,company:{name:company?.fantasyName||company?.name||'NivionTech',logoData:company?.logoData||''},proposal:{id:proposal.id,title:proposal.title,client:proposal.client,version:Number(proposal.version||1),validUntil:proposal.validUntil,value:Number(proposal.value||0),discount:Number(proposal.discount||0),opening:proposal.opening||'',scope:proposal.scope||'',items:proposal.items||[],paymentTerms:proposal.paymentTerms||'',deliveryTerms:proposal.deliveryTerms||'',notes:proposal.notes||'',status:proposal.status},deal:{id:deal.id,title:deal.title,next:deal.next||'',nextDate:deal.nextDate||'',owner:deal.owner||''},plan:plan?{targetDate:plan.targetDate,milestones:(plan.milestones||[]).map(item=>({title:item.title,owner:item.owner,dueDate:item.dueDate,done:Boolean(item.done)}))}:null};
}
