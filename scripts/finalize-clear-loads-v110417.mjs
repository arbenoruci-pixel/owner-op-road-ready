import fs from 'node:fs';
const VERSION='110.4.17',BUILD='v110417-clear-loads',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.17 Clear load documents',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Show service dates and load numbers clearly, in chronological order.','Keep document checks in one compact expandable row.','Keep weekly folders, original files and driving logs.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=fs.readFileSync(path,'utf8');for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.16'","'"+VERSION+"'").replaceAll("'v110416-document-weeks'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const ext of ['js','css'])fs.copyFileSync(`scripts/v110417/loadPresentation.${ext}`,`source/src/modules/owneros/loadPresentationV110417.${ext}`);
function patch(path,before,after){const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;if(source.split(before).length!==2)throw new Error('Clear loads anchor changed: '+path+' / '+before.slice(0,90));fs.writeFileSync(path,source.replace(before,after));}
const weeks='source/src/modules/owneros/documentWeeksV110416.js';
patch(weeks,"import {archiveWeeks,mondayForArchive}","import {serviceLoad,serviceDates,chronologicalLoads} from './loadPresentationV110417.js';\nimport {archiveWeeks,mondayForArchive}");
patch(weeks,'  const known=new Set(folders.map(f=>f.loadNo));',`  const datedFolders=folders.map(folder=>folder.days?.length?folder:{...folder,days:serviceDates(serviceLoad(folder,businessStore)).filingDays});
  const known=new Set(folders.map(f=>f.loadNo));`);
patch(weeks,'visibleWeeks(archiveWeeks(folders,state,','visibleWeeks(archiveWeeks(datedFolders,state,');
patch(weeks,"    const lastDay=folder=>(folder.days||[]).filter(d=>mondayForArchive(d)===week.start).at(-1)||'';\n    const items=[...week.items].sort((a,b)=>lastDay(b).localeCompare(lastDay(a))||a.loadNo.localeCompare(b.loadNo));",'    const items=chronologicalLoads(week.items,businessStore);');
const driver='source/src/modules/owneros/driverDocumentsV110415.js';
patch(driver,"import {uniqueDocumentFiles,savedExport}","import {serviceStage,serviceDates,serviceLoad} from './loadPresentationV110417.js';\nimport {uniqueDocumentFiles,savedExport}");
patch(driver,'  const load={...folder,...stored,loadNo:ref,origin:folder.origin||stored.origin,destination:folder.destination||stored.destination};','  const load={...serviceLoad(folder,businessStore),origin:folder.origin||stored.origin,destination:folder.destination||stored.destination};');
patch(driver,"  const stage=text(load.documentWorkflowStage||load.serviceStatus||load.status).toLowerCase();","  const stage=serviceStage(load);");
patch(driver,"  const delivered=['delivered','invoiced','submitted','paid'].includes(stage)||!!load.deliveredDate||rows.some(r=>r.kind==='pod'&&r.status==='ready');", "  const delivered=serviceDates(load).delivered||rows.some(r=>r.kind==='pod'&&r.status==='ready');");
patch(driver,"  const signedDate=rows.find(r=>r.kind==='pod'&&r.status==='ready')?.sources.find(s=>s.verified);\n  const date=day(load.deliveredDate)||day(load.deliveryDate)||day(signedDate&&documentFacts(signedDate.doc).date);",`  const signedDates=[...new Set((rows.find(r=>r.kind==='pod'&&r.status==='ready')?.sources||[]).filter(s=>s.verified).flatMap(s=>componentsOf(s.doc).filter(c=>c.kind==='pod'&&c.reviewed&&resolve(c.fields?.loadNo||loadOf(s.doc))===ref).map(c=>day(c.fields?.date))).filter(Boolean))];
  const date=day(load.deliveredDate||load.completedDate||load.deliveredAt||load.completedAt)||(signedDates.length===1?signedDates[0]:'')||day(load.deliveryDate);`);
patch(driver,'  return {load,files,rows,open,missing,review,routeNote,status,attention:',`  const service=serviceDates({...load,...(delivered&&date?{deliveredDate:date}:{})});
  return {load,files,rows,open,missing,review,routeNote,status,cardDate:service.cardDate,attention:`);
