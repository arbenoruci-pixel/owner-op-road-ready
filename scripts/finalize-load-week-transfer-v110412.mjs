import fs from 'node:fs';
const VERSION='110.4.12',BUILD='v110412-load-week-transfer',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.12 Load and week transfer',releasedAt:stamp,updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Export and import one load or a complete document week with original files.','Preview imports, keep existing records and restore missing originals.','Portable document folders keep their dates without changing driving logs.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=fs.readFileSync(path,'utf8');
  for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);
  fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.11'","'"+VERSION+"'").replaceAll("'v110411-document-filing'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');

for(const [input,output] of [['transferCore.js','transferCoreV110412.js'],['transferStorage.js','transferStorageV110412.js'],['TransferPanel.jsx','TransferPanelV110412.jsx'],['transfer.css','transferV110412.css']])fs.copyFileSync('scripts/v110412/'+input,'source/src/modules/owneros/'+output);
function patch(path,before,after){
 const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;
 if(source.split(before).length!==2)throw new Error('Load/week transfer anchor changed: '+path);
 fs.writeFileSync(path,source.replace(before,after));
}
const component='source/src/modules/owneros/LoadFoldersV10969.jsx';
patch(component,"import React,", "import TransferPanel from './TransferPanelV110412.jsx';\nimport React,");
patch(component,'    {notices}',"    {!library?<TransferPanel folder={folder} week={week} folders={folders} documents={documents} allDocuments={allDocuments} businessStore={businessStore} onImported={()=>setRevision(v=>v+1)}/>:null}\n    {notices}");
// Source activity dates only organize document folders; never create duty events.
const engine='source/src/modules/owneros/archiveEvidenceV1103.js';
patch(engine,'const actualDays=days.length?days:unique(folder.documents.flatMap(doc=>doc.archiveEventDays || [])).sort();',"const actualDays=days.length?days:unique([...folder.documents.flatMap(doc=>doc.archiveEventDays || []),...(load.documentTransferDays || []).filter(day)]).sort();");
console.log('PASS — 110.4.12 load and week transfer installed');
