import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation} from '../../packages/smart-reader-core/src/index.js';
import {reviewAssignment} from '../../source/src/modules/scan/reviewAssignmentV110411.js';
import {decideDocumentIdentity} from '../../source/src/modules/scan/documentIdentityV110334.js';
import {scanNeedsLoadV11039,scanFolderV11039} from '../../source/src/modules/scan/smartScanRoutingV11039.js';
const text='DELIVERY ORDER\nDELIVERY ORDER No: D-1234\nLOAD No: L-1234\nBILL TO: Example Company\nCTNS DESCRIPTION MASTER BILL HOUSE BILL WEIGHT\nNOT a Bill of Lading';
const result=readDocument({documentId:'synthetic',pages:[{id:'p',observations:[textObservation(text)]}]});
const analysis={type:{id:'delivery_order'},fields:{loadNo:'STALE',references:[{kind:'load_number',value:'STALE'}]},text};
const base={analysis,review:{analysis,result},typeId:'delivery_order',state:{},businessStore:{loads:[{source:'rate_confirmation_v105',loadNo:'L-1234'},{source:'rate_confirmation_v105',loadNo:'STALE'}],documents:[]}};
test('Delivery Order enters the load folder from its verified source reference',()=>{
 const assignment=reviewAssignment(base);assert.equal(assignment.loadNo,'L-1234');assert.equal(assignment.match.automatic,true);assert.equal(scanNeedsLoadV11039('delivery_order'),true);assert.equal(scanFolderV11039('delivery_order',{canonicalLoadNo:assignment.loadNo,status:'verified'}),'load:L-1234');
});
test('manual folder decisions survive reader completion',()=>{
 for(const [loadNo,assignment]of [['OTHER','driver_selected'],['','driver_unassigned']])assert.equal(reviewAssignment({...base,loadNo,assignment}).loadNo,loadNo);
});
test('unmatched or ambiguous references cannot reuse a stale load number',()=>{
 assert.equal(reviewAssignment({...base,businessStore:{loads:[{source:'rate_confirmation_v105',loadNo:'STALE'}]}}).loadNo,'');
 assert.equal(reviewAssignment({...base,businessStore:{loads:[{source:'rate_confirmation_v105',loadNo:'A1234',aliases:[{kind:'load_number',value:'L-1234'}]},{source:'rate_confirmation_v105',loadNo:'B1234',aliases:[{kind:'load_number',value:'L-1234'}]}]}}).loadNo,'');
});
test('different Delivery Orders remain a packet requiring folder review',()=>{
 const decision=decideDocumentIdentity({type:{id:'other'},fields:{},pageCount:2,ocrEvidenceV110323:[{page:1,id:'one',text,confidence:.9},{page:2,id:'two',text:text.replaceAll('D-1234','D-9876'),confidence:.9}]});
 assert.equal(decision.typeId,'delivery_order');assert.equal(decision.mixedDocuments,true);assert.equal(decision.clearShipmentFields,true);assert.equal(decision.attachmentReview.required,true);
});
