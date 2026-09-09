import assert from 'node:assert/strict';
import {readBusinessStore} from '../source/src/modules/business/businessStore.js';
import {migrateBusinessStoreV105} from '../source/src/modules/documents/documentFoundationV105.js';
import {scanFolderV11039,scanDestinationV11039,scanNeedsLoadV11039,normalizeScanPreferenceV11039,preserveDocumentDecisionV11039} from '../source/src/modules/scan/smartScanRoutingV11039.js';
import {classifySmartScanStructureV11039,qualifyRateConReferenceV11039} from '../source/src/modules/scan/smartScanEvidenceV11039.js';
import {truckDocumentTypeMetaV1040 as meta} from '../source/src/modules/scan/truckDocumentCatalogV1040.js';
import {mount,resetStore} from './test-scanner-load-link-v11037.mjs';
let count=0;
async function test(name,fn){await fn();console.log('PASS — '+name);count++;}
await test('Click events and unsupported scan hints open automatic detection',()=>{
  assert.equal(normalizeScanPreferenceV11039({type:'click'}),'auto');
  assert.equal(normalizeScanPreferenceV11039('bol'),'bol');
  assert.equal(normalizeScanPreferenceV11039('fake'),'auto');
});
await test('Document structure resolves parts, towing, packing, gate pass and shipping contracts',()=>{
  const cases=[
    ['AutoZone\nPurchase receipt\nSUBTOTAL $40.00\nITEMS SOLD: 1','parts_receipt'],
    ['PRIVATE PROPERTY TOW RECORD / INVOICE\nLIGHT DUTY VEHICLE\nDATE RELEASED\nTOTAL COST $200','roadside_service'],
    ['Packing List\nCustomer: Sample Foods\nLoad ID: 5010099\nStop: 5','packing_list'],
    ['Assigned by: Joe Gate Pass\nArrival Time: 7/18/26 6:35pm\nTrailer #: 7005\nCarrier: Sample Transport','gate_pass'],
    ['CONSIGNED TO: Receiver\nCARRIER: Sample Trucking\nLADING: 04000000002915522\nSHIPMENT ID: AB880011\nWEIGHT 6400','bol'],
    ['Carrier shall deliver this Bil of Lading to consignee.\nShip Via: Truck\nShip Charges Paid By: Consignee','bol'],
  ];
  for(const [text,type] of cases)assert.equal(classifySmartScanStructureV11039(text)?.typeId,type);
  assert.equal(classifySmartScanStructureV11039('Ready for the next Rate Con\nHOS clocks\nLogbook'),null);
});
await test('Repeated LOAD NO: # references are read; conflicting references need review',()=>{
  const input={type:meta('rate_confirmation'),fields:{},text:'LOAD NO: #97155 Page 1 of 4\nLOAD NO: #97155 Page 2 of 4'};
  assert.equal(qualifyRateConReferenceV11039(input).fields.loadNo,'97155');
  assert.equal(qualifyRateConReferenceV11039({...input,text:input.text+'\nLOAD NO: #88888'}).fields.loadNo,undefined);
});
await test('The catalog and Vault use consistent load, maintenance, fuel and permit destinations',()=>{
  assert.equal(scanNeedsLoadV11039('packing_list'),true);
  assert.equal(scanFolderV11039('parts_receipt'),'maintenance');
  assert.equal(scanFolderV11039('trip_permit'),'compliance');
  assert.equal(scanFolderV11039('fuel_receipt'),'ifta');
  assert.equal(scanFolderV11039('other'),'needs_review');
  assert.equal(scanFolderV11039('packing_list'),'needs_review');
});
for(const [type,bucket,folder,fields] of [
  ['fuel_receipt','fuel','ifta',{merchant:'Sample Fuel',gallons:100,total:350,state:'IL',pricePerGallon:3.5}],
  ['parts_receipt','maintenance','maintenance',{merchant:'Sample Parts',total:90,invoiceNo:'PARTS-88001'}],
  ['roadside_service','maintenance','maintenance',{merchant:'Sample Tow',total:250,invoiceNo:'TOW-88001'}],
  ['toll_parking_receipt','expenses','expenses',{merchant:'Sample Parking',total:25}],
  ['trip_permit',null,'compliance',{permitNumber:'PERMIT-88001',state:'NY'}],
])await test(`${type}: production save and reopening keep the right folder and operational record`,async()=>{
  resetStore();const ui=mount();await ui.scan({type:meta(type),text:'DATE: 9/9/2026\nTOTAL $'+(fields.total||0),confidence:.9,needsReview:true,fields:{...fields,documentDate:'2026-09-09'}});
  await ui.save();let store=readBusinessStore();const record=store.documents[0];
  assert.equal(record.type,type);assert.equal(record.canonicalLoadNo,'');assert.equal(record.folder,folder);
  assert.ok(ui.text().includes(scanDestinationV11039(record).label));
  if(bucket)assert.equal(store[bucket].filter(r=>r.documentId===record.id).length,1);
  store=migrateBusinessStoreV105(store,{});assert.equal(store.documents[0].folder,folder);
});
await test('Unreadable dates remain in review without invented financial entries',async()=>{
  resetStore();const ui=mount();await ui.scan({type:meta('parts_receipt'),text:'Auto parts purchase receipt\nTOTAL $90',confidence:.8,needsReview:true,fields:{total:90}});await ui.save();
  const store=readBusinessStore();assert.equal(store.documents[0].folder,'needs_review');assert.equal(store.documents[0].documentDate,'');assert.equal(store.maintenance.length,0);
});
await test('Packing lists expose the load selector and retain the chosen folder on reload',async()=>{
  resetStore();const ui=mount();await ui.scan({type:meta('packing_list'),text:'PACKING LIST\nLOAD NO: 88222\nDATE: 9/9/2026',fields:{loadNo:'88222',documentDate:'2026-09-09'},confidence:.93,needsReview:true});
  assert.equal(ui.byLabel('Load folder').props.value,'88222');await ui.save();
  assert.equal(readBusinessStore().documents[0].canonicalLoadNo,'88222');
});
console.log(`${count} Smart Scan entry, recognition, filing and reopening checks passed`);
