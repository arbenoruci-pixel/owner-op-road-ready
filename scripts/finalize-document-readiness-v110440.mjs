import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;if(s.split(b).length!==2)throw Error('Document readiness anchor changed: '+p);fs.writeFileSync(p,s.replace(b,a));}
const base='source/src/modules/owneros/';
fs.copyFileSync('scripts/v110434/libraryReview.js',base+'libraryReviewV110434.js');
const storage=base+'libraryStorageV110434.js';
patch(storage,"import Dexie from 'dexie';","import Dexie from 'dexie';\nimport {retainedLibraryReview} from './libraryReviewV110434.js';");
patch(storage,"const fields={loadNo:d.loadNo||'',date:d.date||'',notes:d.note||''};","const fields={loadNo:d.loadNo||'',date:d.date||'',notes:d.note||''};\n const retained=retainedLibraryReview(old,d),date=retained?.fields?.date||d.date||'';");
patch(storage,"document_date:d.date||'',documentDate:d.date||'',","document_date:date,documentDate:date,");
patch(storage,"reviewStatus:'needs_review',status:'saved'","reviewStatus:retained?'verified':'needs_review',status:'saved'");
patch(storage,"date:d.date||'',evidenceFactsV1:{version:1,source:'imported_archive'","date,evidenceFactsV1:retained||{version:1,source:'imported_archive'");
const view=base+'driverDocumentsV110415.js';
patch(view,"const open=loadReviewRows(model,folder,businessStore),missing=", "const allOpen=loadReviewRows(model,folder,businessStore),open=allOpen.filter(r=>r.area==='load'),supporting=allOpen.filter(r=>r.area!=='load'),missing=");
patch(view,"let status={label:'Documents on file',tone:'saved'};","let status={label:rows.length&&rows.every(r=>r.status==='ready')?'Ready':'Documents on file',tone:'saved'};");
patch(view,"return {load,files,rows,open,missing,review,routeNote,status,","return {load,files,rows,open,supporting,missing,review,routeNote,status,");
// A BOL's printed document date can precede delivery. Only an explicit reviewed
// delivery date may override the stored service date on the card.
patch(view,".map(c=>day(c.fields?.date))).filter(Boolean))]",".map(c=>day(c.fields?.deliveryDate))).filter(Boolean))]");
const recovery=base+'recoveryCoreV110413.js';
patch(recovery,"component.reviewed!==true||!list(component.pages).length","typeof component.reviewed!=='boolean'||!list(component.pages).length");
const center=base+'EvidenceCenterV110413.jsx';
patch(center,"hideRecovery=false,embedded=false}","hideRecovery=false,embedded=false,reviewScope='all'}");
patch(center,"compact?loadReviewRows(model,folder,businessStore):", "compact?loadReviewRows(model,folder,businessStore).filter(r=>reviewScope==='all'||(reviewScope==='load'?r.area==='load':r.area!=='load')):");
const folders=base+'LoadFoldersV10969.jsx';
patch(folders,'<EvidenceCenter compact embedded hideRecovery documents=', '<EvidenceCenter compact embedded hideRecovery reviewScope="load" documents=');
patch(folders,'<LibraryHistory loadNo={folder.loadNo}/>','<LibraryHistory loadNo={folder.loadNo}/>\n      {current.supporting.length?<details className="rr-docs-options"><summary>Supporting file details ({current.supporting.length})</summary><p>These checks cover additional source dates and bookkeeping details. Required load documents are listed above.</p><EvidenceCenter compact embedded hideRecovery reviewScope="supporting" documents={allDocuments} businessStore={evidenceStore} ownerStore={ownerStore} loads={[current.load]} folder={folder} week={week} onScan={onScan} onImportMileage={onImportMileage}/></details>:null}');
const home='source/src/modules/home/ImportDocumentsScreenV110435.jsx';
patch(home,"import ImportLibraryPanel", "import RecoveryPanel from '../owneros/RecoveryPanelV110413.jsx';\nimport ImportLibraryPanel");
patch(home,'<ImportLibraryPanel/><div', '<ImportLibraryPanel/><section className="phone-import-help"><h2>Reviewed document details</h2><p>Apply a reviewed recovery file to link load references and confirm details from the originals.</p><RecoveryPanel/></section><div');
const VERSION='110.4.40',BUILD='v110440-document-readiness';
for(const p of ['release-version.json','public/app-version.json']){
 const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.40 Document readiness',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Show Ready when required load documents have source-bound reviews.','Keep supporting file checks accessible and preserve existing verified details during import.','Open reviewed recovery directly from Import.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replaceAll('v110.4.39','v'+VERSION).replaceAll('V110.4.39','V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.39'","'"+VERSION+"'").replaceAll("'v110439-recovery-lock'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.40 required document readiness and retained source reviews');

await import('./finalize-review-checksums-v110441.mjs');
