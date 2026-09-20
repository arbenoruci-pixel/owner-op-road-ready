import assert from 'node:assert/strict';
import {sertifiRateInput} from '../packages/smart-reader-core/test/sertifi-rate-fixture.mjs';
import {decideDocumentIdentity} from '../source/src/modules/scan/documentIdentityV110334.js';
import {guardOcrLayoutReading} from '../source/src/modules/scan/documentLayoutGuardV110337.js';

const pages=sertifiRateInput().pages.map(page=>page.observations[0].lines.map(line=>line.text).join('\n'));
const analysis={type:{id:'rate_confirmation'},pageCount:3,
 text:pages.map((text,i)=>`[[PAGE:${i+1}]]\n${text}`).join('\n'),
 fields:{loadNo:'86420',total:500},routing:{autoFile:false}};
const before=JSON.stringify(analysis),decision=decideDocumentIdentity(analysis);
assert.equal(decision.typeId,'rate_confirmation');
assert.ok(!decision.mixedDocuments,'matching continuation remains part of the RateCon');
assert.equal(decision.attachmentReview.required,false,'exact numeric signing ID links the certificate');
const guarded=guardOcrLayoutReading({...analysis,typeEvidenceV110334:decision});
assert.equal(guarded.fields.loadNo,'86420');assert.equal(guarded.fields.total,500);
assert.equal(JSON.stringify(analysis),before);
for(const replacement of ['20250711111222999','20250711111222333A']){
 const changed=pages.slice();changed[1]=changed[1].replaceAll('20250711111222333',replacement);
 assert.equal(decideDocumentIdentity({...analysis,text:changed.map((text,i)=>`[[PAGE:${i+1}]]\n${text}`).join('\n')}).mixedDocuments,true);
}
const mismatch=pages.slice();mismatch[2]=mismatch[2].replaceAll('20250711111222333','20250711111222999');
assert.equal(decideDocumentIdentity({...analysis,text:mismatch.map((text,i)=>`[[PAGE:${i+1}]]\n${text}`).join('\n')}).attachmentReview.required,true);
const weak={...analysis,ocrEvidenceV110323:pages.map((text,i)=>({id:'read-'+i,page:i+1,text,confidence:.96,
 lines:text.split('\n').map(text=>({text,confidence:i===1&&text.startsWith('Doc ID')?25:96}))}))};
assert.equal(decideDocumentIdentity(weak).mixedDocuments,true,'weak signing reference cannot establish continuation');
console.log('PASS — signed RateCon keeps filing type and load fields; mismatched and weak references stay under review');
