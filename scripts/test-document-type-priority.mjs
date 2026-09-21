import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

// Exercise the real page-identity installation steps without building or
// publishing the PWA. Only the identity portions of the release scripts run.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'reader-types-'));
after(()=>fs.rmSync(runtime,{recursive:true,force:true}));
const copy=(from,to=from)=>{const target=path.join(runtime,to);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(root,from),target,{recursive:true});};
copy('packages/smart-reader-core');copy('scripts/owned-reader');
copy('scripts/v110334/documentIdentity.js','source/src/modules/scan/documentIdentityV110334.js');
for(const file of ['smartScan.js','documentTypeArbiterV104.js'])copy('source/src/modules/scan/'+file);
fs.writeFileSync(path.join(runtime,'package.json'),'{"type":"module"}');
const run=source=>execFileSync(process.execPath,['--input-type=module','--eval',source],{cwd:runtime,stdio:'pipe'});
run(`import {installReaderPacketsV110338} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/v110338/install.mjs')).href)};installReaderPacketsV110338();`);
for(const [file,end] of [['finalize-reader-catalog-v110361.mjs',"patch(scan+'SmartScanSheetV105.jsx','const loadNo"],
  ['finalize-ratecon-structure-v110388.mjs','const result=spawnSync'],['finalize-receipt-consensus-v110392.mjs','  const stamp =']]){
  const source=fs.readFileSync(path.join(root,'scripts',file),'utf8');
  assert.equal(source.split(end).length,2,'Unambiguous identity installer boundary');run(source.split(end)[0]);
}
const load=file=>import(pathToFileURL(path.join(runtime,'source/src/modules/scan',file)).href);
const {classifyDocument}=await load('smartScan.js');
const {arbitrateDocumentTypeV104}=await load('documentTypeArbiterV104.js');
const {extraPageIdentity}=await load('ownedPageIdentityV110338.js');
const {decideDocumentIdentity,applyDocumentIdentity}=await load('documentIdentityV110334.js');
const {guardOcrLayoutReading}=await load('documentLayoutGuardV110337.js');
const bol='BILL OF LADING - NOT NEGOTIABLE\nBill of Lading Number: B-1234\nSHIP FROM: EXAMPLE MILL\nSHIP TO: EXAMPLE MARKET\nWeight: 1200 LB';
const pod=bol+'\nReceived by: J. DOE';
const fuel='RECEIPT\nReceipt # R-1234\nDate: 2026-09-21\nDEF\nPump: 12\nPrice/Gal: 3.999\nSubtotal: $39.99\nTotal: $39.99\nPayment: CARD';
const packet=(...pages)=>pages.map((text,i)=>`[[PAGE:${i+1}]]\n${text}`).join('\n');

test('POD and fuel survive every classifier, filename bias and stale supplied scores',()=>{
  for(const [text,id] of [[pod,'pod'],[fuel,'fuel_receipt']]){
    assert.equal(classifyDocument(text,'rate-confirmation.pdf').type.id,id);
    assert.equal(arbitrateDocumentTypeV104({fullText:text,fileName:'bol.pdf',preferredType:'bol',genericClassification:{type:{id:'bol'}}}).id,id);
    assert.equal(extraPageIdentity(text).typeId,id);
    assert.equal(decideDocumentIdentity({text,type:{id:'bol'}}).typeId,id);
  }
});

test('fuel evidence bypasses repeated generic receipt keywords',()=>{
  const result=classifyDocument(fuel+'\n'+('receipt subtotal sales tax total amount paid\n'.repeat(15)));
  assert.equal(result.type.id,'fuel_receipt');assert.equal(result.confidence,.96);
  assert.equal(result.sourceIdentity.requiresTypeReview,false);
});

test('rate confirmation retains its primary identity around delivery instructions and fuel surcharge',()=>{
  const text='RATE CONFIRMATION\nLoad No: LD-1234\nCarrier: Example Transport\nTotal Carrier Pay: $2300.00\nPickup Date: 2026-09-21\nDelivery Date: 2026-09-22\nDriver must submit signed bill of lading.\nReceived by signature required.\nFuel surcharge: $150';
  assert.equal(classifyDocument(text).type.id,'rate_confirmation');
  assert.equal(arbitrateDocumentTypeV104({fullText:text}).id,'rate_confirmation');
  assert.equal(decideDocumentIdentity({text,type:{id:'bol'}}).typeId,'rate_confirmation');
});

test('unknown or generic additional pages retain a clear primary label and cannot link a load',()=>{
  for(const extra of ['Additional notes: keep this sheet','RECEIPT\nDate: 2026-09-21\nTotal: $10.00']){
    for(const text of [packet(bol,extra),packet(extra,bol)]){
      const analysis={text,type:{id:'bol'},confidence:.95,fields:{bolNo:'B-1234',loadNo:'STALE'},matchedLoadNo:'STALE',routing:{autoFile:true}};
      const before=structuredClone(analysis),decision=decideDocumentIdentity(analysis);
      assert.equal(decision.typeId,'bol');assert.equal(decision.requiresTypeReview,true);assert.equal(decision.mixedDocuments,true);
      const result=guardOcrLayoutReading(applyDocumentIdentity(analysis,decision,id=>({id}),value=>value));
      assert.equal(result.type.id,'bol');assert.equal(result.routing.autoFile,false);assert.equal(result.matchedLoadNo,'');
      assert.equal(result.fields.loadNo,undefined);assert.equal(result.text,text);assert.deepEqual(analysis,before);
    }
  }
});

test('a conflicting extra page cannot overwrite the identified primary page',()=>{
  const result=decideDocumentIdentity({text:packet(bol,pod+'\n'+fuel),type:{id:'bol'}});
  assert.equal(result.typeId,'bol');assert.equal(result.pageTypes[1].conflicting,true);
  assert.equal(result.requiresTypeReview,true);assert.equal(result.clearShipmentFields,true);
});

test('two clear document types or different BOL references keep packet review',()=>{
  for(const text of [packet(bol,fuel),packet(bol,bol.replace('B-1234','B-9999'))]){
    const result=decideDocumentIdentity({text,type:{id:'bol'}});
    assert.equal(result.typeId,'other');assert.equal(result.mixedDocuments,true);assert.equal(result.clearShipmentFields,true);
  }
});

test('refined OCR reads reach the filing selector, and conflicting references remain visible',()=>{
  for(const [generic,specific,id] of [[bol,pod,'pod'],[fuel.replace('DEF\nPump: 12\nPrice/Gal: 3.999\n',''),fuel,'fuel_receipt']]){
    const analysis={text:generic,type:{id:'other'},ocrEvidenceV110323:[{id:'first',page:1,text:generic,confidence:.96},{id:'retry',page:1,text:specific,confidence:.96}]};
    assert.equal(decideDocumentIdentity(analysis).typeId,id);
    analysis.ocrEvidenceV110323[0].text=generic.replace('1234','9999');
    assert.equal(decideDocumentIdentity(analysis).typeId,'other');
  }
});
