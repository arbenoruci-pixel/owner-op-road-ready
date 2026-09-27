import fs from 'node:fs';
const VERSION='110.4.11',BUILD='v110411-document-filing',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.11 Document reading and filing',releasedAt:stamp,updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Recognize numbered Load Confirmation tables and keep matching terms pages together.','Refresh load suggestions from verified Reader references while preserving driver choices.','Show saved BOL and POD coverage on the current logbook load.']});
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
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.10'","'"+VERSION+"'").replaceAll("'v110410-bol-column-reader'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.4.11 Reader classification, assignment and Home coverage');

function patch(path,before,after){
  const source=fs.readFileSync(path,'utf8');
  if(source.includes(after))return;
  if(source.split(before).length!==2)throw new Error('Document filing anchor changed: '+path);
  fs.writeFileSync(path,source.replace(before,after));
}
const scan='source/src/modules/scan/SmartScanSheetV105.jsx';
fs.copyFileSync('scripts/v110411/reviewAssignment.js','source/src/modules/scan/reviewAssignmentV110411.js');
patch(scan,"import {scanWithSourceFields}","import {reviewAssignment} from './reviewAssignmentV110411.js';\nimport {scanWithSourceFields}");
patch(scan,"  const [documentDate, setDocumentDate] = useState('');","  const [documentDate, setDocumentDate] = useState('');\n  const dateChosenByDriverV110411=useRef(false);");
patch(scan,"  function applyResult(result, preferredLoadNo = '', preserveLoadChoice = false) {","  function applyResult(result, preferredLoadNo = '', preserveLoadChoice = false) {\n    dateChosenByDriverV110411.current=false;");
patch(scan,"setDocumentDate(event.target.value); setLinkDay(event.target.value || linkDay);","dateChosenByDriverV110411.current=true; setDocumentDate(event.target.value); setLinkDay(event.target.value || linkDay);");
const before=fs.readFileSync('scripts/v110411/review-before.txt','utf8').trimEnd();
const after=fs.readFileSync('scripts/v110411/review-after.txt','utf8').trimEnd();
patch(scan,before,after);
const text=fs.readFileSync(scan,'utf8');
fs.writeFileSync(scan,text.replaceAll('primaryLoadReference(analysis)','primaryLoadReference(sourceAnalysisV110393)').replace('assertScanLoadIdentityV110326(meta.id,analysis?.fields,analysis,selectedLoadNo);','assertScanLoadIdentityV110326(meta.id,sourceAnalysisV110393?.fields,sourceAnalysisV110393,selectedLoadNo);'));
const home='source/src/modules/home/AdaptiveHomeV1038.jsx';
patch(home,"import React, { useMemo } from 'react';","import React, { useMemo } from 'react';\nimport {loadDocumentSummaryV105} from '../documents/documentFoundationV105.js';");
patch(home,"...currentLoad,docs:","...currentLoad,documentSummary:loadDocumentSummaryV105(checklistStore,currentLoad.loadNo),docs:");
for(const path of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs','scripts/v110382/browser-bol.mjs','scripts/v110384/browser-rows.mjs','scripts/browser-ratecon-structure-v110388.mjs','scripts/v110393/browser-bol-source.mjs','scripts/v110394/browser-bol-form.mjs','scripts/v110410/browser-bol-columns.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'0.3.35'","'0.3.36'"));
