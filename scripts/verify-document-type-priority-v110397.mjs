import fs from 'node:fs';
import assert from 'node:assert/strict';
import {classifyDocument} from '../source/src/modules/scan/smartScan.js';
import {arbitrateDocumentTypeV104} from '../source/src/modules/scan/documentTypeArbiterV104.js';
import {extraPageIdentity} from '../source/src/modules/scan/ownedPageIdentityV110338.js';
import {decideDocumentIdentity} from '../source/src/modules/scan/documentIdentityV110334.js';
import {readDocument,textObservation} from '../packages/smart-reader-core/src/index.js';
const bol='BILL OF LADING - NOT NEGOTIABLE\nBill of Lading Number: B-1234\nSHIP FROM: EXAMPLE MILL\nSHIP TO: EXAMPLE MARKET\nWeight: 1200 LB';
const pod=bol+'\nReceived by: J. DOE';
const fuel='RECEIPT\nReceipt # R-1234\nDEF\nPump: 12\nPrice/Gal: 3.999\nTotal: $39.99\nPayment: CARD';
for(const [text,id] of [[bol,'bol'],[pod,'pod'],[fuel,'fuel_receipt']]){
  assert.equal(classifyDocument(text).type.id,id);
  assert.equal(arbitrateDocumentTypeV104({fullText:text,genericClassification:{type:{id:'other'}}}).id,id);
  assert.equal(extraPageIdentity(text).typeId,id);
  assert.equal(decideDocumentIdentity({text,type:{id:'other'}}).typeId,id);
  const result=readDocument({documentId:'release',pages:[{observations:[textObservation(text)]}]});
  assert.equal(result.engineVersion,'0.3.34');assert.equal(result.documents[0].canAutoFile,false);
}
const packet=decideDocumentIdentity({text:'[[PAGE:1]]\n'+bol+'\n[[PAGE:2]]\nAdditional notes: keep this sheet',type:{id:'bol'}});
assert.equal(packet.typeId,'bol');assert.equal(packet.mixedDocuments,true);assert.equal(packet.requiresTypeReview,true);
const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
assert.equal(meta.version,'110.3.97');assert.equal(meta.build,'v110397-document-type-priority');
assert.ok(fs.readFileSync('public/sw.js','utf8').includes(meta.build));
console.log('PASS — materialized POD/fuel/primary-page decisions and 110.3.97 release');
