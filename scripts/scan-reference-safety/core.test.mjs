import test from 'node:test';
import assert from 'node:assert/strict';
import {matchScanDocumentToLoadV11037 as match,referenceIsOnDocumentV11037 as onPaper} from '../../source/src/modules/scan/scanLoadAssignmentV11037.js';
import {scanAssignmentBadge,retainedScanChoice} from '../../source/src/modules/scan/scanAssignmentSafety.js';
const oldLoad={id:'load_ARCHIVE-80001',loadNo:'ARCHIVE-80001',source:'rate_confirmation_v105',broker:'Archived Broker',origin:'Lisbon, ME',destination:'Omaha, NE',pickupDate:'2026-10-08',deliveryDate:'2026-10-12',status:'invoiced',aliases:[{kind:'bol_number',value:'IGATED'},{kind:'po_number',value:'RATES'}]};
const text='CURRENT SHIPPER BILL OF LADING\nBill of Lading Number: 88001234\nDATE: 10/27/2026\nSubject to rates and classifications.';
const options={state:{},businessStore:{loads:[oldLoad],documents:[]},typeId:'bol',fields:{bolNo:'88001234',poNumber:'RATES'},analysis:{text}};
test('Current shipment BOL cannot match the unrelated archived folder through its legacy RATES alias',()=>{
 const result=match(options);assert.equal(result.matched,false);assert.equal(result.loadNo,'');assert.equal(result.automatic,false);
 assert.equal(onPaper('RATES',text),false);assert.equal(onPaper('IGATED','BOL NO IGATED'),false);
});
test('a valid unique numeric BOL selects the proper folder while generic words are ignored',()=>{
 const nfi={id:'load_CURRENT-90001',loadNo:'CURRENT-90001',source:'rate_confirmation_v105',broker:'Current Broker',aliases:[{kind:'bol_number',value:'88001234'}]};
 assert.equal(match({...options,businessStore:{loads:[oldLoad,nfi],documents:[]}}).loadNo,nfi.loadNo);
 assert.equal(match({...options,businessStore:{loads:[oldLoad,nfi,{...nfi,id:'other',loadNo:'CURRENT-90002'}],documents:[]}}).matched,false);
});
test('actual broker load references and printed spacing remain valid; dates and substrings do not identify loads',()=>{
 const result=match({...options,fields:{loadNo:'ARCHIVE-80001'},analysis:{text:'LOAD NUMBER ARCHIVE-80001'}});
 assert.equal(result.loadNo,oldLoad.loadNo);assert.equal(onPaper('88001234','BOL 8800 1234'),true);
 assert.equal(onPaper('88001234','BOL 1880012340'),false);assert.equal(onPaper('10/27/2026','10/27/2026'),false);
});
test('the badge distinguishes verified references, route evidence, manual choice and an unverified saved folder',()=>{
 assert.equal(scanAssignmentBadge({matched:true,automatic:true,loadNo:'A1'},'document_reference','A1'),'Reference match');
 assert.equal(scanAssignmentBadge({matched:true,automatic:true,loadNo:'A1',source:'document_route'},'document_route','A1'),'Route/date match');
 assert.equal(scanAssignmentBadge({},'driver_selected','A1'),'Your selection');
 assert.equal(scanAssignmentBadge({},'document_reference','A1'),'Folder needs review');
 assert.equal(scanAssignmentBadge({matched:true,automatic:true,loadNo:'B2'},'document_reference','A1'),'Folder needs review');
});
test('saved automatic assignments are rechecked while explicit driver choices survive',()=>{
 assert.equal(retainedScanChoice({assignment:'document_reference',loadNo:oldLoad.loadNo}),false);
 assert.equal(retainedScanChoice({assignment:'document_route',loadNo:oldLoad.loadNo}),false);
 assert.equal(retainedScanChoice({assignment:'driver_selected',loadNo:oldLoad.loadNo}),true);
 assert.equal(retainedScanChoice({assignment:'driver_unassigned',loadNo:''}),true);
});
