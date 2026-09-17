import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.61',BUILD='v110361-trucking-document-catalog';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){
  const source=read(path);if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,'Document catalog anchor: '+path);
  fs.writeFileSync(path,source.replace(before,after));
}
const scan='source/src/modules/scan/';
fs.copyFileSync('scripts/owned-reader/pageIdentity.js',scan+'ownedPageIdentityV110338.js');
fs.copyFileSync('scripts/owned-reader/layoutGuard.js',scan+'documentLayoutGuardV110337.js');
const identity=scan+'documentIdentityV110334.js';
patch(identity,"import {extraPageIdentity} from './ownedPageIdentityV110338.js';","import {extraPageIdentity,attachmentRelationship} from './ownedPageIdentityV110338.js';");
patch(identity,"export function inspectPageIdentity(text=''){", "export function inspectPageIdentity(text=''){\n  const sourceIdentity=extraPageIdentity(text);if(sourceIdentity)return sourceIdentity;");
patch(identity,"return {page:page.page,typeId:ids.length===1?ids[0]:ids.length?'other':'',", "return {page:page.page,supporting:evidence.length>0&&evidence.every(e=>e.role==='supporting'),typeId:ids.length===1?ids[0]:ids.length?'other':'',");
patch(identity,'const types=[...new Set(pageTypes.map(p=>p.typeId).filter(Boolean))];','const types=[...new Set(pageTypes.filter(p=>!p.supporting).map(p=>p.typeId).filter(Boolean))];');
patch(identity,'!pageTypes[i].typeId&&page.reads.some(text=>text.trim())','!pageTypes[i].supporting&&!pageTypes[i].typeId&&page.reads.some(text=>text.trim())');
patch(identity,"pageTypes.find(p=>p.typeId)?.evidence[0]","pageTypes.find(p=>!p.supporting&&p.typeId)?.evidence[0]");
patch(identity,'const types=[...new Set(pageTypes.filter(p=>!p.supporting).map(p=>p.typeId).filter(Boolean))];','const types=[...new Set(pageTypes.filter(p=>!p.supporting).map(p=>p.typeId).filter(Boolean))];\n  const attachmentReview=attachmentRelationship(pages,pageTypes);');
patch(identity,'const requiresTypeReview=pageTypes.some(p=>p.requiresTypeReview);return {typeId:types[0],','const requiresTypeReview=attachmentReview.required||pageTypes.some(p=>p.requiresTypeReview);return {attachmentReview,typeId:types[0],');
patch(identity,'reason:pageTypes.find(p=>!p.supporting&&p.typeId)?.evidence[0]','reason:attachmentReview.required?attachmentReview.reason:pageTypes.find(p=>!p.supporting&&p.typeId)?.evidence[0]');
patch(identity,"  const current=analysis.type?.id||'other';","  if(types.includes('other'))return {typeId:'other',confidence:.49,requiresTypeReview:true,pageTypes,reason:pageTypes.find(p=>p.typeId==='other')?.evidence[0]};\n  const current=analysis.type?.id||'other';");
patch(scan+'SmartScanSheetV105.jsx','const loadNo = resumed ? resumed.loadNo :','const loadNo = result.typeEvidenceV110334?.attachmentReview?.required && !preserveLoadChoice ? \'\' : resumed ? resumed.loadNo :');
patch(scan+'SmartScanSheetV105.jsx','analysis.typeEvidenceV110334.mixedDocuments||!analysis.userSelectedTypeV11036','analysis.typeEvidenceV110334.mixedDocuments||analysis.typeEvidenceV110334.attachmentReview?.required||!analysis.userSelectedTypeV11036');
patch(scan+'OwnedReaderPreview.jsx','Shipping fields suggest this type. Confirm it against the page.','Document fields suggest this type. Confirm it against the page.');
patch(scan+'OwnedReaderPreview.jsx',"{k.id==='invoice'?'Carrier invoice':k.label}",'{k.label}');

// Keep the host filing catalog in agreement with the core profile ID.
patch(scan+'truckDocumentCatalogV1040.js',"  t('other','Other Document'",`  t('trailer_interchange','Trailer Interchange Agreement','Interchange','equipment','documents','other',['truck_wallet','business'],[
    [/trailer\\s+interchange\\s+agreement/i,85],[/equipment\\s+interchange/i,70],
  ],{ required:['unitNumber','date'], priority:35, linkable:false }),
  t('other','Other Document'`);

for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.61 Trucking document recognition',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Recognize trucking documents across the full app catalog in source review.','Read RateCons, delivery paperwork, invoices, receipts, permits and business forms with source evidence.','Keep signature attachments distinct from loads, and retain review for missing or conflicting readings.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=read(path);
  for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){
    const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');
    assert.equal([...value.matchAll(pattern)].length,1,'Unique release marker '+path+' '+key);
    value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.60');assert.equal(meta.build,'v110360-focused-source-review');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
patch('scripts/test-editor-grips-v110355.mjs',"assert.equal(meta.version,'110.3.60'); assert.equal(meta.build,'v110360-focused-source-review');",`assert.equal(meta.version,'${VERSION}'); assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — 110.3.61 document catalog and source-review routing installed');
