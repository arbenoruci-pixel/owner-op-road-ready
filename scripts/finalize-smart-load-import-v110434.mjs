import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;if(s.split(b).length!==2)throw Error('Library import anchor changed: '+p+' / '+b.slice(0,80));fs.writeFileSync(p,s.replace(b,a));}
for(const name of ['libraryCore','libraryZip','libraryStorage'])fs.copyFileSync('scripts/v110434/'+name+'.js','source/src/modules/owneros/'+name+'V110434.js');
for(const name of ['ImportLibraryPanel','LibraryHistory'])fs.copyFileSync('scripts/v110434/'+name+'.jsx','source/src/modules/owneros/'+name+'V110434.jsx');
fs.copyFileSync('scripts/v110434/library.css','source/src/modules/owneros/libraryV110434.css');
const folders='source/src/modules/owneros/LoadFoldersV10969.jsx';
patch(folders,"import RecoveryPanel", "import ImportLibraryPanel from './ImportLibraryPanelV110434.jsx';\nimport LibraryHistory from './LibraryHistoryV110434.jsx';\nimport RecoveryPanel");
patch(folders,"  const [checksOpen,setChecksOpen]=useState(false);","  const [checksOpen,setChecksOpen]=useState(false);\n  const [importOpen,setImportOpen]=useState(false);");
patch(folders,'    {moreOpen?<section',`    {!folder&&!week&&!library?<><div className="rr-library-entry-actions"><button type="button" className="rr-library-primary" onClick={()=>scan()}>Smart Scan</button><button type="button" aria-expanded={importOpen} onClick={()=>setImportOpen(v=>!v)}>Import documents</button></div>{importOpen?<ImportLibraryPanel/>:null}<LibraryHistory/></>:null}
    {moreOpen?<section`);
patch(folders,'      <details className="rr-docs-options"><summary>Load details</summary>', '      <LibraryHistory loadNo={folder.loadNo}/>\n      <details className="rr-docs-options"><summary>Load details</summary>');
patch(folders,'>+ Add document</button>',">{folder?'+ Add document':'Smart Scan'}</button>");
const backup='source/src/modules/backup/BackupLogsScreen.jsx';
patch(backup,"import React", "import ImportLibraryPanel from '../owneros/ImportLibraryPanelV110434.jsx';\nimport React");
patch(backup,'        <section className="backup-status-card">','        <ImportLibraryPanel/>\n        <section className="backup-status-card">');
const store='source/src/modules/business/businessStore.js';
patch(store,'    evidenceRecoveryHistory:list(value.evidenceRecoveryHistory),','    evidenceRecoveryHistory:list(value.evidenceRecoveryHistory),\n    documentLibraryHistory:list(value.documentLibraryHistory),\n    documentLibraryCases:list(value.documentLibraryCases),\n    documentLibraryLinks:list(value.documentLibraryLinks),');
const rec='source/src/modules/owneros/loadFolderReconciliationV10974.js';
patch(rec,"return source?.repairLegacy?{...folder,status:folder.status==='complete'?'complete':'legacy_review',legacy:true}:folder;", "if(source?.documentLibrarySource&&source.documentTransferDays?.length)folder={...folder,days:[...source.documentTransferDays].sort()};return source?.repairLegacy?{...folder,status:folder.status==='complete'?'complete':'legacy_review',legacy:true}:folder;");
const view='source/src/modules/owneros/driverDocumentsV110415.js';
patch(view,"service:stage==='tonu'?", "service:load.operationalStatus==='closed'?`Closed${stage==='tonu'?' · TONU':stage==='cancelled'?' · Cancelled':''}`:stage==='tonu'?");
const app='source/src/app/App.jsx';
patch(app,"export default function App() {", "import {closeArchivedGuides} from '../modules/owneros/libraryCoreV110434.js';\nexport default function App() {");
patch(app,'  const [offlineHydrated, setOfflineHydrated] = useState(false);',`  const [offlineHydrated, setOfflineHydrated] = useState(false);
  React.useEffect(()=>{
    if(!offlineHydrated)return;
    const closeHistory=()=>setState(current=>closeArchivedGuides(current,readGuideStoreV110311()));
    closeHistory();window.addEventListener('road-ready-library-imported',closeHistory);
    return()=>window.removeEventListener('road-ready-library-imported',closeHistory);
  },[offlineHydrated,state.loadGuidesById]);`);
const VERSION='110.4.34',BUILD='v110434-smart-load-library';
for(const p of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.34 Load library import',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Import load folders, original documents and linked driver logbook sources from one ZIP.','Preview saved differences, verify original checksums and avoid duplicate files.','Closed historical work stays closed; driving hours, signatures and payment records are preserved.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.33'","'"+VERSION+"'").replaceAll("'v110433-lean-documents-export'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.34 load library import, original checksums and linked logbook sources');
