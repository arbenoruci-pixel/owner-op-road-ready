import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation} from '../src/index.js';
import {createAnalysisProjection,analysisWithProjection,pendingAnalysisGroups,readSavedAnalysis} from '../src/analysisProjection.js';
import {scanWithSourceFields} from '../src/scanFields.js';

// Synthetic source text only. Pending-display tests do not depend on an OCR
// provider or promote these review-only fixtures into extraction rules.
function fixture(){
 const analysis={type:{id:'bol'},fields:{shipper:'STALE SHIPPER',consignee:'STALE RECEIVER',documentDate:'STALE DATE',weight:'999'}};
 const result=readDocument({documentId:'synthetic-pending',pages:[{id:'p1',number:1,observations:[textObservation([
  'BILL OF LADING','BOL NO: SYN-70','SHIPPER: Sample Printer','CONSIGNEE: Sample Receiver',
  'DATE: 04-07-26','WEIGHT: 18,750','CARRIER: Sample Transport',
 ].join('\n'))]}]});
 const group=result.documents[0],page=result.pages[0],observation=page.observations[0];
 function ref(text){
  const line=observation.lines.find(line=>line.text.includes(text)),start=line.text.indexOf(text);
  return {pageId:page.id,pageNumber:page.number,observationId:observation.id,lineId:line.id,start,end:start+text.length,quote:text};
 }
 for(const [key,label,rawValue,kind,issue,sourceLabel] of [
  ['shipper','Shipper','Sample Printer','party','layout_needs_review','SHIPPER'],
  ['consignee','Consignee','Sample Receiver','party','layout_needs_review','CONSIGNEE'],
  ['documentDate','Ship date','04-07-26','ship_date','short_date_requires_review','DATE'],
  ['weight','Total weight','18,750','shipping_weight','weight_unit_required','WEIGHT'],
 ])group.fields[key]={label,kind,required:key==='shipper'||key==='consignee',status:'needs_review',value:null,
  issues:[issue],candidates:[{rawValue,value:kind==='party'?rawValue:null,issue,evidence:[ref(rawValue)],labelEvidence:[ref(sourceLabel)]}]};
 return {analysis,review:{analysis,result},group,ref};
}

test('pending BOL readings remain visible separately without filling authoritative fields',()=>{
 const {analysis,review}=fixture(),before=JSON.stringify({analysis,review});
 const projected=analysisWithProjection(analysis,review,'bol','DRIVER-CHOICE','driver_selected',scanWithSourceFields(analysis,review,'bol'));
 for(const key of ['shipper','consignee','documentDate','weight'])assert.equal(projected.fields[key],undefined);
 const snapshot=projected.fields.readerAnalysisV1,groups=pendingAnalysisGroups(snapshot);
 assert.equal(groups.length,1);
 assert.deepEqual(groups[0].fields.map(field=>field.candidates[0].text),['Sample Printer','Sample Receiver','04-07-26','18,750']);
 assert.ok(groups[0].fields.every(field=>field.candidates[0].pageNumbers[0]===1));
 assert.match(groups[0].fields.find(field=>field.key==='documentDate').candidates[0].reason,/full year and month\/day order/);
 assert.match(groups[0].fields.find(field=>field.key==='weight').candidates[0].reason,/weight unit/);
 assert.equal(snapshot.groups[0].fields.shipper.value,null);
 assert.equal(snapshot.groups[0].fields.shipper.candidates[0].labelEvidence[0].quote,'SHIPPER');
 assert.equal(snapshot.selection.loadNo,'DRIVER-CHOICE');assert.equal(snapshot.selection.assignment,'driver_selected');
 assert.equal(snapshot.autoFile,false);assert.equal(snapshot.calibration.automaticAcceptance,false);
 assert.equal(projected.routing.autoFile,false);assert.equal(JSON.stringify({analysis,review}),before);
});

test('pending source text, reasons and source pages survive JSON save/reopen without acceptance',()=>{
 const {analysis,review}=fixture(),snapshot=createAnalysisProjection({analysis,review});
 const reopened=readSavedAnalysis(JSON.parse(JSON.stringify({extracted:{readerAnalysisV1:snapshot}})));
 assert.deepEqual(pendingAnalysisGroups(reopened),pendingAnalysisGroups(snapshot));
 assert.equal(reopened.groups[0].fields.documentDate.value,null);
 assert.equal(reopened.groups[0].fields.weight.value,null);
 assert.equal(reopened.requiresReview,true);assert.equal(reopened.autoFile,false);
});

