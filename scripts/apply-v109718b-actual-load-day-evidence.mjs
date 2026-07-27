import fs from 'node:fs';
const VERSION='109.7.18';
const BUILD='v109718-actual-load-day-evidence';
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,v)=>fs.writeFileSync(p,v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');

const evidencePath='source/src/modules/owneros/loadEvidenceV10976.js';
let evidence=read(evidencePath);
evidence=evidence.replace("function explicitDay(obj={}){for(const value of [obj.logDate,obj.log_date,obj.eventDate,obj.event_date,obj.dutyDate,obj.duty_date,obj.day,obj.date,obj.serviceDate,obj.service_date]){const d=day(value);if(d)return d;}return '';} ".trim(),"export function actualEvidenceDayV109718(obj={},containerDay=''){for(const value of [obj.logDate,obj.log_date,obj.eventDate,obj.event_date,obj.dutyDate,obj.duty_date,obj.serviceDate,obj.service_date,obj.pickupDay,obj.pickupDate,obj.deliveryDay,obj.deliveryDate,obj.completedDate,obj.deliveredAt,obj.completedAt,obj.transactionDate,obj.postedAt,obj.date,obj.day]){const d=day(value);if(d)return d;}return day(containerDay);}");
evidence=evidence.replaceAll('explicitDay(record)||day(containerDay)','actualEvidenceDayV109718(record,containerDay)');
evidence=evidence.replaceAll('explicitDay(value)||day(containerDay)','actualEvidenceDayV109718(value,containerDay)');
evidence=evidence.replaceAll('explicitDay(value)||day(key)','actualEvidenceDayV109718(value,key)');
evidence=evidence.replaceAll('explicitDay(value)||day(date)','actualEvidenceDayV109718(value,date)');
evidence=evidence.replaceAll('add(explicitDay(row),row','add(actualEvidenceDayV109718(row),row');
if(!evidence.includes('actualEvidenceDayV109718'))throw new Error('actual day patch failed');
write(evidencePath,evidence);

const enginePath='source/src/modules/owneros/loadFolderEngineV10969.js';
let engine=read(enginePath);
engine=engine.replace("import { mileageEvidenceForLoadV10976, trailerReturnEvidenceV10976 } from './loadEvidenceV10976.js';","import { actualEvidenceDayV109718, mileageEvidenceForLoadV10976, trailerReturnEvidenceV10976 } from './loadEvidenceV10976.js';");
engine=engine.replace(/function loadEvents\(state=\{\},loadNo=''\)\{[^\n]+\}/,"function loadEvents(state={},loadNo=''){const t=upper(loadNo);return Object.entries(state.eventsByDay||{}).flatMap(([container,events])=>(events||[]).filter(e=>refs(e).includes(t)).map(e=>({...e,day:actualEvidenceDayV109718(e,container)}))).filter(e=>e.day);}");
engine=engine.replace(/function loadRouteLegs\(state=\{\},loadNo=''\)\{[^\n]+\}/,"function loadRouteLegs(state={},loadNo=''){const t=upper(loadNo);return Object.entries(state.routeLegsByDay||{}).flatMap(([container,legs])=>(legs||[]).filter(l=>refs(l).includes(t)).map(l=>({...l,day:actualEvidenceDayV109718(l,container)}))).filter(l=>l.day);}");
engine=engine.replace("const operationalDays=unique([...events.map(e=>e.day),...legs.map(l=>l.day)]).sort(),days=unique([...operationalDays,...docs.map(docDay)]).sort();","const loadDates=[load.pickupDate,load.pickupDay,load.deliveryDate,load.deliveryDay,load.completedDate,load.deliveredAt,load.completedAt].map(date).filter(Boolean);const operationalDays=unique([...events.map(e=>e.day),...legs.map(l=>l.day),...loadDates]).sort(),days=unique([...operationalDays,...docs.map(docDay)]).sort();");
engine=engine.replace(/export const LOAD_FOLDER_ENGINE_VERSION_V10969 = '[^']+';/,"export const LOAD_FOLDER_ENGINE_VERSION_V10969 = '109.7.18';");
if(!engine.includes('day:actualEvidenceDayV109718(e,container)'))throw new Error('event date patch failed');
write(enginePath,engine);

const auditPath='source/src/modules/owneros/DotAuditCenterV109714.jsx';
let audit=read(auditPath);
if(!audit.includes("import { reconcileLoadFoldersV10974 }"))audit=audit.replace("import { openVaultDocumentV102, vaultDocumentLoadNoV102, vaultDocumentTypeV102 } from './documentVaultV102.js';","import { openVaultDocumentV102, vaultDocumentTypeV102 } from './documentVaultV102.js';\nimport { reconcileLoadFoldersV10974 } from './loadFolderReconciliationV10974.js';");
const start=audit.indexOf('export function buildDotAuditDaysV109714');
const end=audit.indexOf('\nexport default function DotAuditCenterV109714',start);
if(start<0||end<0)throw new Error('audit builder anchors missing');
const builder=`export function buildDotAuditDaysV109714({state={},loads=[],documents=[],businessStore={},ownerStore={}}={}){
 const model=reconcileLoadFoldersV10974({loads,documents,state,businessStore});
 const invoices=[...(ownerStore.invoices||[]),...(businessStore.invoices||[])];
 const inspections=state.inspectionByDay||state.inspectionsByDay||{};
 const rows=[];
 for(const folder of model.folders||[]){
  const activeDays=[...new Set([...(folder.days||[]),...(folder.mileage?.linkedDays||[])].map(day).filter(Boolean))].sort();
  for(const dateKey of activeDays){
   const mileageRows=(folder.mileage?.rows||[]).filter(r=>day(r.day)===dateKey);
   const mileage={total:mileageRows.reduce((s,r)=>s+Number(r.miles||0),0),rows:mileageRows};
   const docs=folder.documents||[];
   const types=docs.map(vaultDocumentTypeV102);
   const invoiceRows=invoices.filter(x=>String(x.loadNo||x.load_no||'').trim().toUpperCase()===folder.loadNo);
   const eventRows=(folder.events||[]).filter(e=>day(e.day)===dateKey);
   const routeRows=(folder.legs||[]).filter(l=>day(l.day)===dateKey);
   const inspectionRows=Array.isArray(inspections[dateKey])?inspections[dateKey]:inspections[dateKey]?[inspections[dateKey]]:[];
   rows.push({date:dateKey,loadNo:folder.loadNo,load:folder,folder,docs,fuelRows:folder.fuelRows||[],invoiceRows,eventRows,routeRows,inspectionRows,mileage,counts:{rate:types.filter(t=>t==='rate_confirmation').length,bol:types.filter(t=>t==='bol').length,pod:types.filter(t=>t==='pod').length,fuel:(folder.fuelRows||[]).length+types.filter(t=>t==='fuel_receipt').length,invoice:invoiceRows.length+types.filter(t=>t==='invoice').length,inspection:inspectionRows.length+types.filter(t=>t==='inspection').length}});
  }
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.loadNo.localeCompare(b.loadNo));
}`;
audit=audit.slice(0,start)+builder+audit.slice(end);
audit=audit.replace("const mileage=state.dailyMilesByDay?.[base.date]||state.manualMilesByDay?.[base.date]||{};",'');
if(!audit.includes('reconcileLoadFoldersV10974'))throw new Error('audit reconciliation patch failed');
write(auditPath,audit);

for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
 if(!fs.existsSync(path))continue;
 let source=read(path);
 source=source.replace(/App v109\.7\.1[3-7]/g,'App v109.7.18').replace(/APP V109\.7\.1[3-7]/g,'APP V109.7.18').replace(/v109\.7\.1[3-7]/g,'v109.7.18');
 write(path,source);
}

