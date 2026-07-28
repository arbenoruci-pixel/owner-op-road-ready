import fs from 'node:fs';

const VERSION='109.8.1';
const BUILD='v109801-full-historical-logbooks';
const path='source/src/modules/owneros/LoadFoldersV10969.jsx';
let src=fs.readFileSync(path,'utf8');

src=src.replace(/const VERSION='[^']+';/,`const VERSION='${VERSION}';`);

const importLine="import { historicalLogbookDatesV10981, openHistoricalLogbookPdfV10981, openAllHistoricalLogbooksPdfV10981, rebuildHistoricalLogbooksV10981 } from './historicalLogbookV10981.js';";
if(!src.includes(importLine))src=src.replace("import { normalizedDocumentTypeV10977, logicalDeduplicateDocumentsV10977 } from './supportingDocumentsV10977.js';",`import { normalizedDocumentTypeV10977, logicalDeduplicateDocumentsV10977 } from './supportingDocumentsV10977.js';\n${importLine}`);

src=src.replace(
 / function openHistorical\(folder,kind\)\{[\s\S]*? function completedActionLabel\(item\)\{[\s\S]*?\}\n/,
 ` function openHistoricalMiles(folder){return()=>{const snapshot=preferredSnapshot(folder,'miles_snapshot');if(snapshot)return openVaultDocumentV102(snapshot);};}\n function openHistoricalLogbookDay(folder,day){return()=>openHistoricalLogbookPdfV10981({state,folder,day});}\n function openAllHistoricalLogbooks(folder){return()=>openAllHistoricalLogbooksPdfV10981({state,folder});}\n function rebuildHistoricalLogbooks(){const results=rebuildHistoricalLogbooksV10981({state,folders});const created=results.filter(row=>row.status==='created').length,unchanged=results.filter(row=>row.status==='unchanged').length,failed=results.filter(row=>row.status==='failed').length;setAuditMessage(\`Historical Logbooks rebuilt: \${created} created, \${unchanged} unchanged, \${failed} failed.\`);setRevision(value=>value+1);}\n function completedItemAction(item,folder){if(item.id==='rate'&&folder.rateCons?.[0])return()=>openVaultDocumentV102(folder.rateCons[0]);if(item.id==='bol'&&folder.bols?.[0])return()=>openVaultDocumentV102(folder.bols[0]);if(item.id==='pod'&&folder.pods?.[0])return()=>openVaultDocumentV102(folder.pods[0]);if(item.id==='logbook'){const days=historicalLogbookDatesV10981(folder);return days.length>1?openAllHistoricalLogbooks(folder):days[0]?openHistoricalLogbookDay(folder,days[0]):null;}if(item.id==='miles')return openHistoricalMiles(folder);if(item.id==='fuel'&&folder.fuelDocs?.[0])return()=>openVaultDocumentV102(folder.fuelDocs[0]);return null;}\n function itemAction(item){if(item.id==='logbook'){const days=historicalLogbookDatesV10981(open);return days.length>1?openAllHistoricalLogbooks(open):days[0]?openHistoricalLogbookDay(open,days[0]):null;}if(item.id==='miles')return openHistoricalMiles(open);if(item.id==='trailer_return')return()=>markTrailerReturnedV10976(open.loadNo,open.trailerId);return onScan;}\n function actionLabel(item){if(item.id==='logbook')return'Open Historical Logbook';if(item.id==='miles')return'Open Miles';if(item.id==='trailer_return')return'Mark returned';return'Add';}\n function completedActionLabel(item){if(item.id==='rate')return'Open Rate Con';if(item.id==='bol')return'Open BOL';if(item.id==='pod')return'Open POD';if(item.id==='logbook')return'Open Historical Logbook';if(item.id==='miles')return'Open Miles PDF';if(item.id==='fuel')return'Open Fuel';return'Open';}\n`
);

src=src.replace(/<details open><summary>Historical Audit Evidence<\/summary><div className="load-folder-actions-v10969">[\s\S]*?<\/div><\/details>/,
`<details open><summary>Historical Audit Evidence</summary><div className="load-folder-historical-v10981"><section><b>Supporting Logbook</b>{historicalLogbookDatesV10981(open).length?<>{historicalLogbookDatesV10981(open).map(day=><div className="load-folder-historical-row-v10981" key={day}><span>{day}</span><button type="button" onClick={openHistoricalLogbookDay(open,day)}>Open PDF</button></div>)}{historicalLogbookDatesV10981(open).length>1?<button type="button" onClick={openAllHistoricalLogbooks(open)}>Open All Logbooks</button>:null}</>:<span>No historical Logbook linked</span>}</section><section><b>Daily Driving Miles</b><button type="button" onClick={openHistoricalMiles(open)}>Open Miles PDF</button></section><button type="button" onClick={rebuildHistoricalLogbooks}>Rebuild Historical Logbooks</button><button type="button" onClick={onScan}>Add Support</button></div></details>`
);

src=src.replace(/Historical evidence v109\.8\.0[^<]*/g,'Historical evidence v109.8.1 · Full immutable daily Logbooks use exact load-linked dates and complete driver timelines.');
src=src.replace(/openHistorical\(open,'logbook_snapshot'\)/g,"openAllHistoricalLogbooks(open)");
src=src.replace(/openHistorical\(open,'miles_snapshot'\)/g,'openHistoricalMiles(open)');

if(src.includes('onOpenLog?.('))throw new Error('Historical Logbook still falls back to live Logbook');
if(src.includes('ROAD READY – HISTORICAL LOGBOOK')||src.includes('ROAD READY - HISTORICAL LOGBOOK'))throw new Error('Obsolete historical summary title remains');
for(const marker of ['historicalLogbookDatesV10981','Open All Logbooks','No historical Logbook linked','Rebuild Historical Logbooks','openHistoricalLogbookPdfV10981'])if(!src.includes(marker))throw new Error(`v109.8.1 marker missing: ${marker}`);
fs.writeFileSync(path,src);

const cssPath='source/src/modules/owneros/loadFoldersV10969.css';
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('.load-folder-historical-v10981'))css+=`\n.load-folder-historical-v10981{display:grid;gap:10px}.load-folder-historical-v10981>section{display:grid;gap:8px;padding:12px;border:1px solid #dce4ee;border-radius:14px;background:#fff}.load-folder-historical-v10981>section>b{font-size:13px}.load-folder-historical-v10981>section>span{color:#6b7280;font-size:12px}.load-folder-historical-row-v10981{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #edf1f5}.load-folder-historical-row-v10981 span{font-weight:800;font-variant-numeric:tabular-nums}.load-folder-historical-v10981 button{min-height:38px}\n`;
fs.writeFileSync(cssPath,css);

