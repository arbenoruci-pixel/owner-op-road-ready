import fs from 'node:fs';
const VERSION='110.4.16',BUILD='v110416-document-weeks',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.16 Document weeks',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Keep reviewed load references together after reload and transfer.','Show each load in its service week with visible dates.','Preserve original files and driving logs.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=fs.readFileSync(path,'utf8');for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.15'","'"+VERSION+"'").replaceAll("'v110415-driver-documents'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const name of ['loadAliases','documentWeeks'])fs.copyFileSync(`scripts/v110416/${name}.js`,`source/src/modules/owneros/${name}V110416.js`);
function patch(path,before,after){const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;if(source.split(before).length!==2)throw new Error('Document weeks anchor changed: '+path+' / '+before.slice(0,90));fs.writeFileSync(path,source.replace(before,after));}
const reconciliation='source/src/modules/owneros/loadFolderReconciliationV10974.js';
patch(reconciliation,"'use client';","'use client';\nimport {reviewedLoadAliases} from './loadAliasesV110416.js';");
patch(reconciliation,"  const aliases=new Map([...(businessStore.evidenceAliases||[]).map(x=>[upper(x.from),upper(x.to)]),...(overlay.loadCorrections||[]).filter(x=>x.aliasFrom&&x.loadNo).map(x=>[upper(x.aliasFrom),upper(x.loadNo)])]);","  const aliases=new Map(Object.entries(reviewedLoadAliases(businessStore,documents,overlay)));");
patch(reconciliation,'  for(const load of loads||[]){',`  // Canonical records win over legacy projections regardless of input order.
  const orderedLoads=[...(loads||[])].sort((a,b)=>Number(!aliases.has(upper(a.loadNo||a.canonicalLoadNo)))-Number(!aliases.has(upper(b.loadNo||b.canonicalLoadNo))));
  for(const load of orderedLoads){`);
patch(reconciliation,'  return {folders,reviewItems,allDocuments:allDocs,repairOverlay:overlay};',`  return {folders,reviewItems,allDocuments:allDocs,repairOverlay:overlay,archiveState:state,
    evidenceStore:{...businessStore,evidenceAliases:[...aliases].map(([from,to])=>({from,to}))}};`);
const archive='source/src/modules/owneros/archiveEvidenceV1103.js';
patch(archive,'  const actualDays=days.length?days:unique([...folder.documents.flatMap(doc=>doc.archiveEventDays || []),...(load.documentTransferDays || []).filter(day)]).sort();',`  const stage=text(load.documentWorkflowStage).toLowerCase();
  const transferred=(load.documentTransferDays || []).filter(day).filter(date=>
    !(['booked','picked_up'].includes(stage) && date===day(load.deliveryDate) && date!==day(load.pickupDate)));
  const actualDays=days.length?days:unique([...folder.documents.flatMap(doc=>doc.archiveEventDays || []),...transferred]).sort();`);
const evidence='source/src/modules/owneros/evidenceCoreV110413.js';
patch(evidence,'export function evidenceLoadResolver(businessStore={}) {',"import {reviewedLoadAliases} from './loadAliasesV110416.js';\nexport function evidenceLoadResolver(businessStore={}) {");
patch(evidence,'  const aliases=new Map(list(businessStore.evidenceAliases).map(a=>[text(a.from).toUpperCase(),text(a.to).toUpperCase()]));','  const aliases=new Map(Object.entries(reviewedLoadAliases(businessStore)));');
const transfer='source/src/modules/owneros/transferCoreV110412.js';
patch(transfer,'// Portable Documents packages.',"import {reviewedLoadAliases} from './loadAliasesV110416.js';\n// Portable Documents packages.");
patch(transfer,'  records.loads = selected.map(f => {','  const aliases=reviewedLoadAliases(businessStore,allDocuments);\n  records.loads = selected.map(f => {');
patch(transfer,'      documentTransferDays:[...new Set(f.days || [])].filter(validDay),',`      documentTransferDays:[...new Set(f.days || [])].filter(validDay),
      documentTransferAliases:Object.entries(aliases).filter(([,to])=>to===loadNumber(f)).map(([from,to])=>({from,to})),`);
patch(transfer,'      if (match) { summary.keptRecords++; continue; }',`      if (match) {
        if(bucket==='loads'&&Array.isArray(raw.documentTransferAliases)){
          const mappings=Array.isArray(match.documentTransferAliases)?[...match.documentTransferAliases]:[];
          for(const a of raw.documentTransferAliases)if(a?.to===loadNumber(match)&&a.from&&!mappings.some(old=>old.from===a.from))mappings.push(clone(a));
          if(mappings.length)match.documentTransferAliases=mappings;
        }
        summary.keptRecords++;continue;
      }`);
