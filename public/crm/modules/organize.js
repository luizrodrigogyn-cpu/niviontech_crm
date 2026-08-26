export const organizeDomain=Object.freeze({name:'organize',label:'Cole e organize'});

function isoDate(date){const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');return `${year}-${month}-${day}`}
function dateFromText(text,now){
  const base=new Date(now);base.setHours(12,0,0,0);
  const explicit=text.match(/\b(\d{1,2})[\/]([01]?\d)(?:[\/](\d{2,4}))?\b/);
  if(explicit){let year=explicit[3]?Number(explicit[3]):base.getFullYear();if(year<100)year+=2000;const candidate=new Date(year,Number(explicit[2])-1,Number(explicit[1]),12);if(!Number.isNaN(candidate.getTime()))return{date:isoDate(candidate),source:explicit[0]}}
  if(/amanh[ãa]/i.test(text)){base.setDate(base.getDate()+1);return{date:isoDate(base),source:'amanhã'}}
  if(/\bhoje\b/i.test(text))return{date:isoDate(base),source:'hoje'};
  const weekdays=[['domingo',0],['segunda(?:-feira)?',1],['terça(?:-feira)?|terca(?:-feira)?',2],['quarta(?:-feira)?',3],['quinta(?:-feira)?',4],['sexta(?:-feira)?',5],['sábado|sabado',6]];
  for(const [pattern,target] of weekdays){const match=text.match(new RegExp(`\\b(${pattern})\\b`,'i'));if(match){const ahead=(target-base.getDay()+7)%7||7;base.setDate(base.getDate()+ahead);return{date:isoDate(base),source:match[0]}}}
  return{date:isoDate(base),source:''};
}
function moneyLabel(value){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value)}
function dateLabel(value){return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(`${value}T12:00:00`)).replace('.','')}

export function analyzeConversationText(text,{now=new Date(),newStage='new',proposalStage='proposal'}={}){
  const valueMatch=text.match(/R\$\s?([\d.]+(?:,\d{1,2})?)/i),value=valueMatch?Number(valueMatch[1].replace(/\./g,'').replace(',','.')):0;
  const phone=text.match(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/)?.[0]?.trim()||'';
  const email=text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0]||'';
  const urgencyWords=['com urgência','urgente','prioridade','amanhã','hoje','sexta'];
  const urgencyHits=urgencyWords.filter(word=>new RegExp(word.replace('ê','[eê]').replace('ã','[aã]'),'i').test(text));
  const urgency=/com urg[eê]ncia|urgente|prioridade/i.test(text)?'high':urgencyHits.length?'attention':'normal';
  const sentenceSafe=text.replace(/(\d)\.(?=\d{3}(?:\D|$))/g,'$1__THOUSANDS_DOT__');
  const firstSentence=(sentenceSafe.split(/[.!?\n]/).find(part=>part.trim())?.trim()||'').replaceAll('__THOUSANDS_DOT__','.');
  const companyMatch=text.match(/(?:empresa|cliente|contato)\s+(.+?)(?=\s+(?:pediu|quer|solicitou|precisa|gostaria|informou|disse|deseja)\b|[,.;\n]|$)/i);
  const client=companyMatch?.[1]||firstSentence.split(/\s+(?:pediu|quer|solicitou|precisa|gostaria)\s+/i)[0].replace(/^(oi|olá|bom dia|boa tarde),?\s*/i,'').slice(0,60)||'Cliente a confirmar';
  const recognizedDate=dateFromText(text,now),timeMatch=text.match(/(?:às|as)\s*(\d{1,2})(?::|h)(\d{2})?/i),time=timeMatch?`${timeMatch[1].padStart(2,'0')}:${(timeMatch[2]||'00').padStart(2,'0')}`:'09:00';
  const isProposal=/proposta|orçamento/i.test(text),next=isProposal?'Preparar e enviar proposta':urgency==='high'?'Retornar contato com prioridade':'Realizar retorno ao cliente';
  const details=[firstSentence,email&&`E-mail: ${email}`,phone&&`Telefone: ${phone}`,urgency!=='normal'&&`Urgência: ${urgency==='high'?'alta':'atenção'}`].filter(Boolean);
  const draft={client:client.trim(),title:value?'Oportunidade identificada':'Novo atendimento',value,stage:isProposal?proposalStage:newStage,next,date:recognizedDate.date,time,phone,email,urgency,summary:details.join(' · ')};
  const understood=[client.trim(),value&&`negócio de ${moneyLabel(value)}`,recognizedDate.source&&`retorno ${recognizedDate.source} (${dateLabel(recognizedDate.date)})`,timeMatch&&`às ${time}`,phone&&`telefone ${phone}`,urgency!=='normal'&&`${urgency==='high'?'urgência alta':'atenção ao prazo'}`].filter(Boolean);
  return{draft,detected:{value:Boolean(valueMatch),date:Boolean(recognizedDate.source),phone:Boolean(phone),urgency:urgency!=='normal',email:Boolean(email),time:Boolean(timeMatch)},confirmation:`Entendi: ${understood.join(', ')}. Confirma?`};
}

export function createHandoffSummary(deal,client,context={}){
  const interactions=Array.isArray(client?.interactions)?client.interactions.slice(-3):[];
  const history=Array.isArray(deal?.history)?deal.history.slice(0,4):[];
  const source=[context.reason,deal?.next,...interactions.map(item=>item.text||item.description||item.note||''),...history.map(item=>item.text||'')].filter(Boolean).join(' ');
  const reading=analyzeConversationText(source,{now:context.now});
  const rawContext=reading?.draft?.summary||source||'Sem conversa anterior registrada';
  const compactContext=rawContext.replace(/\s+/g,' ').trim().slice(0,150);
  const nextDate=deal?.nextDate?dateLabel(deal.nextDate):'data a combinar';
  const stage=context.stageLabel||deal?.stage||'etapa atual';
  const fromOwner=context.fromOwner||'Responsável anterior',toOwner=context.toOwner||deal?.owner||'Novo responsável';
  const reason=context.reason?` Motivo: ${context.reason}.`:'';
  return{
    text:`${deal?.client||'Cliente'}: ${deal?.title||'negociação'} de ${moneyLabel(Number(deal?.value)||0)}, em ${stage}. Contexto: ${compactContext}. Próximo passo: ${deal?.next||'definir próxima ação'} em ${nextDate}. ${fromOwner} passou para ${toOwner}.${reason}`,
    createdAt:new Date().toISOString(),fromOwner,toOwner,fromRole:context.fromRole||'',toRole:context.toRole||'',reason:context.reason||'',detected:reading?.detected||{}
  };
}
