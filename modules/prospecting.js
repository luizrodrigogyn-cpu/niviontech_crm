export const prospectingDomain=Object.freeze({
  id:'orbit-prospecting',
  purpose:'Descobrir e priorizar empresas com evidência pública e aprovação humana.',
  safeguards:['fontes públicas','deduplicação','score explicável','sem envio automático']
});

const blockedDomains=['google.','bing.com','youtube.com','facebook.com','instagram.com','linkedin.com','x.com','twitter.com','wikipedia.org','reclameaqui.com.br','jusbrasil.com.br','gov.br','mercadolivre.com.br','olx.com.br'];

export const defaultProspectProfile=Object.freeze({
  segment:'Rastreamento veicular, proteção veicular e IoT/M2M',
  products:'Plataforma de rastreamento veicular; chip M2M; rastreador 4G; identificador de motorista',
  keywords:'rastreamento veicular; proteção veicular; telemetria; gestão de frotas; M2M; IoT',
  signals:'vende rastreadores; oferece telemetria; atende frotas; proteção veicular; contrata técnicos',
  exclusions:'empresas fora do segmento configurado',
  region:'Todo o Brasil'
});

function normalize(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
}

function terms(value='',limit=12){
  return [...new Set(String(value).split(/[;,\n]/).map(item=>item.trim()).filter(Boolean))].slice(0,limit);
}

export function normalizeProspectUrl(value=''){
  try{
    const prepared=/^https?:\/\//i.test(String(value).trim())?String(value).trim():`https://${String(value).trim()}`;
    const parsed=new URL(prepared);
    if(!['http:','https:'].includes(parsed.protocol))return null;
    const domain=parsed.hostname.toLowerCase().replace(/^www\./,'');
    if(!domain.includes('.')||blockedDomains.some(item=>domain.includes(item)))return null;
    return{website:parsed.origin,domain};
  }catch{return null}
}

export function buildProspectingQueries(profile=defaultProspectProfile){
  const region=String(profile.region||defaultProspectProfile.region).trim();
  const sourceTerms=terms(profile.keywords||profile.segment,6);
  return sourceTerms.map(term=>`${term} empresa fornecedor ${region}`);
}

export function scoreProspectCandidate(result,profile=defaultProspectProfile){
  const text=normalize(`${result?.title||''} ${result?.content||''}`);
  const keywordMatches=terms(profile.keywords).filter(term=>text.includes(normalize(term)));
  const signalMatches=terms(profile.signals).filter(term=>text.includes(normalize(term)));
  const url=normalizeProspectUrl(result?.url||'');
  const brazilian=Boolean(url?.domain.endsWith('.br')||/brasil|brasileir|\bsp\b|\brj\b|\bmg\b|\bgo\b|\bpr\b|\bsc\b|\brs\b|\bba\b|\bpe\b|\bce\b|\brn\b/.test(text));
  const breakdown=[
    {label:'Site público válido',points:url?20:0},
    {label:'Aderência às palavras-chave',points:Math.min(30,keywordMatches.length*10)},
    {label:'Sinais de oportunidade',points:Math.min(30,signalMatches.length*10)},
    {label:'Atuação no Brasil',points:brazilian?10:0},
    {label:'Evidência descritiva',points:String(result?.content||'').trim().length>=80?10:0}
  ];
  return{
    score:Math.min(100,breakdown.reduce((total,item)=>total+item.points,0)),
    breakdown,
    keywordMatches,
    signalMatches,
    segmentConfirmed:keywordMatches.length>0
  };
}

export function prospectCandidateFromResult(result,profile=defaultProspectProfile,searchId=''){
  const normalizedUrl=normalizeProspectUrl(result?.url||'');
  if(!normalizedUrl||!String(result?.title||'').trim())return null;
  const evidenceText=normalize(`${result?.title||''} ${result?.content||''}`);
  if(terms(profile.exclusions).some(term=>evidenceText.includes(normalize(term))))return null;
  const scoring=scoreProspectCandidate(result,profile);
  if(!scoring.segmentConfirmed)return null;
  const company=String(result.title)
    .split(/\s(?:\||—|–)\s/)[0]
    .replace(/\s+-\s+(início|inicio|home|rastreamento.*)$/i,'')
    .trim()
    .slice(0,140);
  if(company.length<2)return null;
  const signals=[...scoring.keywordMatches.map(item=>`Palavra-chave: ${item}`),...scoring.signalMatches.map(item=>`Sinal: ${item}`)].slice(0,6);
  return{
    id:crypto.randomUUID(),
    searchId,
    company,
    website:normalizedUrl.website,
    domain:normalizedUrl.domain,
    location:String(profile.region||''),
    score:scoring.score,
    scoreBreakdown:scoring.breakdown,
    signals,
    evidenceUrl:String(result.url),
    evidenceSummary:String(result.content||'').trim().slice(0,320),
    status:'pending',
    sourceType:'public_search',
    createdAt:new Date().toISOString()
  };
}

export function mergeProspectCandidates(existing=[],incoming=[],clients=[]){
  const domains=new Set(existing.map(item=>normalizeProspectUrl(item.website||item.domain)?.domain).filter(Boolean));
  const names=new Set(clients.map(item=>normalize(item.name)).filter(Boolean));
  clients.forEach(item=>{const domain=normalizeProspectUrl(item.website||'')?.domain;if(domain)domains.add(domain)});
  const inserted=[],duplicates=[];
  for(const item of incoming){
    const domain=normalizeProspectUrl(item.website||item.domain)?.domain;
    if(!domain||domains.has(domain)||names.has(normalize(item.company))){duplicates.push(item);continue}
    domains.add(domain);inserted.push(item);
  }
  return{items:[...inserted,...existing],inserted,duplicates};
}

export function buildProspectApproach(candidate,profile=defaultProspectProfile){
  const product=terms(profile.products,1)[0]||'nossa solução';
  const observed=(candidate.signals||[])[0]?.replace(/^(Palavra-chave|Sinal):\s*/,'').toLocaleLowerCase('pt-BR')||'atuação no segmento';
  return `Olá, equipe da ${candidate.company}. Identificamos publicamente a atuação de vocês com ${observed}. A NivionTech oferece ${product} e gostaria de entender se existe espaço para uma conversa sobre operação, integração ou crescimento. Podemos agendar uma breve reunião?`;
}
