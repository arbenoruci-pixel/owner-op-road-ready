// Bounded, fail-closed reader for official Relay Payment Details and a normalized
// FirstLine event export. Never execute formulas, external links or macros.
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseUSDCents } from './intake-contract.js';
const MAX=3*1024*1024, MAX_UNPACK=16*1024*1024, MAX_ROWS=1000;
const bad=m=>{throw Error(m)};
const sha=b=>createHash('sha256').update(b).digest('hex');
const utf=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
const tidy=x=>String(x??'').trim();
const header=x=>tidy(x).toLowerCase().replace(/\s+/g,' ');
const identifier=x=>{x=tidy(x).toUpperCase();if(!/^[A-Z0-9][A-Z0-9._:-]{0,119}$/.test(x))bad('Invalid Relay identity');return x};
const optional=x=>tidy(x)?identifier(x):null;
function money(x){return parseUSDCents(tidy(x)||'0')}
function add(a,b){const n=a+b;if(!Number.isSafeInteger(n)||Math.abs(n)>100000000000)bad('Amount out of range');return n}
export function reportDate(x){
 x=tidy(x);let y,m,d;const iso=/^(\d{4})-(\d\d)-(\d\d)$/.exec(x), us=/^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(x);
 if(iso){[,y,m,d]=iso.map(Number)}else if(us){y=+us[3];m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(us[1])+1;d=+us[2]}else bad('Explicit report date required');
 if(y<2000||y>2100||m<1||m>12||d<1||d>31)bad('Invalid report date');
 const z=new Date(Date.UTC(y,m-1,d));if(z.getUTCMonth()!==m-1||z.getUTCDate()!==d)bad('Invalid calendar date');return z.toISOString().slice(0,10);
}
export function parseCSV(bytes){
 const s=utf(bytes).replace(/^\uFEFF/,'');if(s.includes('\0'))bad('Binary CSV');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const cell=()=>{if(field.length>16384||row.length>=128)bad('CSV cell limit');row.push(field);field='';closed=false};
 const line=()=>{cell();if(row.some(x=>x!==''))rows.push(row);row=[];if(rows.length>MAX_ROWS+20)bad('CSV row limit')};
 for(let i=0;i<s.length;i++){const c=s[i];if(quoted){if(c==='"'){if(s[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=c;continue}
 if(c===',' ){cell();continue}if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;line();continue}
 if(closed)bad('Unexpected text after quote');if(c==='"'){if(field)bad('Invalid CSV quoting');quoted=true}else field+=c;
 }if(quoted)bad('Unclosed CSV quote');if(field||row.length||closed)line();if(!rows.length)bad('Empty CSV');return rows;
}
// ZIP central directory is authoritative, with bounded inflate and strict
// member names. No extraction to disk, no Zip64, encryption, multi-disk archives.
function crc32(bytes){let n=0xffffffff;for(const x of bytes){n^=x;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return (n^0xffffffff)>>>0}
function zipParts(b){
 if(b.length<22||b.length>MAX||b.readUInt32LE(0)!==0x04034b50)bad('Invalid XLSX ZIP');
 let e=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50&&i+22+b.readUInt16LE(i+20)===b.length){e=i;break}
 if(e<0||b.readUInt16LE(e+4)||b.readUInt16LE(e+6))bad('Unsupported ZIP directory');
 const count=b.readUInt16LE(e+10),size=b.readUInt32LE(e+12),off=b.readUInt32LE(e+16);
 if(count>128||count!==b.readUInt16LE(e+8)||off+size!==e)bad('Invalid ZIP directory bounds');
 let p=off,total=0;const map=new Map(),regions=[];
 for(let i=0;i<count;i++){
 if(p+46>e||b.readUInt32LE(p)!==0x02014b50)bad('Invalid ZIP member');
 const flags=b.readUInt16LE(p+8),method=b.readUInt16LE(p+10),cs=b.readUInt32LE(p+20),us=b.readUInt32LE(p+24),nl=b.readUInt16LE(p+28),ex=b.readUInt16LE(p+30),cl=b.readUInt16LE(p+32),loc=b.readUInt32LE(p+42);
 if(flags&1||![0,8].includes(method)||p+46+nl+ex+cl>e||loc+30>off||us>MAX_UNPACK||(total+=us)>MAX_UNPACK)bad('Unsupported or oversized ZIP member');
 const expectedCRC=b.readUInt32LE(p+16);const name=utf(b.subarray(p+46,p+46+nl));p+=46+nl+ex+cl;
 if(!/^[A-Za-z0-9_./\[\]-]+$/.test(name)||name.startsWith('/')||name.split('/').some(x=>x==='..')||map.has(name)||/vbaProject|externalLinks|embeddings|activeX/i.test(name))bad('Unsafe XLSX member');
 if(b.readUInt32LE(loc)!==0x04034b50||b.readUInt16LE(loc+8)!==method||b.readUInt16LE(loc+6)!==flags)bad('ZIP local header mismatch');
 const ln=b.readUInt16LE(loc+26),le=b.readUInt16LE(loc+28),start=loc+30+ln+le;if(start+cs>off||utf(b.subarray(loc+30,loc+30+ln))!==name)bad('ZIP bounds mismatch');
 const raw=b.subarray(start,start+cs);const data=method===0?raw:inflateRawSync(raw,{maxOutputLength:Math.max(1,us)});
 if(data.length!==us||crc32(data)!==expectedCRC)bad('ZIP size/checksum mismatch');
 if(regions.some(([a,z])=>loc<z&&start+cs>a))bad('Overlapping ZIP members');regions.push([loc,start+cs]);map.set(name,data);
 }if(p!==e)bad('ZIP directory mismatch');return map;
}
function xml(s){if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<!--|<\?[^x]/i.test(s))bad('Unsafe XML');return s}
function unescapeXML(x){if(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(x))bad('Unknown XML entity');return x.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,m=>{const a={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(a[m])return a[m];const n=m[2]==='x'?parseInt(m.slice(3,-1),16):parseInt(m.slice(2,-1),10);if(!Number.isInteger(n)||n<32&&![9,10,13].includes(n)||n>0x10ffff||n>=0xd800&&n<=0xdfff)bad('Invalid XML character');return String.fromCodePoint(n)})}
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map(m=>[m[1],unescapeXML(m[2])]));
const strings=s=>[...s.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(m=>unescapeXML(m[1])).join('');
export function parseXLSX(bytes){
 const zip=zipParts(bytes),get=n=>{const p=zip.get(n);if(!p)bad('Missing XLSX part '+n);return xml(utf(p))};
 const book=get('xl/workbook.xml'),rels=get('xl/_rels/workbook.xml.rels');
 const sheets=[...book.matchAll(/<sheet\s([^>]*?)\/?>/g)].map(m=>attrs(m[1])).filter(a=>a.name==='Payment Details');
 if(sheets.length!==1)bad('Exactly one Payment Details sheet required');
 const rs=[...rels.matchAll(/<Relationship\s([^>]*?)\/?>/g)].map(m=>attrs(m[1])).filter(a=>a.Id===sheets[0]['r:id']);
 const r=rs[0];if(rs.length!==1||r.TargetMode==='External'||!r.Type?.endsWith('/worksheet')||!/^\/?(?:xl\/)?worksheets\/sheet\d+\.xml$/.test(r.Target))bad('Invalid worksheet target');
 const path=r.Target.replace(/^\//,'');const sheet=get(path.startsWith('xl/')?path:'xl/'+path);
 if(/<f(?:\s|>|\/)|<mergeCell\b/.test(sheet))bad('Formula or merged cells require a plain CSV export');
 const shared=zip.has('xl/sharedStrings.xml')?[...get('xl/sharedStrings.xml').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>strings(m[1])):[];
 if(shared.length>20000)bad('Shared strings limit');
 const rows=[];for(const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
 const row=[];for(const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
 const a=attrs(cm[1]);const pos=/^([A-Z]{1,3})[1-9]\d*$/.exec(a.r||'');if(!pos)bad('Invalid cell reference');let idx=0;for(const c of pos[1])idx=idx*26+c.charCodeAt(0)-64;idx--;
 if(idx>=128||row[idx]!==undefined)bad('Invalid or duplicate column');const v=/<v>([^<]*)<\/v>/.exec(cm[2]||'')?.[1];
 if(a.t==='s'){if(v===undefined||!/^\d+$/.test(v)||!Number.isSafeInteger(+v)||shared[+v]===undefined)bad('Invalid shared string');row[idx]=shared[+v]}
 else if(a.t==='inlineStr')row[idx]=strings(cm[2]||'');
 else if(!a.t||a.t==='n'||a.t==='str')row[idx]=v===undefined?'':unescapeXML(v);
 else if(v!==undefined)bad('Unsupported typed cell');else row[idx]='';
 }if(row.some(x=>tidy(x)))rows.push(Array.from({length:row.length},(_,i)=>row[i]??''));if(rows.length>MAX_ROWS+20)bad('XLSX row limit')
 }if(!rows.length)bad('Empty Payment Details');return rows;
}
function columns(rows,required){const h=rows[0].map(header);if(new Set(h.filter(Boolean)).size!==h.filter(Boolean).length)bad('Duplicate report headers');for(const k of required)if(!h.includes(k))bad('Missing report column: '+k);return (r,k)=>tidy(r[h.indexOf(k)]);}
const components=['base rate','fuel surcharge','tolls','detention','tonu','others'];
export function parseAmazon(bytes,format){
 const rows=format==='xlsx'?parseXLSX(bytes):format==='csv'?parseCSV(bytes):bad('Unsupported Relay format');
 const value=columns(rows,['invoice number','block id','trip id','load id','end date','item type','gross pay',...components]);
 const groups=new Map(),lines=new Map(),issues=[];let reportTotal=0,skippedFooter=0,declaredTotal=null,paymentReportedOn=null;
 for(let i=1;i<rows.length;i++){const r=rows[i],invoice=value(r,'invoice number'),trip=optional(value(r,'trip id')),block=optional(value(r,'block id')),load=optional(value(r,'load id')),kind=value(r,'item type').toUpperCase();
 if(!invoice&&!trip&&!block&&!load&&!kind){
   const gross=value(r,'gross pay');
   const other=value(r,'others'),paid=/^Paid\s+([A-Za-z]{3} \d{1,2}, \d{4}|\d{4}-\d\d-\d\d)$/i.exec(other);
   if(paid&&!gross&&components.filter(k=>k!=='others').every(k=>!value(r,k)||money(value(r,k))===0)){
    if(paymentReportedOn!==null)bad('Multiple Relay payment date footers');paymentReportedOn=reportDate(paid[1]);
   }else if(gross){
    if(declaredTotal!==null)bad('Multiple Relay totals');declaredTotal=money(gross);
   }else if(components.some(k=>value(r,k))){
    // Non-detail footer metadata is retained in the archived original. Never
    // interpret a footer description or unknown adjustment as a load amount.
    issues.push({row:i+1,reason:'Non-payable footer/other amount requires review'});
   }
   skippedFooter++;continue;
 }
 if(!invoice||!kind||!trip&&!block&&!load)bad('Incomplete Relay detail row '+(i+1));
 const eventDate=reportDate(value(r,'end date')),status=/(?:^| - )TONU$/.test(kind)||kind==='TONU'?'TONU':/(?:^| - )PAID$/.test(kind)?'PAID':/(?:^| - )COMPLETED$/.test(kind)?'COMPLETED':'OTHER';
 const cents=money(value(r,'gross pay'));let sum=0;const parts={};for(const k of components){parts[k]=money(value(r,k));sum=add(sum,parts[k]);}
 if(sum!==cents)bad('Relay component total mismatch at row '+(i+1));
 const key=trip?'TRIP:'+trip:block?'BLOCK:'+block:'LOAD:'+load;
 const line=JSON.stringify([invoice,block,trip,load,kind]);const signature=JSON.stringify([eventDate,cents,parts]);
 if(lines.has(line)){if(lines.get(line)!==signature)bad('Conflicting Relay line identity');continue}lines.set(line,signature);
 reportTotal=add(reportTotal,cents);
 const g=groups.get(key)||{trip,block,load:trip||block?null:load,status,amount_cents:0,event_date:eventDate,line_count:0,parts:Object.fromEntries(components.map(k=>[k,0])),review_reason:null,invoice_ref:invoice};
 if(g.invoice_ref!==invoice)g.review_reason='Multiple invoice references for canonical payout; owner review';
 if(g.block!==block||g.status==='TONU'&&status!=='TONU'||status==='TONU'&&g.status!=='TONU'||g.status==='OTHER'||status==='OTHER')g.review_reason='Conflicting or unsupported Relay line status';
 if(status==='OTHER')g.review_reason='Unsupported Relay item type';if(cents<0)g.review_reason='Negative correction requires owner review';
 if(g.status==='COMPLETED'&&status==='PAID')g.status='PAID';
 g.amount_cents=add(g.amount_cents,cents);g.event_date=g.event_date>eventDate?g.event_date:eventDate;g.line_count++;for(const k of components)g.parts[k]=add(g.parts[k],parts[k]);groups.set(key,g);
 }
 if(!groups.size)bad('No Relay detail rows');
 if(declaredTotal!==null&&declaredTotal!==reportTotal)bad('Relay report footer does not reconcile');
 const blocked=new Set([...groups.values()].filter(g=>g.trip&&g.block).map(g=>g.block));
 for(const g of groups.values())if(g.block&&blocked.has(g.block)&&groups.has('BLOCK:'+g.block))g.review_reason='Block and child trip overlap; owner review';
 return {rows:[...groups.values()],reportTotalCents:reportTotal,lineCount:lines.size,skippedFooter,paymentReportedOn,issues};
}
const eventTypes=new Set(['INVOICE','FUNDING','FEE','DEBIT','CREDIT','REJECTION','REVERSAL']);
export function parseFirstLine(bytes){
 const rows=parseCSV(bytes);
 // Explicit normalized export contract, no guessed event types or signs.
 const v=columns(rows,['event type','event id','event date','amount','invoice number','reverses event id']);
 const out=[],seen=new Map();
 for(let i=1;i<rows.length;i++){
 const type=v(rows[i],'event type').toUpperCase(),reference=identifier(v(rows[i],'event id')),invoice=identifier(v(rows[i],'invoice number')),rev=optional(v(rows[i],'reverses event id')),date=v(rows[i],'event date');
 if(!eventTypes.has(type)||type==='REVERSAL'&&!rev||type!=='REVERSAL'&&rev||rev===reference)bad('Invalid FirstLine event or reversal at row '+(i+1));
 // Calendar date means explicit UTC midnight with precision retained in source.
 const at=/^\d{4}-\d\d-\d\d$/.test(date)?reportDate(date)+'T00:00:00Z':date;
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(at)||!Number.isFinite(Date.parse(at)))bad('FirstLine event date needs timezone');
 reportDate(at.slice(0,10));if(!v(rows[i],'amount'))bad('Missing FirstLine amount');
 const r={type,reference,invoice,reverses:rev,event_at:new Date(at).toISOString(),amount_cents:money(v(rows[i],'amount'))};
 const k=reference+'|'+type,s=JSON.stringify(r);if(seen.has(k)){if(seen.get(k)!==s)bad('Conflicting FirstLine event identity');continue}seen.set(k,s);out.push(r);
 }if(!out.length)bad('No FirstLine events');return {rows:out};
}
export const reportDigest=sha;
