import fs from 'node:fs';

const VERSION='109.8.0';
const BUILD='v109800-immutable-historical-evidence';
const path='source/src/modules/owneros/LoadFoldersV10969.jsx';
let src=fs.readFileSync(path,'utf8');

src=src.replace(/const VERSION='[^']+';/,`const VERSION='${VERSION}';`);

if(!src.includes('function docType(document={}')){
  src=src.replace(
    "function weekLabel(start=''){const a=new Date(`${start}T12:00:00`),b=new Date(a);b.setDate(a.getDate()+6);const sameMonth=a.getMonth()===b.getMonth();return `Week of ${a.toLocaleDateString(undefined,{month:'long',day:'numeric'})}${sameMonth?'–'+b.getDate():'–'+b.toLocaleDateString(undefined,{month:'long',day:'numeric'})}, ${b.getFullYear()}`;}",
    "function weekLabel(start=''){const a=new Date(`${start}T12:00:00`),b=new Date(a);b.setDate(a.getDate()+6);const sameMonth=a.getMonth()===b.getMonth();return `Week of ${a.toLocaleDateString(undefined,{month:'long',day:'numeric'})}${sameMonth?'–'+b.getDate():'–'+b.toLocaleDateString(undefined,{month:'long',day:'numeric'})}, ${b.getFullYear()}`;}\nfunction docType(document={}){return text(document.type||document.document_type||document.extracted?.type||document.classification?.selectedType).toLowerCase();}\nfunction docDate(document={}){return text(document.vaultDate||document.documentDate||document.document_date||document.extracted?.documentDate||document.extracted?.date||document.metadata?.logDate).slice(0,10);}\nfunction exactLoadDays(folder={}){return [...new Set([...(folder.days||[]),...(folder.events||[]).map(x=>String(x.day||'').slice(0,10)),...(folder.legs||[]).flatMap(x=>[x.pickupDay,x.deliveryDay,x.day]),...(folder.mileage?.linkedDays||[]),...(folder.mileage?.rows||[]).map(x=>String(x.day||'').slice(0,10))].filter(d=>/^\\d{4}-\\d{2}-\\d{2}$/.test(d)))].sort();}\nfunction snapshotDocuments(folder={},kind='logbook_snapshot'){const all=[...(folder.documents||[]),...((folder.supportingDocuments||[]).flatMap(g=>g.documents||[]))];return logicalDeduplicateDocumentsV10977(all.filter(d=>docType(d)===kind)).sort((a,b)=>docDate(a).localeCompare(docDate(b)));}\nfunction preferredSnapshot(folder={},kind='logbook_snapshot'){const docs=snapshotDocuments(folder,kind);if(!docs.length)return null;const days=exactLoadDays(folder),wanted=kind==='miles_snapshot'?(folder.mileage?.rows||[]).map(x=>String(x.day||'').slice(0,10)).filter(Boolean).at(-1):days.at(-1);return docs.find(d=>docDate(d)===wanted)||docs.at(-1);}" 
  );
}

src=src.replace(
  /useEffect\(\(\)=>\{const refresh=\(\)=>setRevision\(v=>v\+1\);window\.addEventListener\('road-ready-trailer-return-changed',refresh\);return\(\)=>window\.removeEventListener\('road-ready-trailer-return-changed',refresh\);\},\[\]\);/,
  "useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('road-ready-trailer-return-changed',refresh);window.addEventListener('road-ready-repair-applied',refresh);return()=>{window.removeEventListener('road-ready-trailer-return-changed',refresh);window.removeEventListener('road-ready-repair-applied',refresh);};},[]);"
);

