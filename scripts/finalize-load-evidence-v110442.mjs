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
patch(evidence,"export function billingEvidencePages(doc,loadNo) {",`export function reviewedEvidenceComponents(doc,kinds,loadNo,businessStore={}) {
  const resolve=evidenceLoadResolver(businessStore),ref=resolve(loadNo);
  return componentsOf(doc).filter(component=>{
    const fields={...documentFacts(doc),...component.fields},kind=component.kind;
    return isReviewed(doc)&&component.reviewed===true&&kinds.includes(kind)&&resolve(fields.loadNo)===ref&&(CATALOG[kind]?.fields||[]).filter(k=>k!=='notes'||kind==='delivery_evidence').every(k=>usable(fields[k],k));
  });
}
export function billingEvidencePages(doc,loadNo) {`);
patch(evidence,"componentsOf(doc).filter(c=>c.reviewed===true&&['rate_confirmation','tonu','bol','pod'].includes(c.kind)&&text(c.fields?.loadNo).toUpperCase()===text(loadNo).toUpperCase()&&(CATALOG[c.kind]?.fields||[]).filter(k=>k!=='notes').every(k=>usable(({...documentFacts(doc),...c.fields})[k],k)))","reviewedEvidenceComponents(doc,['rate_confirmation','tonu','bol','pod','delivery_evidence'],loadNo)");
const billing=base+'ownerOpsStoreV102.js',submission=base+'invoiceSubmissionV110320.js';
patch(billing,"hasReviewedEvidence(d,['pod'],loadNo,businessStore)","hasReviewedEvidence(d,['pod','delivery_evidence'],loadNo,businessStore)");
patch(billing,"label:'Final signed POD'","label:'Final delivery proof'");
patch(submission,"'proof_of_delivery', 'delivery_receipt', 'lumper_receipt'","'proof_of_delivery', 'delivery_receipt', 'delivery_evidence', 'lumper_receipt'");
patch(submission,"hasReviewedEvidence(doc,['pod'],load.loadNo)","hasReviewedEvidence(doc,['pod','delivery_evidence'],load.loadNo)");
patch(submission,"confirm the receiver signature or RECEIVED stamp.","confirm the receiver signature, RECEIVED stamp, or broker-authorized alternative proof.");
const view=base+'driverDocumentsV110415.js';
patch(view,"label:row.kind==='pod'?'Signed POD':row.label","label:row.kind==='pod'?(candidates.find(s=>s.verified)?.proofKind==='delivery_evidence'?'Authorized delivery proof':'Signed POD'):row.label");
patch(view,"componentsOf,hasReviewedEvidence,","componentsOf,hasReviewedEvidence,reviewedEvidenceComponents,");
patch(view,"const preferred=kinds.find(kind=>parts.some(c=>c.kind===kind));","const reviewedParts=reviewedEvidenceComponents(doc,kinds,ref,businessStore);\n      const preferred=kinds.find(kind=>reviewedParts.some(c=>c.kind===kind))||kinds.find(kind=>parts.some(c=>c.kind===kind));");
patch(view,"parts.filter(c=>c.kind===preferred)","(reviewedParts.length?reviewedParts:parts).filter(c=>c.kind===preferred)");
patch(view,"return [{doc,pages,verified:hasReviewedEvidence(doc,kinds,ref,businessStore)}];","return [{doc,pages,proofKind:preferred,verified:reviewedParts.length>0}];");
patch(view,"componentsOf(s.doc).filter(c=>c.kind==='pod'&&c.reviewed&&resolve(c.fields?.loadNo||loadOf(s.doc))===ref)","reviewedEvidenceComponents(s.doc,['pod','delivery_evidence'],ref,businessStore).filter(c=>c.kind===s.proofKind)");
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
