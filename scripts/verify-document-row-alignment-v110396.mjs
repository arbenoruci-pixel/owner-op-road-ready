import assert from 'node:assert/strict';
import fs from 'node:fs';
import {identityPacketInput,risingPackingInput,row} from '../packages/smart-reader-core/test/document-identity-fixture.mjs';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {decideDocumentIdentity} from '../source/src/modules/scan/documentIdentityV110334.js';
import {resolveEvidence} from '../packages/smart-reader-core/src/index.js';

// Anonymous reproduction of the follow-up OCR layout. This verifies the
// production adapter and filing decisions; it is not a camera OCR benchmark.
const input=identityPacketInput();
const first=input.pages[0];first.observations[0].lines[0].text='LTERNATE STRAIGHT BILL OF LADING - SHORT FORM';
first.observations[0].lines.push(row('CUSTOMER P.O.#: 902468',.2,.32,.3));
const other=structuredClone(first.observations[0]);other.id='table';other.sourceImageId='p1-table';
other.lines[0].text='JALTERNATE STRAIGHT BILL OF LADING - SHORT FORM';other.lines.at(-1).text='CUSTOMER P.O.#: 5902468';
first.observations.push(other);
input.pages[3]={id:'p4',observations:[{id:'clean',sourceImageId:'p4-clean',lines:[row('HL OF LADNG - NOT NEGOTIABLE',.35,.06,.4,.02,.55)]}]};
const last=risingPackingInput().pages[0];last.id='p6';for(const o of last.observations)o.sourceImageId='p6-'+o.id;
input.pages.push(last);
const dimensions={},passes=input.pages.flatMap((page,i)=>page.observations.map(o=>{
  const id=(i+1)+'-'+o.id,imageSize={width:1800,height:2400};dimensions[`page-${i+1}:${id}`]=imageSize;
  return {id,page:i+1,imageSize,confidence:.96,text:o.lines.map(l=>l.text).join('\n'),
    lines:o.lines.map(l=>({text:l.text,confidence:l.confidence*100,left:l.box.x*1800,top:l.box.y*2400,width:l.box.width*1800,height:l.box.height*2400}))};
}));
const analysis={type:{id:'other'},pageCount:input.pages.length,ocrEvidenceV110323:passes,
  pages:input.pages.map((p,i)=>({page:i+1,text:p.observations[0].lines.map(l=>l.text).join('\n')})),
  text:input.pages.map((p,i)=>`[[PAGE:${i+1}]]\n`+p.observations[0].lines.map(l=>l.text).join('\n')).join('\n'),
  fields:{},routing:{autoFile:false}};
const before=JSON.stringify(analysis),result=reviewScanAnalysis(analysis,{documentId:'followup-identity',dimensions});
assert.equal(result.engineVersion,'0.3.32');
assert.deepEqual(result.documents.map(d=>d.kind),['bol','packing_list','packing_list','unknown','bol','packing_list']);
assert.equal(result.documents[0].identityStatus,'needs_review');assert.equal(result.documents[0].fields.bolNumber.value,null);
assert.equal(result.documents[5].fields.packingSlipNumber.value,'700012345');
assert.equal(result.documents[5].fields.orderNumber.value,'0012345');
for(const i of [0,5]){const f=result.documents[i].fields.poNumber;assert.equal(f.value,null);assert.ok(f.issues.includes('conflicting_reads'));}
for(const d of result.documents)assert.equal(d.canAutoFile,false);
const decision=decideDocumentIdentity(analysis);
assert.equal(decision.pageTypes[0].typeId,'bol');assert.equal(decision.pageTypes[0].requiresTypeReview,true);
assert.equal(decision.pageTypes[5].typeId,'packing_list');assert.equal(decision.mixedDocuments,true);assert.equal(decision.clearShipmentFields,true);
for(const page of result.pageIdentities)for(const vote of page.evidence)for(const e of [vote.evidence,...vote.supportingEvidence])resolveEvidence(result,e);
for(const d of result.documents)for(const f of Object.values(d.fields))for(const c of f.candidates)for(const e of [...c.evidence,...(c.labelEvidence||[])])resolveEvidence(result,e);
assert.equal(JSON.stringify(analysis),before);
const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
assert.equal(meta.version,'110.3.96');assert.equal(meta.build,'v110396-document-row-alignment');
console.log('PASS — six-page classification, rising reference rows, conflicting PO evidence, filing boundaries and 110.3.96 release');
