const freeEmailDomains=new Set(['gmail.com','hotmail.com','outlook.com','yahoo.com','icloud.com','live.com','uol.com.br','bol.com.br']);

function clean(value=''){return String(value).trim()}
function normalized(value=''){return clean(value).toLocaleLowerCase('pt-BR')}
function emailDomain(email=''){return normalized(email).split('@')[1]||''}
function decodeQuotedPrintable(value=''){return value.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))}
function decodeBase64(value=''){
  try{
    if(typeof Buffer!=='undefined')return Buffer.from(value.replace(/\s/g,''),'base64').toString('utf8');
    const binary=atob(value.replace(/\s/g,'')),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }catch{return value}
}
function parseAddress(value=''){
  const match=clean(value).match(/^(.*?)\s*<([^>]+)>$/);
  if(match)return{name:clean(match[1]).replace(/^['"]|['"]$/g,''),email:normalized(match[2])};
  const email=clean(value).match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]||'';
  return{name:email?clean(value).replace(email,'').replace(/[<>"']/g,'').trim():'',email:normalized(email)};
}
function parseAddresses(value=''){return value.split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/).map(parseAddress).filter(item=>item.email)}
function unfoldLines(text=''){return String(text).replace(/\r\n/g,'\n').replace(/\n[ \t]/g,'')}
function splitIcsProperty(line=''){const index=line.indexOf(':');return index<0?null:{key:line.slice(0,index).split(';')[0].toUpperCase(),params:line.slice(0,index),value:line.slice(index+1)}}
function unescapeIcs(value=''){return String(value).replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\').trim()}

export function parseIcsDate(raw=''){
  const value=clean(raw),datePart=value.slice(0,8);
  if(!/^\d{8}$/.test(datePart))return{date:'',time:''};
  const date=`${datePart.slice(0,4)}-${datePart.slice(4,6)}-${datePart.slice(6,8)}`;
  if(!value.includes('T'))return{date,time:'09:00'};
  const timePart=value.split('T')[1].replace(/Z$/,'');
  if(value.endsWith('Z')){
    const parsed=new Date(`${date}T${timePart.slice(0,2)}:${timePart.slice(2,4)}:${timePart.slice(4,6)||'00'}Z`);
    if(!Number.isNaN(parsed.getTime()))return{date:[parsed.getFullYear(),String(parsed.getMonth()+1).padStart(2,'0'),String(parsed.getDate()).padStart(2,'0')].join('-'),time:`${String(parsed.getHours()).padStart(2,'0')}:${String(parsed.getMinutes()).padStart(2,'0')}`};
  }
  return{date,time:`${timePart.slice(0,2)||'09'}:${timePart.slice(2,4)||'00'}`};
}

export function parseIcs(text=''){
  const lines=unfoldLines(text).split('\n'),events=[];let current=null;
  lines.forEach(line=>{
    if(line.trim()==='BEGIN:VEVENT'){current={attendees:[],source:'Calendário'};return}
    if(line.trim()==='END:VEVENT'){if(current){const start=parseIcsDate(current.startRaw),end=parseIcsDate(current.endRaw);events.push({...current,sourceUid:current.sourceUid||`calendar-${current.title}-${start.date}-${start.time}`,date:start.date,time:start.time,endDate:end.date,endTime:end.time});delete events.at(-1).startRaw;delete events.at(-1).endRaw}current=null;return}
    if(!current)return;const property=splitIcsProperty(line);if(!property)return;
    if(property.key==='UID')current.sourceUid=unescapeIcs(property.value);
    if(property.key==='SUMMARY')current.title=unescapeIcs(property.value);
    if(property.key==='DESCRIPTION')current.description=unescapeIcs(property.value);
    if(property.key==='LOCATION')current.location=unescapeIcs(property.value);
    if(property.key==='DTSTART')current.startRaw=property.value;
    if(property.key==='DTEND')current.endRaw=property.value;
    if(property.key==='ATTENDEE'||property.key==='ORGANIZER'){
      const name=property.params.match(/CN=([^;:]+)/i)?.[1]?.replace(/^"|"$/g,'')||'',email=property.value.replace(/^mailto:/i,'').trim().toLowerCase();
      if(email)current.attendees.push({name:unescapeIcs(name),email});
    }
  });
  return events.filter(event=>event.title&&event.date);
}

export function parseEml(text=''){
  const normalizedText=String(text).replace(/\r\n/g,'\n'),separator=normalizedText.indexOf('\n\n'),headerText=separator>=0?normalizedText.slice(0,separator):normalizedText,rawBody=separator>=0?normalizedText.slice(separator+2):'';
  const headers={};unfoldLines(headerText).split('\n').forEach(line=>{const index=line.indexOf(':');if(index>0)headers[line.slice(0,index).trim().toLowerCase()]=line.slice(index+1).trim()});
  const encoding=normalized(headers['content-transfer-encoding']),contentType=headers['content-type']||'',boundary=contentType.match(/boundary="?([^";]+)"?/i)?.[1];let body=rawBody;
  if(boundary){const textPart=rawBody.split(`--${boundary}`).find(part=>/content-type:\s*text\/plain/i.test(part));if(textPart){const bodyIndex=textPart.replace(/\r\n/g,'\n').indexOf('\n\n');body=bodyIndex>=0?textPart.slice(bodyIndex+2):textPart}}
  if(encoding.includes('quoted-printable')||/=([0-9A-F]{2})/i.test(body))body=decodeQuotedPrintable(body);
  if(encoding.includes('base64'))body=decodeBase64(body);
  body=body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const parsedDate=new Date(headers.date||'');
  return{source:'E-mail',sourceUid:clean(headers['message-id']).replace(/[<>]/g,'')||`email-${clean(headers.subject)}-${headers.date||''}`,title:clean(headers.subject)||'E-mail sem assunto',from:parseAddress(headers.from),to:parseAddresses(headers.to),date:Number.isNaN(parsedDate.getTime())?new Date().toISOString():parsedDate.toISOString(),body};
}

export function matchClientForChannel(record,clients=[]){
  const people=record.attendees||[record.from,...(record.to||[])].filter(Boolean),emails=people.map(person=>normalized(person.email)).filter(Boolean),names=people.map(person=>normalized(person.name)).filter(Boolean);
  for(const client of clients){
    const clientEmails=[client.email,...(client.stakeholders||[]).map(item=>item.email)].map(normalized).filter(Boolean);
    if(clientEmails.some(email=>emails.includes(email)))return{client,confidence:'alta',reason:'E-mail exato'};
  }
  for(const client of clients){const name=normalized(client.name);if(name&&names.some(person=>person.includes(name)||name.includes(person)))return{client,confidence:'média',reason:'Nome reconhecido'}}
  for(const client of clients){const domain=emailDomain(client.email);if(domain&&!freeEmailDomains.has(domain)&&emails.some(email=>emailDomain(email)===domain))return{client,confidence:'média',reason:'Domínio da empresa'}}
  return{client:null,confidence:'baixa',reason:'Escolha o cliente'};
}

export function filterNewChannelRecords(records=[],existingIds=[]){const known=new Set(existingIds.filter(Boolean));return records.filter(record=>record.sourceUid&&!known.has(record.sourceUid)&&known.add(record.sourceUid))}