for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const data=JSON.parse(fs.readFileSync(p,'utf8'));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');}
const now=new Date().toISOString();
fs.writeFileSync('release-version.json',JSON.stringify({version:VERSION,build:BUILD,label:'v109.8.1 Full Historical Logbooks'},null,2)+'\n');
fs.writeFileSync('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.8.1 Full Historical Logbooks',force:true,notes:['Full DOT-style historical Logbook PDFs use the complete daily event timeline.','Load folders expose every linked Logbook date and a combined PDF action.','Historical snapshots are immutable, versioned, checksummed, and rebuild-safe.','Miles PDF behavior is unchanged.']},null,2)+'\n');
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])if(fs.existsSync(p)){let s=fs.readFileSync(p,'utf8');s=s.replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`);fs.writeFileSync(p,s);}
let update=fs.readFileSync('source/src/core/update/appUpdate.js','utf8');update=update.replace(/const FALLBACK_APP_VERSION\s*=\s*['"][^'"]+['"];?/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD\s*=\s*['"][^'"]+['"];?/,`const FALLBACK_APP_BUILD = '${BUILD}';`).replace(/export const CURRENT_APP_VERSION\s*=\s*[^;]+;/,'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;').replace(/export const CURRENT_APP_BUILD\s*=\s*[^;]+;/,'export const CURRENT_APP_BUILD = FALLBACK_APP_BUILD;');fs.writeFileSync('source/src/core/update/appUpdate.js',update);
let sw=fs.readFileSync('public/sw.js','utf8');sw=sw.replace(/const OWNER_OP_SW_VERSION\s*=\s*['"][^'"]+['"];?/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD\s*=\s*['"][^'"]+['"];?/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);fs.writeFileSync('public/sw.js',sw);
console.log('PASS — v109.8.1 full historical Logbooks finalized last');