for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const data=JSON.parse(read(p));data.version=VERSION;data.engines={...(data.engines||{}),node:'24.x'};if(data.packages?.['']){data.packages[''].version=VERSION;data.packages[''].engines={...(data.packages[''].engines||{}),node:'24.x'};}writeJson(p,data);}
const now=new Date().toISOString();
writeJson('release-version.json',{version:VERSION,build:BUILD,label:'v109.7.18 Actual Load-Day Evidence'});
writeJson('public/app-version.json',{version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.18 Actual Load-Day Evidence',force:true,notes:['Miles attach only to the actual date stored on the load event, route leg or Logbook record.','DOT day view uses the reconciled load folder so Rate Con, BOL, POD, fuel and billing appear together.','Today is never substituted when a historical load event has its own date.']});
let update=read('source/src/core/update/appUpdate.js');update=update.replace(/const FALLBACK_APP_VERSION\s*=\s*['"][^'"]+['"];?/,"const FALLBACK_APP_VERSION = '109.7.18';").replace(/const FALLBACK_APP_BUILD\s*=\s*['"][^'"]+['"];?/,"const FALLBACK_APP_BUILD = 'v109718-actual-load-day-evidence';");write('source/src/core/update/appUpdate.js',update);
let sw=read('public/sw.js');sw=sw.replace(/const OWNER_OP_SW_VERSION\s*=\s*['"][^'"]+['"];?/,"const OWNER_OP_SW_VERSION = '109.7.18';").replace(/const OWNER_OP_SW_BUILD\s*=\s*['"][^'"]+['"];?/,"const OWNER_OP_SW_BUILD = 'v109718-actual-load-day-evidence';");write('public/sw.js',sw);
console.log('PASS — v109.7.18 actual load-day evidence applied last');
