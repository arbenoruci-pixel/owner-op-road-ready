import test from 'node:test';
import assert from 'node:assert/strict';
import {SMART_READING_VERSION,reconcileSmartReadings,validateSmartReading} from '../../lib/reader-ai/smartReading.js';
import {applyAutomaticReading,automaticFolder,normalizeAutomaticValue} from '../../lib/reader-ai/automatic.js';
import {fieldsForProfile} from '../../packages/smart-reader-core/src/engine.js';
import {createAnalysisProjection} from '../../packages/smart-reader-core/src/analysisProjection.js';
const values={bolNumber:'SH045061',documentDate:'11/04/26',shipper:'Example Warehouse',consignee:'Example Market',carrier:'Example Carrier',trailerNumber:'529'};
const read=()=>({kind:'bol',quality:'readable',mixed:false,delivery:'pickup_only',fields:Object.entries(values).map(([field,value])=>({field,value,quote:field+': '+value,location:'top',clear:true}))});
const page={id:'p1',number:1,observations:[{id:'original',source:'source-image',sourceImageId:'doc:p1:original',lines:[]}]};
const initial=()=>({engine:'owned-smart-reader',engineVersion:'test',documentId:'doc',pageCount:1,pages:[page],reviewRevision:0,corrections:[],documents:[{id:'g1',kind:'bol',label:'Bill of lading',pageIds:['p1'],fields:fieldsForProfile([page],'bol'),checks:[]}]});
const context={groupId:'g1',pageId:'p1',sourceImageId:'doc:p1:original',imageHash:'a'.repeat(64),originalHash:'b'.repeat(64),expectedRevision:0,year:2026};
const response=()=>({...reconcileSmartReadings(read(),read()),imageHash:context.imageHash,model:'example/vision',checkedAt:'2026-11-09T00:00:00Z'});
const candidates=[{id:'load-one',loadNo:'BROKER-100',aliases:[{kind:'bol_number',value:'SH045061'}]}];
test('BOL/POD disagreement files the agreed shipment while leaving delivery unverified',async()=>{
 const {scanWithSourceFields}=await import('../../packages/smart-reader-core/src/scanFields.js');
 const {automaticPayloadMatches}=await import('../../lib/reader-ai/automatic.js');
 const first=read(),second=read();first.delivery='uncertain';second.kind='pod';second.delivery='receiver_stamped';
 second.fields.push({field:'deliveryDate',value:'11/06/26',quote:'Received 11/06/26',location:'bottom',clear:true});
 const checked={...response(),...reconcileSmartReadings(first,second)};
 assert.deepEqual(checked.issues,['document_type_uncertain','delivery_acknowledgement_uncertain']);
 assert.deepEqual(checked.unresolved,['deliveryDate']);
 const before=initial(),result=applyAutomaticReading(before,checked,context);
 assert.equal(result.automaticReading.ready,true);
 assert.equal(result.automaticReading.kind,'bol');
 assert.equal(result.automaticReading.deliveryStatus,'unverified');
 assert.equal(result.automaticReading.filingScope,'shipment_document');
 assert.equal(result.automaticReading.date,'2026-11-04');
 assert.equal(result.documents[0].fields.bolNumber.value,'SH045061');
 assert.equal(automaticFolder(result,candidates).loadNo,'BROKER-100');
 const analysis={},projected=scanWithSourceFields(analysis,{analysis,result},'bol');
 assert.equal(automaticPayloadMatches(result,projected,'bol'),true);
 assert.equal(projected.fields.deliveryDate,undefined);
 assert.equal(before.documents[0].fields.bolNumber.value,null);
 const reversed=applyAutomaticReading(initial(),{...response(),...reconcileSmartReadings(second,first)},context);
 assert.equal(reversed.automaticReading.kind,'bol');assert.equal(reversed.automaticReading.ready,true);
 assert.equal(reversed.automaticReading.deliveryStatus,'unverified');
});
test('clear source becomes machine-confirmed fields and identifies exactly one existing folder',()=>{
 const original=initial(),before=JSON.stringify(original),result=applyAutomaticReading(original,response(),context);
 assert.equal(JSON.stringify(original),before);assert.equal(result.automaticReading.ready,true);
 assert.equal(result.documents[0].fields.documentDate.value,'2026-11-04');
 assert.equal(result.documents[0].fields.shipper.value,values.shipper);
 assert.equal(result.documents[0].fields.bolNumber.correction.origin,'machine');
 assert.equal(result.corrections.length,0,'no fabricated human corrections');
 assert.equal(automaticFolder(result,candidates).loadNo,'BROKER-100');
 const analysis={};const snapshot=createAnalysisProjection({analysis,review:{analysis,result},selectedType:'bol'});
 assert.equal(snapshot.groups[0].fields.bolNumber.confirmation.origin,'machine');
 assert.equal(snapshot.automaticReading.originalHash,context.originalHash);
});
test('conflicting digits, unreadable or mixed pages do not become ready',()=>{
 for(const edit of [r=>{r.fields[0].value='SH045067';r.fields[0].quote='BOL: SH045067';},r=>{r.mixed=true;},r=>{r.quality='partial';}]){
  const second=read();edit(second);const checked={...response(),...reconcileSmartReadings(read(),second)};
  const result=applyAutomaticReading(initial(),checked,context);assert.equal(result.automaticReading.ready,false);assert.equal(automaticFolder(result,candidates),null);
 }
});
test('source mismatch, stale revision and conflicting folders cannot auto-file',()=>{
 assert.throws(()=>applyAutomaticReading(initial(),response(),{...context,imageHash:'c'.repeat(64)}));
 assert.throws(()=>applyAutomaticReading(initial(),response(),{...context,expectedRevision:1}));
 const result=applyAutomaticReading(initial(),response(),context);
 assert.equal(automaticFolder(result,[...candidates,{...candidates[0],id:'second',loadNo:'BROKER-200'}]),null);
 assert.equal(automaticFolder(result,[{loadNo:'SH045061',aliases:[]}]),null,'BOL is not silently treated as broker load number');
});
test('human corrections and multi-document packets stay intact',()=>{
 const result=initial();result.documents[0].fields.shipper={...result.documents[0].fields.shipper,status:'confirmed',value:'Driver checked',correction:{origin:'human'}};
 const next=applyAutomaticReading(result,response(),context);assert.equal(next.documents[0].fields.shipper.value,'Driver checked');assert.equal(next.automaticReading.ready,false);
 const ungrouped=initial();ungrouped.pages.push({...page,id:'p2',number:2});ungrouped.pageCount=2;assert.equal(applyAutomaticReading(ungrouped,response(),context).automaticReading.ready,false);
 const packet=initial();packet.documents.push({...packet.documents[0],id:'g2'});assert.equal(applyAutomaticReading(packet,response(),context).automaticReading.ready,false);
});
test('US date convention is explicit; invalid dates and guessed units are excluded',()=>{
 assert.equal(normalizeAutomaticValue('ship_date','11/04/26',{year:2026}).value,'2026-11-04');
 for(const value of ['02/30/26','13/02/26','11/04/19'])assert.equal(normalizeAutomaticValue('date',value,{year:2026}).value,null);
 assert.equal(normalizeAutomaticValue('shipping_weight','44,120').value,null);
});
test('only receiver acknowledgement can upgrade a BOL to POD',()=>{
 const a=read(),b=read();a.kind=b.kind='pod';a.delivery=b.delivery='pickup_only';
 assert.equal(reconcileSmartReadings(a,b).verified,false);
 a.delivery=b.delivery='receiver_stamped';assert.equal(reconcileSmartReadings(a,b).verified,true);
});

