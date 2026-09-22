import fs from 'node:fs';
const VERSION='110.4.3',BUILD='v110403-documents-export',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.3 Resilient document export',releasedAt:stamp,updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Export readable originals even when another document cannot be read.','Include every document record and a list of unavailable originals.','Keep the document package ready for an explicit save or share.']});
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
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.2'","'"+VERSION+"'").replaceAll("'v110402-backup-save'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');

fs.copyFileSync('scripts/v110403/auditPackage.js','source/src/modules/owneros/auditPackageV110403.js');
const exporter='source/src/modules/owneros/auditExportV10973.js';
let source=fs.readFileSync(exporter,'utf8');
const start=source.indexOf('export async function exportRoadReadyAuditPackageV10973(');
if(start<0)throw new Error('Document audit exporter missing');
source=source.slice(0,start)+`export async function exportRoadReadyAuditPackageV10973(options={}){
  return prepareDocumentAudit({...options,report:analyzeAuditDataV10973(options.folders,options.documents),readBlob:vaultBlobV102,loadNumber:vaultDocumentLoadNoV102,documentType:vaultDocumentTypeV102});
}
`;
source=source.replace("import { vaultBlobV102", "import { prepareDocumentAudit } from './auditPackageV110403.js';\nimport { vaultBlobV102");
fs.writeFileSync(exporter,source);
const component='source/src/modules/owneros/LoadFoldersV10969.jsx';
source=fs.readFileSync(component,'utf8');
source=source.replace("import React,", "import { sharePreparedBackupFile } from '../../../../lib/local-db/backupFile.js';\nimport React,");
const stateAnchor=" const [query,setQuery]";
if(!source.includes(stateAnchor))throw new Error('Document audit state anchor missing');
source=source.replace(stateAnchor,` const [auditPackage,setAuditPackage]=useState(null),[auditSharing,setAuditSharing]=useState(false);
 useEffect(()=>()=>{if(auditPackage?.url)URL.revokeObjectURL(auditPackage.url);},[auditPackage]);
 async function saveAudit(){if(!auditPackage||auditSharing)return;setAuditSharing(true);try{const result=await sharePreparedBackupFile(auditPackage.file);setAuditMessage(result.mode==='shared'?'Document package shared.':result.mode==='cancelled'?'Sharing cancelled. Your package is still ready.':'Use Download documents below to save the prepared package.');}finally{setAuditSharing(false);}}
`+stateAnchor);
const old=source.split('\n').find(line=>line.includes(' async function exportAudit()'));
if(!old)throw new Error('Document export handler missing');
source=source.replace(old,fs.readFileSync('scripts/v110403/export-handler.txt','utf8').trimEnd());
const message='{auditMessage?<div className="load-folder-audit-message-v10973">{auditMessage}</div>:null}';
if(!source.includes(message))throw new Error('Document export message missing');
source=source.replace(message,message+`
 {auditPackage?<div className="load-folder-audit-message-v10973" role="region" aria-label="Prepared document export"><b>{auditPackage.originals} of {auditPackage.documents} originals ready.</b><p>{auditPackage.missingOriginals ? auditPackage.missingOriginals+' originals could not be read. Their metadata and failure list are included.' : 'All originals included.'} Save this package and attach it for review.</p><button type="button" disabled={auditBusy||auditSharing} onClick={saveAudit}>Save / Share documents</button> <a href={auditPackage.url} download={auditPackage.file.name} style={{display:'inline-block',padding:'14px'}}>Download documents</a></div>:null}`);
fs.writeFileSync(component,source);
console.log('PASS — 110.4.3 resilient document export installed');
