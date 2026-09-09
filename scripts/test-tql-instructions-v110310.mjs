import assert from 'node:assert/strict';
import {qualifyLoadDocumentV110310} from '../source/src/modules/scan/loadDocumentEvidenceV110310.js';
import {readablePdfFallbackV110310} from '../source/src/modules/scan/pdfFallbackQualityV110310.js';
import {qualifyScanResultV11036} from '../source/src/modules/scan/DocumentEvidenceV11036.js';
import {analyzeRateConRiskV10970} from '../source/src/modules/scan/rateConRiskReviewV10970.js';
import {matchScanDocumentToLoadV11037} from '../source/src/modules/scan/scanLoadAssignmentV11037.js';
import {truckDocumentTypeMetaV1040 as meta} from '../source/src/modules/scan/truckDocumentCatalogV1040.js';
import {readBusinessStore,writeBusinessStore} from '../source/src/modules/business/businessStore.js';
import {migrateBusinessStoreV105} from '../source/src/modules/documents/documentFoundationV105.js';
import {mount,resetStore} from './test-scanner-load-link-v11037.mjs';

// Synthetic regression specimen. No user document or personal information.
const text=`DRIVER/CARRIER INFORMATION SHEET TQL PO# 82001234
Pickup Dates Delivery Dates
9/12/26 9/14/26, 9/21/26
TQL CONTACT INFO
CARRIER CONTACT
Name Dispatcher Driver
Example Carrier LLC Alex Alex
LOAD INFORMATION
Estimated Weight 37000
PICKUPS
City State Zip PU# Date Time
Example IN 46000 99118822 9/12/2026
Information:
EXAMPLE, IN 46000
DROPS
Driver Must Accept MacroPoint
Detention paid after 3 hours /$30/hr capping $150 per day
Carrier must notify TQL 1 hour before detention begins
Detention Request send w/ in 24 hrs
Drop Trailer only- detention approved after 24 hr drop
POD emailed to billing@example.com w/in 24 hrs of final delivery
Inspect the Drop Equipment to ensure it is in good repair.
Carrier is liable for any damage to Drop Equipment.
Carrier will be responsible for the daily rental fees until the repairs are completed.
Toll Fee's charged by the Vendor may be subject to administrative fees ranging from $5.00-$100.00.
Do not leave - Call TQL
Page 1 of 3
Page 2 of 3
Page 3 of 3
TQL PO# 82001234
THIS DOCUMENT IS ONLY FOR INFORMATIONAL PURPOSES.`;
const base={type:meta('rate_confirmation'),text,pageCount:3,fields:{total:100,gross:100,loadNo:'BAD',broker:'Wrong Broker',documentDate:'2026-01-01'},confidence:.97};
let count=0;async function test(name,fn){await fn();count++;console.log('PASS — '+name);}
await test('Instruction sheets become load instructions and discard fee-based pay',()=>{
 const result=qualifyScanResultV11036(qualifyLoadDocumentV110310(base));
 assert.equal(result.type.id,'load_tender');assert.equal(result.fields.total,undefined);assert.equal(result.fields.gross,undefined);
 assert.equal(result.fields.loadNo,'82001234');assert.equal(result.fields.broker,'Total Quality Logistics (TQL)');
 assert.equal(result.fields.documentDate,'2026-09-12');assert.equal(result.fields.filingDateSource,'pickup_date');
 assert.deepEqual(result.fields.deliveryDates,['2026-09-14','2026-09-21']);
 assert.equal(result.fields.pickupNumber,'99118822');assert.equal(result.fields.origin,'EXAMPLE, IN');
 assert.equal(result.fields.carrierName,'Example Carrier LLC');assert.equal(result.fieldEvidence.total,undefined);
});
await test('Manual rate classification cannot turn fees into carrier pay',()=>{
 const result=qualifyScanResultV11036({...base,userSelectedTypeV11036:'rate_confirmation'});
 assert.equal(result.type.id,'rate_confirmation');assert.equal(result.fields.total,undefined);assert.equal(result.fields.gross,undefined);
});
await test('Explicit agreed pay survives fee clauses; conflicting totals remain blank',()=>{
 const result=qualifyLoadDocumentV110310({...base,text:'RATE CONFIRMATION\nTOTAL CARRIER PAY $4,250.00\nAdministrative fees ranging from $5.00-$100.00.'});
 for(const [label,amount] of [['Carrier Cost $1,900.00',1900],['RATE TO TRUCK (USD) $1,900.00',1900],['Total Pay (US$): $4,800.00',4800],["Equipment 53 ft Cell Flat Rate $1,000.00 x 1 $1,000.00",1000]])assert.equal(qualifyLoadDocumentV110310({...base,text:'RATE CONFIRMATION\n'+label}).fields.total,amount);
 assert.equal(result.fields.total,4250);assert.equal(result.fields.gross,4250);assert.match(result.fieldEvidence.total.excerpt,/TOTAL CARRIER PAY/);
 for(const bad of ['TOTAL CARRIER PAY $100 if tracking fails','TOTAL CARRIER PAY $100 per day','RATE CONFIRMATION\nAdministrative fees $100','TOTAL CARRIER PAY $4250\nTOTAL CARRIER PAY $4000'])assert.equal(qualifyLoadDocumentV110310({...base,text:bad}).fields.total,undefined);
});
await test('Two-column and sequential dates survive; conflicting PO values need review',()=>{
 assert.equal(qualifyLoadDocumentV110310({...base,text:text.replace('Pickup Dates Delivery Dates\n9/12/26 9/14/26, 9/21/26','Pickup Dates\n9/12/26\nDelivery Dates\n9/14/26, 9/21/26')}).fields.documentDate,'2026-09-12');
 const conflict=qualifyLoadDocumentV110310({...base,text:text+'\nTQL PO# 99001234'});assert.equal(conflict.fields.loadNo,undefined);
});
await test('Tracking, administrative fees, detention and trailer duties are visible',()=>{
 const risk=analyzeRateConRiskV10970(base),ids=risk.items.map(x=>x.id);
 for(const id of ['macropoint','administrative-fees','detention-terms','detention-notice','equipment-inspection','trailer-liability','rental-fees','departure-contact','pod-deadline'])assert.ok(ids.includes(id),id);
 assert.match(risk.items.find(x=>x.id==='administrative-fees').detail,/\$5\.00-\$100\.00/);
 assert.equal(risk.pageCoverage,'all-page-markers-present');
 assert.equal(analyzeRateConRiskV10970({...base,text:text.replace('Page 2 of 3','')}).blocking,true);
});
await test('TQL broker plus exact reference matches; a true broker conflict remains unresolved',()=>{
 const result=qualifyLoadDocumentV110310(base);
 const options={state:{},businessStore:{loads:[{id:'tql',loadNo:'82001234',canonicalLoadNo:'82001234',source:'rate_confirmation_v105',broker:'TQL',status:'booked'}]},typeId:result.type.id,fields:result.fields,analysis:result};
 assert.equal(matchScanDocumentToLoadV11037(options).loadNo,'82001234');
 options.businessStore.loads[0].broker='Different Broker';const match=matchScanDocumentToLoadV11037(options);assert.equal(match.loadNo,'');assert.match(match.reason,/Different Broker/);
});
await test('Unreadable compressed-stream fallback cannot manufacture a W9',()=>{
 assert.equal(readablePdfFallbackV110310({text:'\u0081abcd'.repeat(100),pageCount:3}).text,'');
 const readable={text:'BILL OF LADING\nCARRIER Example\nDATE 9/12/2026\nLOAD NO 99118822'};assert.deepEqual(readablePdfFallbackV110310(readable),readable);
 const unicode={text:'Документ за транспорт '.repeat(20)};assert.deepEqual(readablePdfFallbackV110310(unicode),unicode);
});
await test('The production screen shows instruction risks, saves and reopens without overwriting load pay',async()=>{
 resetStore();let store=readBusinessStore();store.loads.push({id:'tql',loadNo:'82001234',canonicalLoadNo:'82001234',source:'rate_confirmation_v105',broker:'TQL',status:'booked',gross:4250});writeBusinessStore(store);
 const ui=mount();await ui.scan(qualifyLoadDocumentV110310(base));
 assert.equal(ui.byLabel('Load folder').props.value,'82001234');assert.equal(ui.byLabel('Document date').props.value,'2026-09-12');
 assert.match(ui.text(),/MacroPoint tracking required/);assert.match(ui.text(),/Administrative fees may apply/);assert.match(ui.text(),/Pickup date used for filing/);assert.doesNotMatch(ui.text(),/No critical deductions detected/);
 await ui.save();
 for(let i=0;i<3;i++){store=migrateBusinessStoreV105(readBusinessStore(),{});const doc=store.documents[0];assert.equal(doc.type,'load_tender');assert.equal(doc.canonicalLoadNo,'82001234');assert.equal(doc.documentDate,'2026-09-12');assert.ok(!doc.extracted.total&&!doc.extracted.gross);assert.equal(store.loads.find(x=>x.loadNo==='82001234').gross,4250);writeBusinessStore(store);}
});
console.log(`${count} TQL instructions, payment evidence, risk and persistence tests passed`);