test('line wrapping and repeated spaces preserve literal evidence without changing digits or punctuation',()=>{
 const first=read(),second=read();
 for(const r of [first,second]){
  const shipper=r.fields.find(f=>f.field==='shipper');
  shipper.value='Example Warehouse, LLC';shipper.quote='SHIP FROM:\nExample\tWarehouse,\r\nLLC';
 }
 const originalQuote=first.fields.find(f=>f.field==='shipper').quote;
 assert.equal(validateSmartReading(first).fields.find(f=>f.field==='shipper').quote,originalQuote);
 assert.equal(reconcileSmartReadings(first,second).fields.find(f=>f.field==='shipper').rawValue,'Example Warehouse, LLC');
 for(const [value,quote] of [['SH045061','BOL: SH045067'],['SH045061','BOL: SH045 061'],['SH045061','BOL: SH-045061']]){
  const bad=read();Object.assign(bad.fields[0],{value,quote});
  assert.throws(()=>validateSmartReading(bad),e=>e.outputIssue==='value_not_in_quote');
 }
});

test('receiver signature and completed stamp agree while uncertain acknowledgement cannot verify POD',()=>{
 const first=read(),second=read();first.kind=second.kind='pod';
 first.delivery='receiver_signed';second.delivery='receiver_stamped';
 assert.equal(reconcileSmartReadings(first,second).verified,true);
 for(const delivery of ['pickup_only','blank','uncertain','none']){
  second.delivery=delivery;assert.equal(reconcileSmartReadings(first,second).verified,false);
 }
 second.delivery='receiver_stamped';first.kind='bol';
 assert.equal(reconcileSmartReadings(first,second).verified,false);
});

