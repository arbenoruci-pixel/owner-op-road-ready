import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;if(s.split(b).length!==2)throw Error('Load evidence anchor changed: '+p);fs.writeFileSync(p,s.replace(b,a));}
const base='source/src/modules/owneros/';
// A duty-log reference can be a shipping/BOL number, or an unfinished route.
// It may enrich a saved load, but cannot create a new business document folder.
const engine=base+'loadFolderEngineV10969.js';
patch(engine,"for(const legs of Object.values(state.routeLegsByDay||{}))for(const l of legs||[]){const n=upper(l.loadNo||l.orderNo||l.shippingDocs);if(n&&n!=='178564'&&!map.has(n))map.set(n,{id:`load_${n}`,loadNo:n,status:'tracked'});}","/* Route references remain in the logbook until linked to a saved load or document. */");
const evidence=base+'evidenceCoreV110413.js';
patch(evidence,"notes:'Notes'});","notes:'Notes',deliveryAuthorization:'Broker authorization for alternative delivery proof'});");
patch(evidence,"  invoice:{readerType:","  delivery_evidence:{label:'Authorized delivery proof',uses:['load','audit'],fields:['date','loadNo','reference','origin','destination','deliveryAuthorization','notes']},\n  invoice:{readerType:");
patch(evidence,"{id:'pod',label:'Signed delivery proof',kinds:['pod'],stage:'delivery'}","{id:'pod',label:'Delivery proof',kinds:['pod','delivery_evidence'],stage:'delivery'}");
patch(evidence,"if((tonu||cancelled)&&['bol','pod'].includes(rule.id))continue;","if((tonu||cancelled)&&['bol','pod'].includes(rule.id)||cancelled&&rule.id==='invoice')continue;");
// Authorization and explanation are required for alternative evidence. Merely
// uploading a trailer photograph cannot satisfy delivery proof.
patch(evidence,".filter(k=>k!=='notes').every(k=>usable(fields[k],k))", ".filter(k=>k!=='notes'||kind==='delivery_evidence').every(k=>usable(fields[k],k))");
const view=base+'driverDocumentsV110415.js';
patch(view,"label:row.kind==='pod'?'Signed POD':row.label","label:row.kind==='pod'?(candidates.some(s=>s.verified&&componentsOf(s.doc).some(c=>c.kind==='delivery_evidence'&&c.reviewed))?'Authorized delivery proof':'Signed POD'):row.label");
patch(view,"c.kind==='pod'&&c.reviewed&&resolve", "['pod','delivery_evidence'].includes(c.kind)&&c.reviewed&&resolve");
// Source dates and service dates remain separate; the UI uses only an explicit
// reviewed deliveryDate for either form of delivery proof.
const VERSION='110.4.42',BUILD='v110442-load-evidence';
for(const p of ['release-version.json','public/app-version.json']){
 const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.42 Load folders',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Create document folders from saved loads and original documents.','Link logbook references without creating extra empty loads.','Support reviewed broker-authorized delivery evidence and cancelled-load requirements.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replaceAll('v110.4.41','v'+VERSION).replaceAll('V110.4.41','V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.41'","'"+VERSION+"'").replaceAll("'v110441-reviewed-checksums'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.42 source-backed load folders and authorized delivery evidence');