const folders='source/src/modules/owneros/LoadFoldersV10969.jsx';
patch(folders,"import {loadView}","import {documentWeeks,folderWeekDates} from './documentWeeksV110416.js';\nimport {loadView}");
patch(folders,'  const {folders,reviewItems,allDocuments}=model;','  const {folders,reviewItems,allDocuments,archiveState,evidenceStore}=model;');
patch(folders,"  const weeks=useMemo(()=>visibleWeeks(archiveWeeks(folders,projectArchiveState(state),{...businessStore,documents:allDocuments})).map(week=>({...week,id:week.start||'undated'})),[folders,state,businessStore,allDocuments]);","  const weeks=useMemo(()=>documentWeeks(folders,archiveState,{...evidenceStore,documents:allDocuments}),[folders,archiveState,evidenceStore,allDocuments]);");
patch(folders,'loadView(f,allDocuments,businessStore)])),[folder,week,allDocuments,businessStore]','loadView(f,allDocuments,evidenceStore)])),[folder,week,allDocuments,evidenceStore]');
// All document tools consume the same resolved identities as the folder list.
fs.writeFileSync(folders,fs.readFileSync(folders,'utf8').replaceAll('businessStore={businessStore}','businessStore={evidenceStore}'));
patch(folders,"{folder?`Load #${folder.loadNo}`:library?'All saved files':'Documents'}","{folder?`Load #${folder.loadNo}`:library?'All saved files':week?'Loads this week':'Documents'}");
patch(folders,"onClick={()=>navigate(folder?weekId:'')}>‹</button>","onClick={()=>navigate(folder?weekId:'')}>‹ <span>{folder?'Loads':'Weeks'}</span></button>");
patch(folders,'    {current?<><div className="rr-driver-route">','    {current?<><button type="button" className="rr-driver-week-link" onClick={()=>navigate(weekId)}>{weekLabel(weekId)} ›</button><div className="rr-driver-route">');
patch(folders,'      <div className="rr-driver-filter" role="group"', '      <p className="rr-driver-week-count">{week.items.length} {week.items.length===1?\'load\':\'loads\'} this week</p>\n      <div className="rr-driver-filter" role="group"');
patch(folders," · Load {f.loadNo}</small><span className=\"rr-driver-card-bottom\">"," · Load {f.loadNo}</small><span className=\"rr-driver-card-date\">{folderWeekDates(f,week.start)}</span><span className=\"rr-driver-card-bottom\">");
patch(folders,'openCurrentMilesPdfV1103({state:projectArchiveState(state),folder})','openCurrentMilesPdfV1103({state:archiveState,folder})');
const driver='source/src/modules/owneros/driverDocumentsV110415.js';
patch(driver,'const stored=list(businessStore.loads).find(l=>resolve(loadOf(l))===ref)||{};', 'const stored=list(businessStore.loads).find(l=>loadOf(l)===ref)||list(businessStore.loads).find(l=>resolve(loadOf(l))===ref)||{};');
const css='source/src/modules/owneros/driverDocumentsV110415.css';
const styles=`
/* Week identity remains visible while scanning long phone lists. */
.rr-driver-documents .rr-driver-week{position:sticky;top:0;z-index:5;background:#eef2ef;padding:8px 0;border-bottom:1px solid var(--rr-line)}
.rr-driver-documents .rr-driver-toolbar .rr-driver-back{width:auto;min-width:44px;font-size:25px;display:flex;gap:4px;align-items:center}
.rr-driver-documents .rr-driver-back span{font-size:14px;font-weight:650}
.rr-driver-documents .rr-driver-toolbar h2{font-size:20px}
.rr-driver-documents .rr-driver-week-count{font-size:13px;margin:0}
.rr-driver-documents .rr-driver-card-date{font-size:12px;color:#53667b;font-weight:500}
.rr-driver-documents .rr-docs-search input{color-scheme:light;appearance:none;background:#fff!important;color:#152b46!important;border:1px solid #c5d3e1!important;border-radius:10px;min-height:44px}
.rr-driver-documents .rr-docs-search input::placeholder{color:#596b80;opacity:1}
.rr-driver-documents .rr-driver-week-link{justify-self:start;background:transparent;border:0;color:#2458b6;font-size:13px;font-weight:650;padding:6px 0;min-height:44px;text-align:left}
`;
if(!fs.readFileSync(css,'utf8').includes('Week identity remains visible'))fs.appendFileSync(css,styles);
console.log('PASS — v110416 reviewed load aliases and document weeks installed');
