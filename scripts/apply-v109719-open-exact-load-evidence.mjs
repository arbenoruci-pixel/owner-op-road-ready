import fs from 'node:fs';
const VERSION='109.7.19';
const BUILD='v109719-open-exact-load-evidence';
const path='source/src/modules/owneros/LoadFoldersV10969.jsx';
let src=fs.readFileSync(path,'utf8');

src=src.replace(/const VERSION='[^']+';/,`const VERSION='${VERSION}';`);

src=src.replace(
" function itemAction(item){if(item.id==='logbook'||item.id==='miles')return onOpenLog;if(item.id==='trailer_return')return()=>markTrailerReturnedV10976(open.loadNo,open.trailerId);return onScan;}\n function actionLabel(item){if(item.id==='logbook')return'Open Logbook';if(item.id==='miles')return'Open Miles';if(item.id==='trailer_return')return'Mark returned';return'Add';}",
` function exactLoadDays(folder={}){return [...new Set([...(folder.events||[]).map(x=>String(x.day||'').slice(0,10)),...(folder.legs||[]).map(x=>String(x.day||'').slice(0,10)),...(folder.mileage?.linkedDays||[]),...(folder.mileage?.rows||[]).map(x=>String(x.day||'').slice(0,10))].filter(d=>/^\\d{4}-\\d{2}-\\d{2}$/.test(d)))].sort();}\n function exactLoadDay(folder={},preferMiles=false){const mileageDays=[...(folder.mileage?.rows||[]).map(x=>String(x.day||'').slice(0,10)),...(folder.mileage?.linkedDays||[])].filter(d=>/^\\d{4}-\\d{2}-\\d{2}$/.test(d)).sort();const all=exactLoadDays(folder);return (preferMiles?mileageDays.at(-1):'')||all.at(-1)||'';}\n function openExactLog(folder={},preferMiles=false){const d=exactLoadDay(folder,preferMiles);return()=>onOpenLog?.(d);}\n function completedItemAction(item,folder){if(item.id==='rate'&&folder.rateCons?.[0])return()=>openVaultDocumentV102(folder.rateCons[0]);if(item.id==='bol'&&folder.bols?.[0])return()=>openVaultDocumentV102(folder.bols[0]);if(item.id==='pod'&&folder.pods?.[0])return()=>openVaultDocumentV102(folder.pods[0]);if(item.id==='logbook')return openExactLog(folder,false);if(item.id==='miles')return openExactLog(folder,true);if(item.id==='fuel'&&folder.fuelDocs?.[0])return()=>openVaultDocumentV102(folder.fuelDocs[0]);return null;}\n function itemAction(item){if(item.id==='logbook')return openExactLog(open,false);if(item.id==='miles')return openExactLog(open,true);if(item.id==='trailer_return')return()=>markTrailerReturnedV10976(open.loadNo,open.trailerId);return onScan;}\n function actionLabel(item){if(item.id==='logbook')return'Open Logbook';if(item.id==='miles')return'Open Miles';if(item.id==='trailer_return')return'Mark returned';return'Add';}\n function completedActionLabel(item){if(item.id==='rate')return'Open Rate Con';if(item.id==='bol')return'Open BOL';if(item.id==='pod')return'Open POD';if(item.id==='logbook')return'Open Logbook';if(item.id==='miles')return'Open Miles';if(item.id==='fuel')return'Open Fuel';return'Open';}`
);

src=src.replace(
"{!item.complete&&item.required?<button type=\"button\" onClick={itemAction(item)}>{actionLabel(item)}</button>:item.id==='trailer_return'&&item.complete&&open.trailerReturn?.required?<button type=\"button\" onClick={()=>undoTrailerReturnedV10976(open.loadNo)}>Undo</button>:null}",
"{!item.complete&&item.required?<button type=\"button\" onClick={itemAction(item)}>{actionLabel(item)}</button>:item.id==='trailer_return'&&item.complete&&open.trailerReturn?.required?<button type=\"button\" onClick={()=>undoTrailerReturnedV10976(open.loadNo)}>Undo</button>:completedItemAction(item,open)?<button type=\"button\" onClick={completedItemAction(item,open)}>{completedActionLabel(item)}</button>:null}"
);

src=src.replace("<button type=\"button\" onClick={onOpenLog}>Open Logbook</button><button type=\"button\" onClick={onOpenLog}>Open Miles</button>","<button type=\"button\" onClick={openExactLog(open,false)}>Open Logbook</button><button type=\"button\" onClick={openExactLog(open,true)}>Open Miles</button>");

if(!src.includes('openExactLog(open,true)')||!src.includes('Open Rate Con'))throw new Error('v109.7.19 exact evidence action patch failed');
fs.writeFileSync(path,src);

for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])if(fs.existsSync(p)){let s=fs.readFileSync(p,'utf8');s=s.replace(/App v109\.7\.1[3-8]/g,`App v${VERSION}`).replace(/APP V109\.7\.1[3-8]/g,`APP V${VERSION}`).replaceAll('App v{CURRENT_APP_VERSION}',`App v${VERSION}`).replaceAll('APP V{CURRENT_APP_VERSION}',`APP V${VERSION}`);fs.writeFileSync(p,s);}

for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const data=JSON.parse(fs.readFileSync(p,'utf8'));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');}
const now=new Date().toISOString();
fs.writeFileSync('release-version.json',JSON.stringify({version:VERSION,build:BUILD,label:'v109.7.19 Exact Load Evidence Actions'},null,2)+'\n');
fs.writeFileSync('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.19 Exact Load Evidence Actions',force:true,notes:['Open Logbook and Open Miles pass the exact historical load date.','Completed Rate Con, BOL, POD, Logbook, Miles and Fuel checklist rows have Open buttons.','No completed-load evidence action defaults to today.']},null,2)+'\n');
let update=fs.readFileSync('source/src/core/update/appUpdate.js','utf8');update=update.replace(/const FALLBACK_APP_VERSION\s*=\s*['\"][^'\"]+['\"];?/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD\s*=\s*['\"][^'\"]+['\"];?/,`const FALLBACK_APP_BUILD = '${BUILD}';`).replace(/export const CURRENT_APP_VERSION\s*=\s*[^;]+;/,'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;').replace(/export const CURRENT_APP_BUILD\s*=\s*[^;]+;/,'export const CURRENT_APP_BUILD = FALLBACK_APP_BUILD;');fs.writeFileSync('source/src/core/update/appUpdate.js',update);
let sw=fs.readFileSync('public/sw.js','utf8');sw=sw.replace(/const OWNER_OP_SW_VERSION\s*=\s*['\"][^'\"]+['\"];?/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD\s*=\s*['\"][^'\"]+['\"];?/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);fs.writeFileSync('public/sw.js',sw);
console.log('PASS — v109.7.19 exact load evidence actions applied last');