const folders='source/src/modules/owneros/LoadFoldersV10969.jsx';
patch(folders,"import './driverDocumentsV110415.css';","import './driverDocumentsV110415.css';\nimport './loadPresentationV110417.css';");
patch(folders,'  const heading=useRef(null)', '  const [checksOpen,setChecksOpen]=useState(false);\n  const heading=useRef(null)');
patch(folders,'setMoreOpen(false);setSourceChoice(null);','setMoreOpen(false);setChecksOpen(false);setSourceChoice(null);');
patch(folders,`      {current.routeNote?<details className="rr-driver-route-note"><summary>! Check route <span>View note ›</span></summary><p>{current.routeNote}</p></details>:null}
      <EvidenceCenter compact hideRecovery documents={allDocuments} businessStore={evidenceStore} ownerStore={ownerStore} loads={[current.load]} folder={folder} week={week} onScan={onScan} onImportMileage={onImportMileage} onOpenLog={onOpenLog}/>`, `      {current.attention>0?<section className="rr-driver-checks" aria-label="Load checks">
        <button type="button" className="rr-driver-check-toggle" aria-expanded={checksOpen} aria-controls="rr-load-check-details" onClick={()=>setChecksOpen(v=>!v)}><span>! {current.attention} {current.attention===1?'item':'items'} to check</span><span>{checksOpen?'Hide':'View'} {checksOpen?'⌃':'›'}</span></button>
        {checksOpen?<div id="rr-load-check-details" className="rr-driver-check-body">
          {current.routeNote?<div><h4>Check route</h4><p>{current.routeNote}</p></div>:null}
          <EvidenceCenter compact embedded hideRecovery documents={allDocuments} businessStore={evidenceStore} ownerStore={ownerStore} loads={[current.load]} folder={folder} week={week} onScan={onScan} onImportMileage={onImportMileage} onOpenLog={onOpenLog}/>
        </div>:null}
      </section>:null}`);
patch(folders,'<span className="rr-docs-card-copy"><strong>{views.get(f.loadNo).origin}',`<span className="rr-docs-card-copy"><span className="rr-driver-load-id"><span>Load {f.loadNo}</span>{views.get(f.loadNo).amount>0?<b>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(views.get(f.loadNo).amount)}</b>:null}</span><strong>{views.get(f.loadNo).origin}`);
patch(folders," · Load {f.loadNo}</small><span className=\"rr-driver-card-date\">{folderWeekDates(f,week.start)}</span>","</small><span className=\"rr-driver-card-date\">{views.get(f.loadNo).cardDate}</span>");
// An open check on one load must never carry into the next load.
const evidence='source/src/modules/owneros/EvidenceCenterV110413.jsx';
patch(evidence,'compact=false,hideRecovery=false','compact=false,hideRecovery=false,embedded=false');
patch(evidence,'  if(compact&&!rows.length&&!selected)return null;',"  const Checklist=embedded?'div':'details';\n  if(compact&&!rows.length&&!selected)return null;");
patch(evidence,'    <details open={compact?undefined:!!folder}>','    <Checklist {...(embedded?{}:{open:compact?undefined:!!folder})}>');
const summary=fs.readFileSync(evidence,'utf8').split('\n').find(line=>line.startsWith('      <summary>{compact?'));
if(summary)patch(evidence,summary,summary.replace('<summary>','{!embedded?<summary>')+':null}');
patch(evidence,'    </details>\n    {selected?', '    </Checklist>\n    {selected?');
// Keep historical behavioral checks, adapting their visible service-date copy.
const browser='scripts/v110416/browser-weeks.mjs';
patch(browser,"      assert.equal(await docs.locator('.rr-driver-card-date').getByText('Sep 25',{exact:true}).count(),5);", "      assert.equal(await docs.locator('.rr-driver-card-date').filter({hasText:'Sep 25'}).count(),5);");
console.log('PASS — v110417 clear load identity, service dates and compact checks installed');
