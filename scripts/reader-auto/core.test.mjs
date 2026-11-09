import test from 'node:test';
import assert from 'node:assert/strict';
import {SMART_READING_VERSION,reconcileSmartReadings} from '../../lib/reader-ai/smartReading.js';
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
 for(const edit of [r=>{r.fields[0].value='SH045067';r.fields[0].quote='BOL: SH045067';},r=>{r.mixed=true;},r=>{r.quality='partial';},r=>{r.delivery='uncertain';}]){
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