test('a disputed optional OCR value is retained only as a candidate',()=>{
 const input=initial();input.documents[0].fields.carrier={...input.documents[0].fields.carrier,value:'Wrong OCR carrier',status:'supported'};
 const second=read();second.fields=second.fields.filter(f=>f.field!=='carrier');
 const result=applyAutomaticReading(input,{...response(),...reconcileSmartReadings(read(),second)},context);
 assert.equal(result.automaticReading.ready,true);assert.equal(result.documents[0].fields.carrier.value,null);
});
test('verified rate pay reaches the save projection even without local OCR rate structure',async()=>{
 const {scanWithSourceFields}=await import('../../packages/smart-reader-core/src/scanFields.js');
 const {automaticPayloadMatches}=await import('../../lib/reader-ai/automatic.js');
 const first={kind:'rate_confirmation',quality:'readable',mixed:false,delivery:'none',fields:Object.entries({loadNumber:'9001',totalRate:'$2500.00',pickupDate:'11/04/26',shipper:'Example Warehouse',consignee:'Example Market'}).map(([field,value])=>({field,value,quote:field+': '+value,location:'top',clear:true}))};
 const result=applyAutomaticReading(initial(),{...response(),...reconcileSmartReadings(first,first)},context);
 const analysis={fields:{gross:'99.00',total:'99.00',bolNo:'STALE-123'}};
 const projected=scanWithSourceFields(analysis,{analysis,result},'rate_confirmation');
 assert.equal(result.automaticReading.ready,true);assert.equal(projected.fields.gross,'2500.00');assert.equal(projected.fields.total,'2500.00');assert.equal(projected.fields.bolNo,undefined);
 assert.equal(automaticPayloadMatches(result,analysis,'rate_confirmation'),false);
 assert.equal(automaticPayloadMatches(result,projected,'rate_confirmation'),true);
 assert.equal(automaticPayloadMatches(result,{...projected,fields:{...projected.fields,gross:'99.00'}},'rate_confirmation'),false);
});
test('invoice and unloading readings use their real filing types and representable required fields',async()=>{
 const {scanWithSourceFields}=await import('../../packages/smart-reader-core/src/scanFields.js');
 const {automaticPayloadMatches}=await import('../../lib/reader-ai/automatic.js');
 for(const [kind,filingType,values] of [
  ['invoice','other',{invoiceNumber:'INV-123',vendor:'Example Warehouse',invoiceDate:'11/04/26',total:'$250.00'}],
  ['unloading_receipt','lumper_receipt',{receiptNumber:'L-123',receiptDate:'11/04/26',amount:'$240.00',fee:'$10.00',total:'$250.00'}]
 ]){
  const first={kind,quality:'readable',mixed:false,delivery:'none',fields:Object.entries(values).map(([field,value])=>({field,value,quote:field+': '+value,location:'top',clear:true}))};
  const result=applyAutomaticReading(initial(),{...response(),...reconcileSmartReadings(first,first)},context),analysis={fields:{total:'99.00'}};
  assert.equal(result.automaticReading.ready,true);assert.equal(result.automaticReading.filingType,filingType);
  const projected=scanWithSourceFields(analysis,{analysis,result},filingType);assert.equal(projected.fields.total,'250.00');assert.equal(automaticPayloadMatches(result,projected,filingType),true);
 }
});

test('shipment fallback requires both readable pages to agree on every shipment identity field',()=>{
 for(const edit of [r=>{r.kind='invoice';r.fields=[];},r=>{r.mixed=true;},r=>{r.quality='partial';},
 ...['bolNumber','shipper','consignee','documentDate'].map(key=>r=>{r.fields=r.fields.filter(f=>f.field!==key);})]){
  const first=read(),second=read();first.delivery='uncertain';second.kind='pod';second.delivery='receiver_stamped';edit(second);
  const checked={...response(),...reconcileSmartReadings(first,second)};
  assert.equal(checked.shipmentIdentity.verified,false);
  const result=applyAutomaticReading(initial(),checked,context);
  assert.equal(result.automaticReading.ready,false);assert.equal(automaticFolder(result,candidates),null);
 }
});
test('uncertain delivery keeps verified shipping identity without upgrading to POD',()=>{
 for(const date of [undefined,'02/30/26','11/06/26']){
  const first=read(),second=read();first.kind=second.kind='pod';first.delivery=second.delivery='receiver_stamped';
  if(date)for(const r of [first,second])r.fields.push({field:'deliveryDate',value:date,quote:'Received '+date,location:'bottom',clear:true});
  const result=applyAutomaticReading(initial(),{...response(),...reconcileSmartReadings(first,second)},context);
  assert.equal(result.automaticReading.ready,true);
  assert.equal(result.automaticReading.kind,date==='11/06/26'?'pod':'bol');
  assert.equal(result.automaticReading.deliveryStatus,date==='11/06/26'?undefined:'unverified');
  assert.equal(result.automaticReading.date,date==='11/06/26'?'2026-11-06':'2026-11-04');
 }
 const first=read(),second=read();second.delivery='uncertain';
 const result=applyAutomaticReading(initial(),{...response(),...reconcileSmartReadings(first,second)},context);
 assert.equal(result.automaticReading.ready,true);assert.equal(result.automaticReading.kind,'bol');
 assert.equal(result.automaticReading.deliveryStatus,'unverified');
 assert.equal(automaticFolder(result,[...candidates,{...candidates[0],id:'another',loadNo:'BROKER-200'}]),null);
});
