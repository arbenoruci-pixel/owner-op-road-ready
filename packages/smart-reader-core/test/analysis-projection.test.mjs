import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation} from '../src/index.js';
import {createAnalysisProjection,analysisWithProjection,readSavedAnalysis} from '../src/analysisProjection.js';
const text='INVOICE\nINVOICE NO: SYN-480\nVENDOR: SYNTHETIC SUPPLY\nSUBTOTAL: 100.00\nTOTAL: 100.00\nCURRENCY: USD';
function fixture(){const analysis={type:{id:'invoice'},fields:{legacy:'retained'}};const result=readDocument({documentId:'synthetic-only',pages:[{id:'p1',observations:[textObservation(text)]}]});return {analysis,review:{analysis,result}};}
test('source analysis stays immutable and exact snapshot survives save/reopen',()=>{
 const {analysis,review}=fixture(),before=JSON.stringify({analysis,review});
 const projected=analysisWithProjection(analysis,review,'invoice','DRIVER-LOAD','driver_selected');
 const saved=JSON.parse(JSON.stringify({extracted:projected.fields}));
 assert.deepEqual(readSavedAnalysis(saved),projected.fields.readerAnalysisV1);
 assert.equal(saved.extracted.legacy,'retained');assert.equal(JSON.stringify({analysis,review}),before);
 assert.equal(projected.routing.autoFile,false);assert.equal(projected.needsReview,true);
 assert.deepEqual(projected.fields.readerAnalysisV1.selection,{type:'invoice',loadNo:'DRIVER-LOAD',assignment:'driver_selected'});
 assert.equal(projected.fields.readerAnalysisV1.groups[0].fields.invoiceNumber.value,'SYN-480');
});
test('stale review cannot attach values or evidence to a different original',()=>{
 const {analysis,review}=fixture();const snapshot=createAnalysisProjection({analysis:{...analysis},review});
 assert.equal(snapshot.groups.length,0);assert.equal(snapshot.diagnostics.localExtraction.status,'skipped');
});
test('mixed packet retains each group without choosing a load/type or flattening fields',()=>{
 const {analysis,review}=fixture();review.result.documents.push({...review.result.documents[0],id:'group-2',kind:'other_expense'});
 const snapshot=createAnalysisProjection({analysis,review,selectedType:'bol',selectedLoadNo:'USER-CHOICE',assignment:'driver_selected'});
 assert.equal(snapshot.groups.length,2);assert.equal(snapshot.mixed,true);assert.equal(snapshot.selection.type,'bol');assert.equal(snapshot.selection.loadNo,'USER-CHOICE');assert.equal(snapshot.autoFile,false);
});
test('unresolvable candidate is not promoted and only ambiguous/missing required fields need focused review',()=>{
 const {analysis,review}=fixture();const field=review.result.documents[0].fields.invoiceNumber;field.candidates[0].evidence[0].quote='WRONG';
 const snapshot=createAnalysisProjection({analysis,review});assert.equal(snapshot.groups[0].fields.invoiceNumber.value,null);
 assert.ok(snapshot.reviewItems.some(item=>item.field==='invoiceNumber'));assert.ok(!snapshot.reviewItems.some(item=>item.field==='total'));
 assert.equal(snapshot.diagnostics.ai.extraction.reason,'not_requested');
});
test('capture-only and legacy saves disclose unread stages without inventing readings',()=>{
 const snapshot=createAnalysisProjection({selectedType:'pod',selectedLoadNo:'SELECTED',assignment:'driver_selected'});
 assert.equal(snapshot.groups.length,0);assert.equal(snapshot.selection.type,'pod');assert.equal(snapshot.diagnostics.localClassification.status,'skipped');assert.equal(readSavedAnalysis({extracted:{}}),null);
});

test('invoice source fields use the same source projection as shipping fields without a BOL warning',async()=>{
 const {scanWithSourceFields}=await import('../src/scanFields.js');
 const {analysis,review}=fixture();analysis.fields.invoiceNo='STALE';analysis.fields.total='999.00';
 const projected=scanWithSourceFields(analysis,review,'load_invoice');
 assert.equal(projected.fields.invoiceNo,'SYN-480');assert.equal(projected.fields.total,'100.00');
 assert.equal(projected.fields.readerSourceFieldsV110393.fields.invoiceNo.evidence[0].quote,'SYN-480');
 assert.ok(!projected.evidenceReviewV11036.issues.some(value=>value.startsWith('BOL number')));
 assert.equal(projected.routing.autoFile,false);assert.equal(analysis.fields.invoiceNo,'STALE');
});

test('explicit review-only AI extraction diagnostics survive snapshot without touching fields',()=>{
 const {analysis,review}=fixture();analysis.aiExtraction={state:'skipped',reason:'not_requested'};
 review.result.aiExtraction={state:'attempted',reason:'completed',candidates:[{field:'invoiceNumber',rawValue:'SYN-480'}]};
 const snapshot=createAnalysisProjection({analysis,review});
 assert.deepEqual(snapshot.diagnostics.ai.extraction,review.result.aiExtraction);
 assert.equal(analysis.aiExtraction.state,'skipped');assert.equal(snapshot.autoFile,false);
});

test('malformed stored snapshot falls back rather than breaking saved document view',()=>{
 for(const value of [{version:1},{version:1,groups:[null],pages:[],reviewItems:[]},{version:1,groups:[{id:'g',fields:{amount:null}}],pages:[],reviewItems:[]}])assert.equal(readSavedAnalysis({readerAnalysisV1:value}),null);
});
