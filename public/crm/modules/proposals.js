export const proposalsDomain=Object.freeze({name:'proposals',label:'Propostas'});
export function proposalStatusLabel(status){return {draft:'Rascunho',sent:'Enviada',approved:'Aprovada',refused:'Recusada'}[status]||status}
