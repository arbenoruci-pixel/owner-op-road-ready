import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation,confirmField} from '../src/index.js';
import {confirmPageField,savedReadingReview} from '../src/recovery.js';
import {restoreConfirmedReading} from '../src/continuity.js';
import {isDocumentParty} from '../src/fieldGuards.js';

// Minimal synthetic replay of the submitted report's layout. Values and IDs
// are synthetic; the driver's original file is never changed or committed.
function fixture(){
  const row=(id,text,x,y,width=.12)=>({id,text,confidence:.96,box:{x,y,width,height:.014}});
  const lines=[row('heading','BILL OF LADING',.35,.02,.22),row('bol','Bill of Lading No.: TEST-456',.46,.06,.32),
    row('from','SHIP FROM',.01,.08),row('shipper','Example Warehouse',.01,.11,.2),
    row('carrier-value','EXAMPLE TRANSPORT',.67,.193,.2),row('carrier-label','Carrier Name :',.47,.195,.11),
    row('seal-value','86261197',.67,.247,.09),row('seal-label','Seal No.',.47,.25,.07),
    row('to','SHIP TO',.01,.259),row('trailer-value','729',.67,.278,.03),row('trailer-label','Trailer No',.475,.281,.08),
    row('consignee','Example Market',.01,.286,.17),row('class-value','60',.67,.307,.02),row('class-label','CLASS',.47,.311,.06)];
  const observations=[{id:'clean',source:'ocr',sourceImageId:'doc:p1:original',lines},
    {id:'source',source:'ocr',sourceImageId:'doc:p1:source',lines:[row('source-carrier','Carrier Name',.47,.195,.11),
      {...row('source-noise','i',.609,.193,.01),confidence:.17}]}];
  return readDocument({documentId:'doc',pages:[{id:'p1',number:1,observations}]});
}
test('a bare Carrier Name label never becomes a company candidate; same-row carrier/trailer keep source evidence',()=>{
  const result=fixture(),fields=result.documents[0].fields;
  assert.equal(result.documents[0].kind,'bol');assert.equal(fields.bolNumber.value,'TEST-456');
  assert.deepEqual(fields.carrier.candidates.map(c=>c.rawValue),['EXAMPLE TRANSPORT']);
  assert.deepEqual(fields.trailerNumber.candidates.map(c=>c.rawValue),['729']);
  assert.equal(fields.trailerNumber.candidates[0].evidence[0].lineId,'trailer-value');
  assert.equal(fields.trailerNumber.candidates[0].labelEvidence[0].lineId,'trailer-label');
  assert.equal(fields.trailerNumber.status,'needs_review');assert.equal(result.documents[0].canAutoFile,false);
});
test('label rejection covers candidate and manual confirmation without rejecting genuine company names',()=>{
  for(const value of ['Name','NAME','Carrier Name','Name :','Company Name'])assert.equal(isDocumentParty(value),false,value);
  for(const value of ['Name Logistics LLC','Company Name Transport','No. 1 Transport','Example Carrier Inc'])assert.equal(isDocumentParty(value),true,value);
  const result=fixture(),group=result.documents[0],field=group.fields.carrier,before=structuredClone(result);
  const request={documentId:'doc',groupId:group.id,field:'carrier',rawValue:'Name',userConfirmed:true,expectedRevision:0};
  assert.throws(()=>confirmField(result,{...request,expectedRawValues:field.candidates.map(c=>c.rawValue),evidence:field.candidates[0].evidence[0]}));
  assert.throws(()=>confirmPageField(result,{...request,pageId:'p1',sourceImageId:'doc:p1:original'}));
  assert.deepEqual(result,before);
});
test('old confirmed label stays in its saved history and gets a clear review warning',()=>{
  const current=fixture(),previous=savedReadingReview(current);
  previous.documents[0].fields.carrier={label:'Carrier',value:'Name',correction:{confirmed:true,rawValue:'Name',value:'Name',origin:'human'}};
  const before=structuredClone(previous),restored=restoreConfirmedReading(current,previous);
  assert.equal(restored.documents[0].fields.carrier.value,'Name');assert.match(restored.continuityWarning,/form label/);
  assert.deepEqual(previous,before);assert.equal(current.documents[0].fields.carrier.value,null);
});
test('text-only inline carrier and trailer readings still work',()=>{
  const result=readDocument({documentId:'inline',pages:[{id:'p',number:1,observations:[textObservation('BILL OF LADING\nBOL No: TEST-123\nSHIP FROM: Example Mill\nSHIP TO: Example Market\nCarrier Name: Name Logistics LLC\nTrailer No. 729')]}]});
  assert.equal(result.documents[0].fields.carrier.value,'Name Logistics LLC');assert.equal(result.documents[0].fields.trailerNumber.value,'729');
});
