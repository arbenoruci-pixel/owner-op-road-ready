import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument} from '../../packages/smart-reader-core/src/index.js';
import {scanWithSourceFields} from '../../packages/smart-reader-core/src/scanFields.js';
import {columnBolInput} from '../../packages/smart-reader-core/test/bol-columns-fixture.mjs';
import {numberedRateInput,numberedRateText} from '../../packages/smart-reader-core/test/numbered-rate-fixture.mjs';
import {reviewAssignment} from '../../source/src/modules/scan/reviewAssignmentV110411.js';
import {finalizeSmartScanAnalysisV11039} from '../../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
import {loadDocumentSummaryV105} from '../../source/src/modules/documents/documentFoundationV105.js';
const result=readDocument(columnBolInput()),analysis={type:{id:'bol'},fields:{},text:result.pages[0].observations.flatMap(o=>o.lines.map(l=>l.text)).join('\n')};
const base={analysis,review:{analysis,result},typeId:'bol',state:{},businessStore:{loads:[{source:'rate_confirmation_v105',loadNo:'00654321'}],documents:[]}};
test('source BOL reference supplies the initially missing automatic folder suggestion',()=>{
 const refreshed=reviewAssignment(base);assert.equal(refreshed.loadNo,'00654321');assert.equal(refreshed.documentDate,'2026-09-24');assert.equal(refreshed.match.automatic,true);
});
test('a supported secondary OCR reference can match without appearing in the primary text',()=>{
 const secondary={...analysis,text:'BILL OF LADING'};assert.equal(reviewAssignment({...base,analysis:secondary,review:{analysis:secondary,result}}).loadNo,'00654321');
});
test('source updates preserve a manual folder and explicit Choose later',()=>{
 for(const [loadNo,assignment]of [['OTHER','driver_selected'],['','driver_unassigned']])assert.equal(reviewAssignment({...base,loadNo,assignment}).loadNo,loadNo);
 assert.equal(reviewAssignment({...base,analysis:{...analysis}}),null,'stale source review cannot update another scan');
});
test('ambiguous aliases and mixed packets cannot choose a folder',()=>{
 const businessStore={loads:[{source:'rate_confirmation_v105',loadNo:'A1234',aliases:[{kind:'bol_number',value:'00654321'}]},{source:'rate_confirmation_v105',loadNo:'B1234',aliases:[{kind:'bol_number',value:'00654321'}]}]};
 assert.equal(reviewAssignment({...base,businessStore}).loadNo,'');
 const mixed={...analysis,typeEvidenceV110334:{mixedDocuments:true}};
 assert.equal(reviewAssignment({...base,analysis:mixed,review:{analysis:mixed,result}}).loadNo,'');
});
test('full scanner keeps numbered RateCon plus delivery-related terms together',()=>{
 const text=numberedRateText.map((t,i)=>`[[PAGE:${i+1}]]\n${t}`).join('\n');
 const value=finalizeSmartScanAnalysisV11039({text,type:{id:'other'},fields:{},pageCount:2},{state:{},businessStore:{}});
 assert.equal(value.type.id,'rate_confirmation');assert.notEqual(value.typeEvidenceV110334.mixedDocuments,true);
 const review={analysis:value,result:readDocument(numberedRateInput())};
 const payWarning='Agreed carrier pay was not found under a payment label. Fees and detention amounts are excluded.';
 assert.ok(value.evidenceReviewV11036.issues.includes(payWarning),'legacy scan does not recognize the numbered pay table');
 assert.ok(!scanWithSourceFields(value,review,value.type.id).evidenceReviewV11036.issues.includes(payWarning),'source-supported pay clears its stale warning');
 const unresolved=structuredClone(review.result);unresolved.documents[0].fields.totalRate={...unresolved.documents[0].fields.totalRate,status:'needs_review',value:null};
 assert.ok(scanWithSourceFields(value,{analysis:value,result:unresolved},value.type.id).evidenceReviewV11036.issues.includes(payWarning),'unresolved pay retains its warning');
 const refreshed=reviewAssignment({analysis:value,review,typeId:value.type.id,state:{},businessStore:{}});
 assert.equal(refreshed.loadNo,'24680');assert.equal(refreshed.documentDate,'2026-09-24');
});
test('a verified saved POD covers BOL on its exact current load without duty linking',()=>{
 const store={documents:[{id:'pod',canonicalLoadNo:'00654321',type:'pod',status:'verified',documentDate:'2026-09-24',linkToLogbook:false}]};
 assert.equal(loadDocumentSummaryV105(store,'00654321').bolPresent,true);assert.equal(loadDocumentSummaryV105(store,'other').bolPresent,false);
 assert.equal(loadDocumentSummaryV105({documents:[{...store.documents[0],status:'needs_review'}]},'00654321').bolPresent,false);
});
