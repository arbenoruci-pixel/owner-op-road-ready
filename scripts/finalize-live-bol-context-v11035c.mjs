import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION='110.3.5';
const BUILD='v110305-live-bol-context';
const read=path=>fs.readFileSync(path,'utf8');
const write=(path,value)=>fs.writeFileSync(path,value);
function once(source,before,after,label){
  if(source.includes(after)) return source;
  const count=source.split(before).length-1;
  assert.equal(count,1,`110.3.5 anchor changed: ${label}; found ${count}`);
  return source.replace(before,after);
}

{
  const path='source/src/modules/scan/liveBolContextV11035.js';
  const lines=[
    "import { truckDocumentTypeMetaV1040 } from './truckDocumentCatalogV1040.js';",
    '',
    "function clean(value=''){return String(value??'').trim();}",
    "function ref(value=''){const raw=clean(value).toUpperCase().replace(/\\s+/g,'').replace(/[^A-Z0-9._/-]/g,'');if(!raw||raw.length<3||raw.length>32||!/\\d/.test(raw))return '';if(/^(?:LIVE|EVENT|GPS|ROUTE|EV)[_-]/i.test(raw))return '';return raw;}",
    "function reasonText(event={}){return [event.note,event.description,event.reason,...(Array.isArray(event.reasons)?event.reasons:[])].filter(Boolean).join(' ');}",
    "function documentDate(result={}){const f=result.fields||{};return clean(f.documentDate||f.date||f.pickupDate||f.deliveryDate||f.workDate);}",
    "function strongRateCon(result={}){const f=result.fields||{};const text=[result.text,result.rawText,result.ocrText,result.analysisText,f.title,f.documentTitle].filter(Boolean).join(' ');return /carrier\\s+rate\\s+confirmation|rate\\s+confirmation(?:\\s+agreement)?|total\\s+(?:carrier\\s+)?pay|all[- ]?in\\s+rate|agreed\\s+rate|line\\s*haul|linehaul|fuel\\s+surcharge|carrier\\s+compensation|sign\\s*(?:&|and)\\s*return/i.test(text);}",
    '',
    'export function currentLiveBolContextV11035(state={}){',
    "  const days=Object.keys(state.eventsByDay||{}).sort();",
    "  const day=clean(state.activeDay)||days.at(-1)||'';",
    "  const rows=[...(state.eventsByDay?.[day]||[])].filter(Boolean).sort((a,b)=>Number(a.startMin||0)-Number(b.startMin||0));",
    "  const event=[...rows].reverse().find(row=>row.status==='ON'&&/(?:pickup|pick up|hook|loading)/i.test(reasonText(row))&&ref(row.bol||row.shippingDocs||row.loadNo));",
    "  if(!event)return null;",
    "  const loadNo=ref(event.bol||event.shippingDocs||event.loadNo);",
    "  if(!loadNo)return null;",
    "  return {loadNo,day,eventId:clean(event.id),origin:[clean(event.city),clean(event.state).toUpperCase()].filter(Boolean).join(', '),destination:clean(event.destination||[event.destinationCity,event.destinationState].filter(Boolean).join(', '))};",
    '}',
    '',
    'export function applyLiveBolContextV11035(result={},state={}){',
    "  const typeId=clean(result.type?.id||result.detectedType?.id||'other');",
    "  if(!['rate_confirmation','other'].includes(typeId))return result;",
    '  const context=currentLiveBolContextV11035(state);',
    '  if(!context)return result;',
    "  const weak=result.needsReview===true||Number(result.confidence||0)<.85||!documentDate(result);",
    '  if(!weak||strongRateCon(result))return result;',
    "  const type=truckDocumentTypeMetaV1040('bol');",
    '  const current=result.fields||{};',
    "  const date=documentDate(result)||context.day||'';",
    "  const fields={...current,loadNo:context.loadNo,bolNo:ref(current.bolNo)||context.loadNo,documentDate:date,date:date||current.date||'',origin:current.origin||context.origin||'',destination:current.destination||context.destination||''};",
    "  return {...result,type,detectedType:type,fields,needsReview:true,method:String(result.method||'')+'+live-bol-context-v11035',liveBolContextV11035:{loadNo:context.loadNo,day:context.day,eventId:context.eventId}};",
    '}',
    ''
  ];
  write(path,lines.join('\n'));
}

{
  const path='source/src/modules/scan/SmartScanSheetV105.jsx';
  let source=read(path);
  const importLine="import { applyLiveBolContextV11035 } from './liveBolContextV11035.js';";
  if(!source.includes(importLine)){
    const firstImport=source.match(/^import[^\n]+\n/m)?.[0];
    assert.ok(firstImport,'110.3.5 scanner first import missing');
    source=source.replace(firstImport,firstImport+importLine+'\n');
  }
  source=once(source,
    "  function applyResult(result, preferredLoadNo = '') {\n    const typeId = result.type?.id || 'other';",
    "  function applyResult(result, preferredLoadNo = '') {\n    result = applyLiveBolContextV11035(result, state);\n    const typeId = result.type?.id || 'other';",
    'contextualize scan result');
  const oldReason="            {match?.reason ? <em>{selectedLoadNo === match.loadNo ? match.reason : 'Driver-selected load folder'}</em> : null}";
  const newReason="            {analysis?.liveBolContextV11035 ? <em>Current live pickup BOL · verify before saving</em> : match?.reason ? <em>{selectedLoadNo === match.loadNo ? match.reason : 'Driver-selected load folder'}</em> : null}";
  if(source.includes(oldReason)||source.includes(newReason)) source=once(source,oldReason,newReason,'context explanation');
  write(path,source);
}

for(const path of ['package.json','package-lock.json'])if(fs.existsSync(path)){
  const data=JSON.parse(read(path));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;write(path,JSON.stringify(data,null,2)+'\n');
}
const releasedAt=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(read(path));Object.assign(meta,{version:VERSION,build:BUILD,force:true,releasedAt,updatedAt:releasedAt,label:'v110.3.5 Live BOL Context Recovery',notes:['Weak Rate Confirmation/Other results during the active pickup are re-evaluated against the current live BOL before confirmation.','The current live pickup BOL supplies load identity and pickup-day date only when scanner evidence is weak.','Strong Rate Confirmations and every other confident document type remain isolated.']});write(path,JSON.stringify(meta,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=read(path);source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);write(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])write(path,read(path).replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`));
const lockPath='module-locks.v1.json';if(fs.existsSync(lockPath)){const locks=JSON.parse(read(lockPath));locks.release=VERSION;write(lockPath,JSON.stringify(locks,null,2)+'\n');}
console.log('PASS — 110.3.5 live BOL context recovery applied');