src=src.replace(
  / function exactLoadDays\([\s\S]*?function completedActionLabel\(item\)\{[\s\S]*?\}\n/,
  " function openHistorical(folder,kind){return()=>{const snapshot=preferredSnapshot(folder,kind);if(snapshot)return openVaultDocumentV102(snapshot);const day=kind==='miles_snapshot'?((folder.mileage?.rows||[]).map(x=>x.day).filter(Boolean).at(-1)||exactLoadDays(folder).at(-1)):exactLoadDays(folder).at(-1);onOpenLog?.(day||'');};}\n function completedItemAction(item,folder){if(item.id==='rate'&&folder.rateCons?.[0])return()=>openVaultDocumentV102(folder.rateCons[0]);if(item.id==='bol'&&folder.bols?.[0])return()=>openVaultDocumentV102(folder.bols[0]);if(item.id==='pod'&&folder.pods?.[0])return()=>openVaultDocumentV102(folder.pods[0]);if(item.id==='logbook')return openHistorical(folder,'logbook_snapshot');if(item.id==='miles')return openHistorical(folder,'miles_snapshot');if(item.id==='fuel'&&folder.fuelDocs?.[0])return()=>openVaultDocumentV102(folder.fuelDocs[0]);return null;}\n function itemAction(item){if(item.id==='logbook')return openHistorical(open,'logbook_snapshot');if(item.id==='miles')return openHistorical(open,'miles_snapshot');if(item.id==='trailer_return')return()=>markTrailerReturnedV10976(open.loadNo,open.trailerId);return onScan;}\n function actionLabel(item){if(item.id==='logbook')return'Open Logbook';if(item.id==='miles')return'Open Miles';if(item.id==='trailer_return')return'Mark returned';return'Add';}\n function completedActionLabel(item){if(item.id==='rate')return'Open Rate Con';if(item.id==='bol')return'Open BOL';if(item.id==='pod')return'Open POD';if(item.id==='logbook')return'Open Logbook PDF';if(item.id==='miles')return'Open Miles PDF';if(item.id==='fuel')return'Open Fuel';return'Open';}\n"
);

src=src.replace(/<button type="button" onClick=\{openExactLog\(open,false\)\}>Open Logbook<\/button><button type="button" onClick=\{openExactLog\(open,true\)\}>Open Miles<\/button>/g,"<button type=\"button\" onClick={openHistorical(open,'logbook_snapshot')}>Open Logbook PDF</button><button type=\"button\" onClick={openHistorical(open,'miles_snapshot')}>Open Miles PDF</button>");
src=src.replace(/<details><summary>Operational Evidence<\/summary>/g,'<details open><summary>Historical Audit Evidence</summary>');
src=src.replace(/Cleanup migration v109\.7\.11 applied[^<]*/g,'Historical evidence v109.8.0 · Load-day PDF snapshots open from the load folder · Current day is never used as a fallback when a load date exists.');
src=src.replace(/<button type="button" onClick=\{onOpenLog\}>Open Logbook<\/button><button type="button" onClick=\{onOpenLog\}>Open Miles<\/button>/g,"<button type=\"button\" onClick={openHistorical(open,'logbook_snapshot')}>Open Logbook PDF</button><button type=\"button\" onClick={openHistorical(open,'miles_snapshot')}>Open Miles PDF</button>");

if(!src.includes("preferredSnapshot(folder,kind)")||!src.includes('Open Logbook PDF')||!src.includes("logbook_snapshot"))throw new Error('v109.8 historical snapshot finalizer failed');
fs.writeFileSync(path,src);

for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const data=JSON.parse(fs.readFileSync(p,'utf8'));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');}
const now=new Date().toISOString();
fs.writeFileSync('release-version.json',JSON.stringify({version:VERSION,build:BUILD,label:'v109.8 Immutable Historical Evidence'},null,2)+'\n');
fs.writeFileSync('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.8 Immutable Historical Evidence',force:true,notes:['Load folders open imported immutable Logbook PDF snapshots.','Daily Miles opens its historical PDF snapshot.','Live current-day Logbook is used only when no snapshot exists.']},null,2)+'\n');
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])if(fs.existsSync(p)){let s=fs.readFileSync(p,'utf8');s=s.replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`);fs.writeFileSync(p,s);}
let update=fs.readFileSync('source/src/core/update/appUpdate.js','utf8');update=update.replace(/const FALLBACK_APP_VERSION\s*=\s*['\"][^'\"]+['\"];?/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD\s*=\s*['\"][^'\"]+['\"];?/,`const FALLBACK_APP_BUILD = '${BUILD}';`).replace(/export const CURRENT_APP_VERSION\s*=\s*[^;]+;/,'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;').replace(/export const CURRENT_APP_BUILD\s*=\s*[^;]+;/,'export const CURRENT_APP_BUILD = FALLBACK_APP_BUILD;');fs.writeFileSync('source/src/core/update/appUpdate.js',update);
let sw=fs.readFileSync('public/sw.js','utf8');sw=sw.replace(/const OWNER_OP_SW_VERSION\s*=\s*['\"][^'\"]+['\"];?/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD\s*=\s*['\"][^'\"]+['\"];?/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);fs.writeFileSync('public/sw.js',sw);
console.log('PASS — v109.8 immutable historical evidence finalized');
