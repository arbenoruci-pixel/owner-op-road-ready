'use client';

const KEY='road_ready_repair_overlay_v1';
const HISTORY='road_ready_repair_history_v1';
function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function upper(v=''){return text(v).toUpperCase();}
function safeJson(raw){try{return JSON.parse(raw);}catch{return null;}}
function bytesToText(bytes){return new TextDecoder().decode(bytes);}
function normalizePlan(input={}){
  const plan=input.repairPlan||input.repair_plan||input;
  if(!plan||typeof plan!=='object') throw new Error('Repair plan is not valid JSON.');
  const version=text(plan.schema||plan.type||plan.format);
  if(version&&!/road[_-]?ready[_-]?repair/i.test(version)) throw new Error('This file is not a Road Ready repair plan.');
  const documentAssignments=(plan.documentAssignments||plan.document_assignments||[]).map(x=>({documentId:text(x.documentId||x.document_id||x.id),loadNo:upper(x.loadNo||x.load_no),documentType:text(x.documentType||x.document_type).toLowerCase(),stopSequence:Number(x.stopSequence||x.stop_sequence||0)||0,documentDate:text(x.documentDate||x.document_date).slice(0,10),ignore:!!x.ignore})).filter(x=>x.documentId);
  const loadCorrections=(plan.loadCorrections||plan.load_corrections||[]).map(x=>({loadNo:upper(x.loadNo||x.load_no),origin:text(x.origin),destination:text(x.destination),broker:text(x.broker),deliveryStops:Number(x.deliveryStops||x.delivery_stops||0)||0,legacy:!!x.legacy,ignore:!!x.ignore,aliasFrom:upper(x.aliasFrom||x.alias_from)})).filter(x=>x.loadNo||x.aliasFrom);
  return {schema:'road_ready_repair_v1',createdAt:text(plan.createdAt||plan.created_at)||new Date().toISOString(),source:text(plan.source)||'import',notes:Array.isArray(plan.notes)?plan.notes.map(text).filter(Boolean):[],documentAssignments,loadCorrections};
}
async function gunzip(bytes){
  if(typeof DecompressionStream==='undefined') throw new Error('This iPhone version cannot open .tar.gz directly. Import the repair-plan.json from the package.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function parseTar(bytes){
  const files=new Map(); let offset=0;
  while(offset+512<=bytes.length){
    const header=bytes.slice(offset,offset+512); if(header.every(v=>v===0)) break;
    const name=bytesToText(header.slice(0,100)).replace(/\0.*$/,'');
    const sizeText=bytesToText(header.slice(124,136)).replace(/\0.*$/,'').trim();
    const size=parseInt(sizeText||'0',8)||0; const start=offset+512; const end=start+size;
    if(name) files.set(name,bytes.slice(start,end));
    offset=start+Math.ceil(size/512)*512;
  }
  return files;
}
function auditPreview(files){
  const names=[...files.keys()];
  const reportName=names.find(n=>/audit[-_]?report\.json$/i.test(n))||names.find(n=>/report\.json$/i.test(n));
  const manifestName=names.find(n=>/manifest\.json$/i.test(n));
  const repairName=names.find(n=>/repair[-_]?plan\.json$/i.test(n));
  const report=reportName?safeJson(bytesToText(files.get(reportName))):null;
  const manifest=manifestName?safeJson(bytesToText(files.get(manifestName))):null;
  const plan=repairName?normalizePlan(safeJson(bytesToText(files.get(repairName)))):null;
  return {kind:'audit',fileCount:names.length,originalCount:names.filter(n=>/originals\//i.test(n)).length,report,manifest,plan,names};
}
export async function inspectRepairImportV10975(file){
  const name=text(file?.name).toLowerCase(); if(!file) throw new Error('Choose a file first.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(name.endsWith('.json')){const parsed=safeJson(bytesToText(bytes));if(!parsed)throw new Error('JSON file could not be read.');return {kind:'repair',plan:normalizePlan(parsed),fileName:file.name};}
  if(name.endsWith('.tar.gz')||name.endsWith('.tgz')) return {...auditPreview(parseTar(await gunzip(bytes))),fileName:file.name};
  throw new Error('Use a Road Ready .json repair plan or .tar.gz audit package.');
}
export function readRepairOverlayV10975(){if(typeof window==='undefined')return {documentAssignments:[],loadCorrections:[]};return safeJson(localStorage.getItem(KEY))||{documentAssignments:[],loadCorrections:[]};}
export function applyRepairPlanV10975(plan){
  if(typeof window==='undefined') throw new Error('Repair import only works in the app.');
  const normalized=normalizePlan(plan); const previous=localStorage.getItem(KEY)||'';
  const history=safeJson(localStorage.getItem(HISTORY))||[]; history.unshift({at:new Date().toISOString(),previous,plan:normalized}); localStorage.setItem(HISTORY,JSON.stringify(history.slice(0,10)));
  const current=readRepairOverlayV10975();
  const docMap=new Map((current.documentAssignments||[]).map(x=>[x.documentId,x])); normalized.documentAssignments.forEach(x=>docMap.set(x.documentId,{...(docMap.get(x.documentId)||{}),...x}));
  const loadMap=new Map((current.loadCorrections||[]).map(x=>[x.loadNo||x.aliasFrom,x])); normalized.loadCorrections.forEach(x=>loadMap.set(x.loadNo||x.aliasFrom,{...(loadMap.get(x.loadNo||x.aliasFrom)||{}),...x}));
  const next={schema:'road_ready_repair_overlay_v1',updatedAt:new Date().toISOString(),documentAssignments:[...docMap.values()],loadCorrections:[...loadMap.values()]};
  localStorage.setItem(KEY,JSON.stringify(next)); window.dispatchEvent(new CustomEvent('road-ready-repair-applied',{detail:{summary:{documents:normalized.documentAssignments.length,loads:normalized.loadCorrections.length}}})); return next;
}
export function undoLastRepairV10975(){
  if(typeof window==='undefined')return false; const history=safeJson(localStorage.getItem(HISTORY))||[]; const last=history.shift(); if(!last)return false;
  if(last.previous)localStorage.setItem(KEY,last.previous);else localStorage.removeItem(KEY); localStorage.setItem(HISTORY,JSON.stringify(history)); window.dispatchEvent(new Event('road-ready-repair-applied')); return true;
}
export function repairSummaryV10975(plan={}){const p=normalizePlan(plan);return {documents:p.documentAssignments.length,loads:p.loadCorrections.length,ignoredDocuments:p.documentAssignments.filter(x=>x.ignore).length,legacyLoads:p.loadCorrections.filter(x=>x.legacy).length,stopCorrections:p.loadCorrections.filter(x=>x.deliveryStops>0).length};}
