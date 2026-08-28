const meetingGoals={
  diagnosis:'Compreender impacto, prioridade, processo de decisão e critério de sucesso.',
  demonstration:'Conectar a demonstração às dores registradas e validar aderência com os participantes.',
  proposal:'Validar escopo, investimento, prazo e caminho de aprovação da proposta.',
  negotiation:'Resolver a objeção principal e conquistar um compromisso concreto de decisão.',
  followup:'Retomar o contexto, confirmar mudanças e restabelecer um próximo passo com data.'
};
const roleLabels={decision:'Decisor',champion:'Patrocinador interno',influencer:'Influenciador',user:'Usuário-chave',blocker:'Possível bloqueador'};
function unique(values){return [...new Set(values.map(value=>String(value||'').trim()).filter(Boolean))]}
function formatDate(value){if(!value)return'';const date=new Date(`${value}T12:00:00`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(date).replace('.','')}
export function buildMeetingPreparation({deal={},client={},activities=[],icp={},meetingType='diagnosis',stageLabel='Etapa atual'}={}){
  const memory={...(client.orbitMemory||{}),...(deal.orbitMemory||{})},stakeholders=Array.isArray(client.stakeholders)?client.stakeholders:[],interactions=Array.isArray(client.interactions)?client.interactions:[];
  const people=stakeholders.map(item=>({name:item.name,role:roleLabels[item.role]||item.role||'Participante',influence:item.influence||'unknown',sentiment:item.sentiment||'neutral'}));
  if(client.decisionMaker&&!people.some(item=>item.name===client.decisionMaker))people.unshift({name:client.decisionMaker,role:'Decisor',influence:'high',sentiment:'neutral'});
  if(client.mainContact&&!people.some(item=>item.name===client.mainContact))people.push({name:client.mainContact,role:'Contato principal',influence:'unknown',sentiment:'neutral'});
  const pending=activities.filter(item=>!item.done&&String(item.client||'').trim().toLocaleLowerCase('pt-BR')===String(client.name||deal.client||'').trim().toLocaleLowerCase('pt-BR')).sort((a,b)=>`${a.date||''}${a.time||''}`.localeCompare(`${b.date||''}${b.time||''}`)).slice(0,4);
  const commitments=unique([...(memory.commitments||[]),memory.lastNextStep,deal.next,...interactions.slice(0,3).map(item=>item.text)]).slice(0,5);
  const pains=unique([deal.pain,...(memory.pains||[])]),objections=unique([deal.objection,...(memory.objections||[])]),competitors=unique([deal.competitor,...(memory.competitors||[])]),decisionMaker=deal.decisionMaker||memory.decisionMakers?.[0]||client.decisionMaker||'';
  const risks=[];
  if(!pains.length)risks.push('Impacto do problema ainda não está claro.');
  if(!decisionMaker)risks.push('Decisor ainda não foi identificado.');
  if(!deal.budget&&!memory.budget)risks.push('Faixa de investimento não foi validada.');
  if(!deal.nextDate)risks.push('Negociação sem data combinada para o próximo passo.');
  if(memory.risk==='Atenção')risks.push('A última conversa apresentou sinal de atenção.');
  if(competitors.length)risks.push(`Concorrência em avaliação: ${competitors.join(', ')}.`);
  const questions=[];
  if(!pains.length)questions.push('Qual problema mais impacta o resultado hoje e o que acontece se nada mudar?');
  else questions.push(`Como ${pains[0]} afeta tempo, receita ou capacidade da equipe hoje?`);
  if(!decisionMaker)questions.push('Além de você, quem participa da avaliação e da aprovação final?');
  if(!deal.budget&&!memory.budget)questions.push('Existe uma faixa de investimento prevista para resolver essa prioridade?');
  if(!memory.urgency)questions.push('Até quando essa mudança precisa estar funcionando e por quê?');
  if(objections.length)questions.push(`O que precisaria ficar claro para superarmos a preocupação com ${objections[0]}?`);
  questions.push('Se tudo fizer sentido, qual compromisso concreto podemos assumir ao final desta conversa?');
  const objective=meetingGoals[meetingType]||meetingGoals.diagnosis,desiredCommitment=meetingType==='proposal'?'Confirmar aprovação, ajustes finais ou data da decisão.':meetingType==='demonstration'?'Validar aderência e agendar a etapa de proposta com decisores.':meetingType==='negotiation'?'Resolver a objeção principal e definir data da decisão.':meetingType==='followup'?'Restabelecer prioridade e próximo passo com data e responsável.':'Confirmar dor, impacto, decisores, prazo e próxima reunião.';
  const strategy=objections.length?`Comece recapitulando o objetivo do cliente, valide a preocupação com ${objections[0]} antes de responder e use uma evidência alinhada ao ICP.`:pains.length?`Conduza a conversa a partir de ${pains[0]}, quantifique o impacto e evite demonstrar recursos sem conexão com essa prioridade.`:'Priorize descoberta. Não avance para solução antes de confirmar problema, impacto e urgência.';
  const checklist=[{label:'Objetivo da reunião definido',done:true},{label:'Contexto anterior revisado',done:Boolean(memory.summary||interactions.length)},{label:'Dor principal conhecida',done:Boolean(pains.length)},{label:'Decisor identificado',done:Boolean(decisionMaker)},{label:'Objeções antecipadas',done:Boolean(objections.length||icp.objections)},{label:'Compromisso desejado definido',done:true}];
  return{meetingType,objective,desiredCommitment,strategy,context:memory.summary||client.strategicNotes||'Ainda não existe uma memória consolidada desta negociação.',stageLabel,pains,objections,competitors,people,pending,commitments,risks,questions,checklist,readiness:Math.round(checklist.filter(item=>item.done).length/checklist.length*100),nextDate:formatDate(deal.nextDate),accountGoal:client.goal||'',icpSegment:icp.segment||client.segment||''};
}
