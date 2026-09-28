import fs from 'node:fs';
const VERSION='110.4.19',BUILD='v110419-source-copy-filing',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.19 Verified original filing',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['File copies of the same original using its confirmed review.','Show confirmed details instead of an older reading.','Preserve weekly navigation, original files and driving records.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=fs.readFileSync(path,'utf8');for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.18'","'"+VERSION+"'").replaceAll("'v110418-reviewed-load-reference'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
function patch(path,before,after){const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;if(source.split(before).length!==2)throw new Error('Reviewed identity anchor changed: '+path+' / '+before.slice(0,90));fs.writeFileSync(path,source.replace(before,after));}

const base='source/src/modules/owneros/';
fs.copyFileSync('scripts/v110419/sourceCopies.js',base+'sourceCopiesV110419.js');
fs.copyFileSync('scripts/v110419/SavedReadingReview.jsx',base+'SavedReadingReviewV110345.jsx');
patch(base+'SavedDocumentFilesV110344.jsx','<SavedReadingReview review={savedReview || doc?.extracted?.readerReviewV110345}/>','<SavedReadingReview document={doc} review={savedReview || doc?.extracted?.readerReviewV110345}/>');
const reconcile=base+'loadFolderReconciliationV10974.js';
patch(reconcile,"import {reviewedLoadAliases}","import {projectReviewedCopies,preferredSourceCopy} from './sourceCopiesV110419.js';\nimport {reviewedLoadAliases}");
patch(reconcile,'  const mergedDocs=new Map();','  const repairedDocs=[];');
patch(reconcile,`    const raw=applyDocRepair(rawDoc,assignment,aliases),key=docKey(raw),prev=mergedDocs.get(key);
    mergedDocs.set(key,prev?deduplicateArchiveDocuments([prev,raw])[0]:raw);
  }
  const allDocs=`, `    repairedDocs.push(applyDocRepair(rawDoc,assignment,aliases));
  }
  const mergedDocs=new Map();
  for(const raw of projectReviewedCopies(repairedDocs,value=>aliases.get(upper(value))||upper(value))){
    const key=docKey(raw),prev=mergedDocs.get(key);
    mergedDocs.set(key,prev?preferredSourceCopy(prev,raw):raw);
  }
  const allDocs=`);
// Exports retain every distinct original identity, with the same corrected filing.
const transfer=base+'transferCoreV110412.js';
patch(transfer,'export function selectTransfer(',"import {projectReviewedCopies} from './sourceCopiesV110419.js';\nexport function selectTransfer(");
patch(transfer,'  for (const raw of [...documents, ...(businessStore.documents || []), ...allDocuments, ...shown]) {','  for (const raw of projectReviewedCopies([...documents, ...(businessStore.documents || []), ...allDocuments, ...shown])) {');
// Checklists outside the folder browser use the same source-copy decision.
const core=base+'evidenceCoreV110413.js';
patch(core,'export function uniqueDocuments(documents=[]) {',"import {projectReviewedCopies,preferredSourceCopy} from './sourceCopiesV110419.js';\nexport function uniqueDocuments(documents=[],resolve) {");
patch(core,'  for(const doc of documents) {','  for(const doc of projectReviewedCopies(documents,resolve)) {');
patch(core,`    const old=map.get(id), oldReview=old?.extracted?.evidenceFactsV1, review=doc.extracted?.evidenceFactsV1;
    if(!old || review && (!oldReview || text(review.reviewedAt)>=text(oldReview.reviewedAt)))map.set(id,doc);`,`    const key=[id,loadOf(doc),kindOf(doc),sourceHashes(doc).join(',')].join('|');
    const old=map.get(key);
    map.set(key,old?preferredSourceCopy(old,doc):doc);`);
patch(core,'  const all=uniqueDocuments(documents), target=resolve(loadNo);','  const all=uniqueDocuments(documents,resolve), target=resolve(loadNo);');
const storage=base+'evidenceStorageV110413.js';
patch(storage,"import {getOwnerOpDb}","import {selectReviewRecord} from './sourceCopiesV110419.js';\nimport {getOwnerOpDb}");
patch(storage,`        if(matches.length!==1)throw new Error('The saved original could not be identified uniquely. Reopen the document.');
        const current=matches[0];`,`        const current=selectReviewRecord(matches,doc,sourceHash);`);
patch(storage,'  next.auditTrail=[...list(doc.auditTrail)', '  delete next.sourceCopyReviewV110419;\n  next.auditTrail=[...list(doc.auditTrail)');
console.log('PASS — v110419 confirmed source copies reconciled before filing and export; current reviewed details displayed');