test('unresolvable, stale and out-of-group evidence cannot appear as pending readings',()=>{
 const {analysis,review,group}=fixture();
 group.fields.shipper.candidates[0].evidence[0].quote='UNSUPPORTED';
 group.fields.consignee.candidates[0].evidence[0].pageId='another-original';
 group.fields.weight.candidates[0].labelEvidence[0].quote='WRONG LABEL';
 const snapshot=createAnalysisProjection({analysis,review});
 const fields=pendingAnalysisGroups(snapshot)[0].fields;
 assert.deepEqual(fields.map(field=>field.key),['documentDate','weight']);
 assert.deepEqual(snapshot.groups[0].fields.weight.candidates[0].labelEvidence,[]);
 assert.deepEqual(pendingAnalysisGroups(createAnalysisProjection({analysis:{...analysis},review})),[]);
});

test('conflicting candidate readings remain alternatives rather than a first-choice default',()=>{
 const {analysis,review,group,ref}=fixture();
 group.fields.shipper.issues=['conflicting_reads'];
 group.fields.shipper.candidates.push({rawValue:'Sample Receiver',value:'Sample Receiver',evidence:[ref('Sample Receiver')]});
 const snapshot=createAnalysisProjection({analysis,review});
 const field=pendingAnalysisGroups(snapshot)[0].fields.find(field=>field.key==='shipper');
 assert.deepEqual(field.candidates.map(candidate=>candidate.text),['Sample Printer','Sample Receiver']);
 assert.ok(field.candidates.every(candidate=>candidate.reason.startsWith('Different readings')));
 assert.equal(snapshot.groups[0].fields.shipper.value,null);
});

test('supported and confirmed readings are never mislabeled as pending',()=>{
 const {analysis,review,group,ref}=fixture();
 group.fields.shipper.status='supported';group.fields.shipper.value='Sample Printer';group.fields.shipper.issues=[];
 group.fields.consignee.status='confirmed';group.fields.consignee.value='Sample Receiver';
 group.fields.consignee.correction={evidence:ref('Sample Receiver')};
 const snapshot=createAnalysisProjection({analysis,review});
 assert.deepEqual(pendingAnalysisGroups(snapshot)[0].fields.map(field=>field.key),['documentDate','weight']);
 assert.equal(snapshot.groups[0].fields.shipper.status,'supported');assert.equal(snapshot.groups[0].fields.consignee.status,'confirmed');
});

test('BOL, POD and RateCon groups stay separate and unrelated document types are unchanged',()=>{
 const {analysis,review}=fixture(),snapshot=createAnalysisProjection({analysis,review});
 snapshot.groups.push({...structuredClone(snapshot.groups[0]),id:'rate-2',kind:'rate_confirmation',label:'Rate confirmation'});
 snapshot.groups.push({...structuredClone(snapshot.groups[0]),id:'pod-3',kind:'pod',label:'Proof of delivery'});
 snapshot.groups.push({...structuredClone(snapshot.groups[0]),id:'invoice-4',kind:'invoice',label:'Invoice'});
 assert.deepEqual(pendingAnalysisGroups(snapshot).map(group=>group.id),[snapshot.groups[0].id,'rate-2','pod-3']);
 snapshot.groups[1].pageIds=['different-original'];
 assert.deepEqual(pendingAnalysisGroups(snapshot).map(group=>group.id),[snapshot.groups[0].id,'pod-3']);
});

test('capture-only, old versions and malformed candidate lists do not invent pending readings',()=>{
 assert.deepEqual(pendingAnalysisGroups(createAnalysisProjection({selectedType:'pod',selectedLoadNo:'SELECTED'})),[]);
 for(const snapshot of [null,{}, {version:2,groups:[]},{version:1,groups:[null]},{version:1,groups:[{kind:'bol',fields:{shipper:null}}]}])assert.deepEqual(pendingAnalysisGroups(snapshot),[]);
 const {analysis,review}=fixture(),snapshot=createAnalysisProjection({analysis,review});
 for(const field of Object.values(snapshot.groups[0].fields))if(field.status==='needs_review')field.candidates=[null,{rawValue:'not source-backed',evidence:[]}];
 assert.deepEqual(pendingAnalysisGroups(snapshot),[]);
});
