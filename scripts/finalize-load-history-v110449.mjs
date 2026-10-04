import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){const source=read(path);if(source.includes(after))return;if(source.split(before).length!==2)throw Error('Load history anchor changed: '+path);fs.writeFileSync(path,source.replace(before,()=>after));}
const base='source/src/modules/owneros/';
fs.copyFileSync('scripts/v110449/loadHistory.js',base+'loadHistoryV110449.js');
const history=base+'historicalLogbookV10981.js';
patch(history,' const payload=snapshotPayload(state,folder,day);const hash='," const payload=snapshotPayload(state,folder,day);if(!payload.events.length)throw Error('No recorded logbook is saved on this device for '+day+'. Import its original logbook to view the hours.');const hash=");
patch(history,'const days=historicalLogbookDatesV10981(folder);const snapshots=',"const days=historicalLogbookDatesV10981(folder).filter(day=>normalizedHistoricalTimelineV10981(state,day).length);if(!days.length)throw Error('No recorded logbook is saved on this device for Load '+text(folder.loadNo)+'. Import the original logbook for these dates.');const snapshots=");
patch(history,' const mileage=archiveLoadMileage(state,folder.loadNo),ops=[];'," const mileage=archiveLoadMileage(state,folder.loadNo),ops=[];\n if(!mileage.hasRecordedMiles)throw Error('No recorded mileage is linked to Load '+text(folder.loadNo)+'. Add or import the original mileage records to view this report.');");
const view=base+'driverDocumentsV110415.js';
patch(view,"import {serviceStage", "import {supportingFileChecks} from './loadHistoryV110449.js';\nimport {serviceStage");
patch(view,"supporting=allOpen.filter(r=>r.area!=='load')","supporting=supportingFileChecks(allOpen.filter(r=>r.area!=='load'))");
const evidence=base+'EvidenceCenterV110413.jsx';
patch(evidence,"import {loadReviewRows}","import {supportingFileChecks} from './loadHistoryV110449.js';\nimport {loadReviewRows}");
patch(evidence,'  const rows=compact?', '  const rawRows=compact?');
patch(evidence,'  const missing=rows.filter',"  const rows=reviewScope==='supporting'?supportingFileChecks(rawRows):rawRows;\n  const missing=rows.filter");
const folders=base+'LoadFoldersV10969.jsx';
patch(folders,"import LibraryHistory from './LibraryHistoryV110434.jsx';", "import LibraryHistory from './LibraryHistoryV110434.jsx';\nimport {libraryHistory} from './libraryStorageV110434.js';\nimport {savedLoadLogbooks} from './loadHistoryV110449.js';");
patch(folders,'  const [importOpen,setImportOpen]=useState(false);','  const [importOpen,setImportOpen]=useState(false);\n  const [historyRequest,setHistoryRequest]=useState(0);\n  const currentLoadRef=useRef(loadNo);currentLoadRef.current=loadNo;');
patch(folders,"  function scan(kind='auto')",`  async function openLoadLogbooks(){
    const target=folder.loadNo;setFileError('');
    try{
      const copies=savedLoadLogbooks(await libraryHistory(),target);
      if(currentLoadRef.current!==target)return;
      if(copies.length){setHistoryRequest(value=>value+1);return;}
      openAllHistoricalLogbooksPdfV10981({state,folder});
    }catch(error){if(currentLoadRef.current===target)setFileError(error.message);}
  }
  function openLoadMileage(){setFileError('');try{openCurrentMilesPdfV1103({state:archiveState,folder});}catch(error){setFileError(error.message);}}
  function scan(kind='auto')`);
patch(folders,'<LibraryHistory loadNo={folder.loadNo}/>','<LibraryHistory key={folder.loadNo} loadNo={folder.loadNo} openRequest={historyRequest}/>');
patch(folders,'Supporting file details ({current.supporting.length})','Supporting files to review ({current.supporting.length})');
patch(folders,'onClick={()=>openAllHistoricalLogbooksPdfV10981({state,folder})}','onClick={openLoadLogbooks}');
patch(folders,'onClick={()=>openCurrentMilesPdfV1103({state:archiveState,folder})}','onClick={openLoadMileage}');
const library=base+'LibraryHistoryV110434.jsx';
patch(library,'React,{useEffect,useState}','React,{useEffect,useState,useRef}');
patch(library,"import {libraryHistory}","import {savedLoadLogbooks} from './loadHistoryV110449.js';\nimport {libraryHistory}");
patch(library,"LibraryHistory({loadNo=''})", "LibraryHistory({loadNo='',openRequest=0})");
patch(library," const [archives,setArchives]", " const logbookPanel=useRef(null);\n const [archives,setArchives]");
patch(library,' useEffect(()=>{let alive=true;'," useEffect(()=>{if(openRequest&&logbookPanel.current){logbookPanel.current.open=true;logbookPanel.current.scrollIntoView({block:'center'});}},[openRequest,archives]);\n useEffect(()=>{let alive=true;");
const source=read(library),start=source.indexOf(' const links='),end=source.indexOf('\n const unique=',start);
if(!source.includes('const links=loadNo?savedLoadLogbooks')){if(start<0||end<0)throw Error('Library links anchor changed');fs.writeFileSync(library,source.slice(0,start)+" const links=loadNo?savedLoadLogbooks(archives,loadNo):archives.flatMap(a=>(a.logbook||[]).map(log=>({day:log.day,driverId:log.driverId,basis:'archive_copy',log})));"+source.slice(end));}
patch(library,'{unique.length?<details className="rr-library-panel">','{unique.length?<details ref={logbookPanel} className="rr-library-panel">');
const VERSION='110.4.49',BUILD='v110449-load-history-sources';
for(const path of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,label:'v110.4.49 Saved load history',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Open saved source logbooks and explain when historical records are unavailable.','Prevent empty logbook and mileage PDF exports.','Group supporting checks by their original file.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const[path,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(path);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,s);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replaceAll('v110.4.48','v'+VERSION).replaceAll('V110.4.48','V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.4.48'","'"+VERSION+"'").replaceAll("'v110448-form-team-switch'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
execFileSync(process.execPath,['scripts/v110449/load-history.test.mjs'],{stdio:'inherit'});
console.log('PASS — saved load history and grouped original-file checks');
