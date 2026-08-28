export const proposalsDomain=Object.freeze({name:'proposals',label:'Propostas'});
export function proposalStatusLabel(status){return {draft:'Rascunho',sent:'Enviada',viewed:'Visualizada',approved:'Aprovada',refused:'Recusada'}[status]||status}
export function calculateProposalTotals(items=[],discount=0){const normalized=items.map(item=>({...item,quantity:Math.max(0,Number(item.quantity)||0),unitPrice:Math.max(0,Number(item.unitPrice)||0)})),subtotal=normalized.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0),discountPercent=Math.max(0,Math.min(100,Number(discount)||0)),discountValue=subtotal*discountPercent/100,total=Math.max(0,subtotal-discountValue);return{items:normalized,subtotal,discountPercent,discountValue,total}}
export function markProposalViewed(proposal,now=new Date()){proposal.viewCount=Number(proposal.viewCount||0)+1;proposal.firstViewedAt=proposal.firstViewedAt||now.toISOString();proposal.lastViewedAt=now.toISOString();if(proposal.status==='sent')proposal.status='viewed';return proposal}
export function acceptProposal(proposal,{name,email,now=new Date()}={}){if(!String(name||'').trim())return{valid:false,message:'Informe o nome de quem aprovou a proposta.'};proposal.status='approved';proposal.acceptance={name:String(name).trim(),email:String(email||'').trim(),acceptedAt:now.toISOString(),version:Number(proposal.version||1)};proposal.updatedAt=now.toISOString();return{valid:true,proposal}}
export function proposalFamily(proposals=[],proposal){const familyId=proposal?.familyId||proposal?.id;return proposals.filter(item=>(item.familyId||item.id)===familyId).sort((a,b)=>Number(a.version||1)-Number(b.version||1))}
export function createProposalRevision(original,now=new Date()){
  const familyId=original.familyId||original.id,revision=structuredClone(original);
  Object.assign(revision,{id:`proposal-${now.getTime()}`,familyId,previousVersionId:original.id,version:Number(original.version||1)+1,status:'draft',createdAt:now.toISOString(),updatedAt:now.toISOString(),viewCount:0,firstViewedAt:undefined,lastViewedAt:undefined,acceptance:undefined,history:[]});
  return revision;
}
export function compareProposalVersions(previous,current){
  const fields=[['value','Valor'],['discount','Desconto'],['validUntil','Validade'],['paymentTerms','Pagamento'],['deliveryTerms','Implantação'],['scope','Escopo'],['notes','Observações']];
  return fields.filter(([field])=>String(previous?.[field]??'')!==String(current?.[field]??'')).map(([field,label])=>({field,label,before:previous?.[field]??'',after:current?.[field]??''}));
}
export function proposalFollowUp(proposal,days=2,now=new Date()){
  const date=new Date(now);date.setDate(date.getDate()+Math.max(1,Number(days)||2));
  return{id:`activity-proposal-${now.getTime()}`,title:`Acompanhar proposta · ${proposal.title}`,type:'Follow-up',client:proposal.client,date:date.toISOString().slice(0,10),time:'09:00',note:`NivionTech Close · versão ${Number(proposal.version||1)} · ${proposal.viewCount?'cliente já visualizou':'aguardando visualização'}`,done:false};
}
