import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enforceStructuralBolV11034 } from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
import { collectLoadCandidatesV105, matchDocumentToLoadV105 } from '../source/src/modules/documents/documentFoundationV105.js';
import { dutyViewEvents } from '../source/src/modules/logbook/dutyViewV110212.js';

const bolText=`THERMA TRU | FYPON
DATE 09/08/2026
TERMS PREPAID AND ADD - FOB SHIPPING POINT
CARRIER TOTAL QUALITY LOGISTICS
TRAILER: PTLZ232755
BOL NO: 26023311
SHIP TO:
REEB MILLWORK OF NEW ENGLAND
19 BUSINESS PARK DRIVE
SMITHFIELD, RI 02917
USA
SHIP FROM:
THERMA TRU HOWE
8055 NORTH STATE ROAD 9
HOWE, IN 46746
USA
Total Weight 33,374.94
SHIPPER THERMA-TRU CORPORATION CARRIER TOTAL QUALITY LOGISTICS`;

const corrected=enforceStructuralBolV11034({
  type:{id:'rate_confirmation',label:'Rate Confirmation'},
  detectedType:{id:'rate_confirmation',label:'Rate Confirmation'},
  text:bolText,
  fields:{},confidence:.61,needsReview:true,method:'generic-photo-reader'
});
assert.equal(corrected.type.id,'bol');
assert.equal(corrected.fields.loadNo,'26023311');
assert.equal(corrected.fields.bolNo,'26023311');
assert.equal(corrected.fields.documentDate,'09/08/2026');
assert.equal(corrected.fields.trailerNo,'PTLZ232755');
assert.equal(corrected.fields.broker,'Total Quality Logistics (TQL)');
assert.match(corrected.fields.origin,/Howe, IN/i);
assert.match(corrected.fields.destination,/Smithfield, RI/i);
assert.ok(corrected.fields.weight>33000);
assert.ok(corrected.confidence>=.96);

const state={
  activeDay:'2026-09-08',
  loadInfo:{loadNo:'38246703',shippingDocs:'38246703',broker:'Red Lightning Logistics, LLC',pickupCity:'Chicago',pickupState:'IL',deliveryCity:'Somewhere',deliveryState:'XX',updatedAt:1},
  routeLegsByDay:{},loadGuidesById:{},
  eventsByDay:{
    '2026-09-07':[{id:'off-prev',status:'OFF',startMin:0,endMin:1440,city:'Downers Grove',state:'IL',note:'Off Duty'}],
    '2026-09-08':[
      {id:'pretrip',status:'ON',startMin:850,endMin:865,city:'Chicago',state:'IL',note:'Pre-trip inspection'},
      {id:'drive',status:'D',startMin:865,endMin:1059,city:'Chicago',state:'IL',note:'Driving started'},
      {id:'live-pickup',status:'ON',startMin:1059,endMin:1060,city:'Howe',state:'IN',note:'Hook / Pickup Trailer',description:'Pickup',shippingDocs:'26023311',loadNo:'26023311',bol:'26023311',destination:'Smithfield, RI',destinationState:'RI'}
    ]
  }
};
const candidates=collectLoadCandidatesV105(state,{loads:[],documents:[]});
assert.ok(candidates.some(candidate=>candidate.loadNo==='26023311'&&candidate.sourceKinds.includes('live_duty_event')),'live event must create the current load candidate');
assert.ok(candidates.some(candidate=>candidate.loadNo==='38246703'),'stale loadInfo remains available for review, not forced');

const bolMatch=matchDocumentToLoadV105({state,businessStore:{loads:[],documents:[]},typeId:'bol',fields:{loadNo:'26023311',bolNo:'26023311',origin:'Howe, IN',destination:'Smithfield, RI',date:'09/08/2026'},analysis:{text:bolText,fields:{loadNo:'26023311',bolNo:'26023311'}}});
assert.equal(bolMatch.loadNo,'26023311');
assert.equal(bolMatch.automatic,true);

const exactToday=state.eventsByDay['2026-09-08'];
const view=dutyViewEvents(exactToday,exactToday,{eventsByDay:state.eventsByDay,day:'2026-09-08'});
assert.equal(view[0].status,'OFF');
assert.equal(view[0].startMin,0);
assert.equal(view[0].endMin,850);
assert.equal(view[0].displayOnly,true);
assert.deepEqual(view.slice(1).map(row=>[row.status,row.startMin,row.endMin]),[['ON',850,865],['D',865,1059],['ON',1059,1060]]);

const editor=fs.readFileSync('source/src/modules/editor/EditEventSheet.jsx','utf8');
assert.match(editor,/editorGraphEventsV11034/);
assert.match(editor,/events=\{editorGraphEventsV11034\}/);
assert.match(editor,/displayOnly \|\| visibleV11034\?\.syntheticCoverage/);
const scan=fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx','utf8');
assert.match(scan,/existingSameReferenceV11034/);
assert.ok(!scan.includes('applyResult(result, keepLoad)'),'type changes must not preserve a stale auto-selected folder');

console.log('PASS — v110.3.4 real-load BOL, current-load identity and editor continuity regressions');
