import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8');
function patch(file,before,after){const source=read(file);if(source.includes(after))return;assert.equal(source.split(before).length,2,'Reader anchor: '+file);fs.writeFileSync(file,source.replace(before,after));}
const catalog='source/src/modules/scan/truckDocumentCatalogV1040.js';
patch(catalog,"export const TRUCK_DOCUMENT_TYPES_V1040 = Object.freeze([","export const TRUCK_DOCUMENT_TYPES_V1040 = Object.freeze([\n  t('delivery_order','Delivery Order','Delivery Order','load','documents','other',['load_folder','logbook'],[[/delivery\\s+orde[r]?/i,90]],{required:['loadNo'],priority:45,description:'Shipping authorization; verify the destination load.'}),");
patch('source/src/modules/scan/smartScanRoutingV11039.js',"'rate_confirmation','load_tender','bol','pod','delivery_receipt','packing_list',","'rate_confirmation','load_tender','bol','pod','delivery_receipt','delivery_order','packing_list',");
// The core sees original page geometry. Promote its Delivery Order identity
// only when every page agrees; keep packet boundaries and folder review.
const identity='source/src/modules/scan/documentIdentityV110334.js';
patch(identity,"import {extraPageIdentity","import {reviewScanAnalysis} from './ownedReaderAdapter.js';\nimport {extraPageIdentity");
patch(identity,"  const pages=documentPages(analysis),pageTypes=pages.map(page=>{","  const sourceReview=reviewScanAnalysis(analysis);\n  const deliveryPages=sourceReview.pageIdentities.filter(page=>page.kind==='delivery_order'&&page.status==='supported');\n  const deliveryReferences=sourceReview.documents.filter(doc=>doc.kind==='delivery_order').map(doc=>doc.reference);\n  const deliveryPacketReview=sourceReview.pages.length>1&&(deliveryReferences.some(ref=>!ref)||new Set(deliveryReferences).size!==1);\n  if(deliveryPages.length&&deliveryPages.length===sourceReview.pages.length)return {typeId:'delivery_order',confidence:deliveryPacketReview?.49:.85,requiresTypeReview:deliveryPacketReview,mixedDocuments:deliveryPacketReview,clearShipmentFields:deliveryPacketReview,attachmentReview:{required:deliveryPacketReview,reason:'Confirm whether these Delivery Orders belong to the same load.'},pageTypes:sourceReview.pages.map(page=>({page:page.number,typeId:'delivery_order',supporting:false,conflicting:false,evidence:['Delivery Order heading and shipping fields on the source page']})),reason:'Delivery Order heading and shipping fields; confirm the load folder.'};\n  const pages=documentPages(analysis),pageTypes=pages.map(page=>{");
const VERSION='110.4.22',BUILD='v110422-delivery-order-ai',stamp=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(read(file));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.22 GPS, DOT Inspection and signing',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,notes:['Recognize sideways Delivery Orders without mislabeling them as BOL or POD.','Route Delivery Orders through the existing verified load matching flow.','Enable project-scoped AI assistance and cover four unclear pages per scan.']});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']) {const value=JSON.parse(read(file));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let value=read(file);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);fs.writeFileSync(file,value);
}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const file of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(file,read(file).replaceAll("'110.4.21'","'"+VERSION+"'").replaceAll("'v110421-gps-sign-dot'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — Delivery order and project-scoped AI reader installed');
