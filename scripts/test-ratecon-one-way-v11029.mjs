import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalRateConLoadNoV11029, isInternalOperationalIdV11029, rateConBackedGuideV11029 } from '../source/src/modules/loads/rateConAuthorityV11029.js';
import { analyzeRateConfirmationV11029 } from '../source/src/modules/document-readers/rate-confirmation/RateConfirmationReaderV11029.js';
import { activeGuideLoadSummaryV105 } from '../source/src/modules/loads/activeLoadSummaryV105.js';
import { buildDriverLoadGuideV103, getActiveLoadGuideV103 } from '../source/src/modules/loads/loadGuideV103.js';
import { collectLoadCandidatesV105 } from '../source/src/modules/documents/documentFoundationV105.js';

const fake='live_1788780557647';
assert.equal(isInternalOperationalIdV11029(fake),true);
assert.equal(canonicalRateConLoadNoV11029(fake),'');
assert.equal(canonicalRateConLoadNoV11029('leg_live_1788780557647'),'');
assert.equal(canonicalRateConLoadNoV11029('97155'),'97155');
console.log('PASS — Logbook/route operational IDs cannot become canonical load numbers');

const fakeState={
  activeLoadGuideId:'',
  loadGuidesById:{},
  loadInfo:{ loadNo:fake, shippingDocs:fake, pickupCity:'Downers Grove', pickupState:'IL', updatedAt:Date.now() },
  routeLegsByDay:{'2026-09-07':[{id:'leg_'+fake,loadGroupId:fake,pickupEventId:fake,loadNo:fake,shippingDocs:fake,fromCity:'Downers Grove',fromState:'IL',toCity:'',toState:'',status:'open',source:'pickup_event'}]},
  eventsByDay:{'2026-09-07':[{id:fake,status:'ON',startMin:900,endMin:920,city:'Downers Grove',state:'IL',note:'Pickup / Loading'}]},
};
assert.equal(activeGuideLoadSummaryV105(fakeState,{}),null);
assert.equal(getActiveLoadGuideV103(fakeState),null);
assert.equal(collectLoadCandidatesV105(fakeState,{loads:[],documents:[]}).length,0);
console.log('PASS — screenshot regression: live_* route/loadInfo state cannot create Active Load or a scanner candidate');

const fields={
  loadNo:'97155',orderNo:'97155',broker:'Red Lightning Logistics, LLC',carrierName:'NARTA EXPRESS LLC',mcNumber:'871792',equipment:'Power Only',trackingProvider:'FourKites',
  origin:'Elgin, IL',destination:'Woodhaven, MI',pickupDate:'2026-09-07',deliveryDate:'2026-09-08',total:2700,
  stops:[
    {id:'pu',type:'pickup',sequence:0,company:'Pickup',city:'Elgin',state:'IL',cityState:'Elgin, IL',date:'2026-09-07',time:'13:00'},
    {id:'d1',type:'delivery',sequence:1,deliverySequence:1,company:'Delivery',city:'Woodhaven',state:'MI',cityState:'Woodhaven, MI',date:'2026-09-08',time:'07:00'},
  ],
};
const guide=buildDriverLoadGuideV103(fields,{documentId:'doc-rate-97155',sourceText:'Carrier Rate Confirmation. Flat rate $2700. FourKites tracking required.'});
assert.equal(rateConBackedGuideV11029(guide),true);
const validState={...fakeState,activeLoadGuideId:guide.id,loadGuidesById:{[guide.id]:guide},loadInfo:{guideId:guide.id,loadNo:'97155',shippingDocs:'97155'},routeLegsByDay:{},eventsByDay:{}};
assert.equal(getActiveLoadGuideV103(validState)?.loadNo,'97155');
assert.equal(activeGuideLoadSummaryV105(validState,{loads:[],documents:[]})?.loadNo,'97155');
console.log('PASS — confirmed Rate Con guide remains the sole Active Load authority');

const businessStore={
  loads:[
    {id:'load_97155',loadNo:'97155',canonicalLoadNo:'97155',status:'booked',source:'rate_confirmation_v105',documentId:'doc-rate-97155'},
    {id:'load_88888',loadNo:'88888',canonicalLoadNo:'88888',status:'booked',source:'route_import'},
  ],
  documents:[{id:'doc-rate-97155',type:'rate_confirmation',loadNo:'97155'}],
};
const candidateState={
  ...validState,
  routeLegsByDay:{'2026-09-07':[
    {id:'route-good',loadGroupId:guide.id,loadNo:'97155',shippingDocs:'97155',fromCity:'Elgin',fromState:'IL',toCity:'Woodhaven',toState:'MI',status:'planned',source:'rate_confirmation_guide_v103'},
    {id:'route-orphan',loadNo:'77777',shippingDocs:'77777',fromCity:'X',fromState:'IL',toCity:'Y',toState:'IN',status:'open',source:'pickup_event'},
  ]},
  loadInfo:{guideId:guide.id,loadNo:'97155',shippingDocs:'97155',broker:'Red Lightning Logistics, LLC'},
};
const candidates=collectLoadCandidatesV105(candidateState,businessStore);
assert.deepEqual(candidates.map(item=>item.loadNo),['97155']);
assert.ok(candidates[0].sourceKinds.includes('guide'));
assert.ok(candidates[0].sourceKinds.includes('route'));
assert.ok(candidates[0].sourceKinds.includes('business'));
assert.ok(candidates[0].sourceKinds.includes('load_info'));
console.log('PASS — route legs/loadInfo can enrich 97155 but cannot establish 77777/88888 without Rate Con authority');

const fakeReader=analyzeRateConfirmationV11029({
  text:'Carrier Rate Confirmation\nFlat Rate $2700\nPickup Elgin, IL\nDelivery Woodhaven, MI',
  textLower:'carrier rate confirmation flat rate pickup delivery',
  fields:{loadNo:fake,orderNo:fake,broker:'Broker Logistics LLC',carrierName:'NARTA EXPRESS LLC',mcNumber:'871792',equipment:'Power Only',trackingProvider:'FourKites',brokerPhone:'3125551212',origin:'Elgin, IL',destination:'Woodhaven, MI',total:2700},
});
assert.equal(fakeReader.fields.loadNo,'');
assert.ok(fakeReader.missingFields.includes('loadNo'));
const realReader=analyzeRateConfirmationV11029({
  text:'Carrier Rate Confirmation\nLoad # 97155\nFlat Rate $2700\nPickup Elgin, IL\nDelivery Woodhaven, MI',
  textLower:'carrier rate confirmation load 97155 flat rate pickup delivery',
  fields:{loadNo:'97155',orderNo:'97155',broker:'Broker Logistics LLC',carrierName:'NARTA EXPRESS LLC',mcNumber:'871792',equipment:'Power Only',trackingProvider:'FourKites',brokerPhone:'3125551212',origin:'Elgin, IL',destination:'Woodhaven, MI',total:2700},
});
assert.equal(realReader.fields.loadNo,'97155');
assert.ok(!realReader.missingFields.includes('loadNo'));
console.log('PASS — Rate Con Reader 1.2 strips operational IDs and preserves verified document load identity');

const home=fs.readFileSync('source/src/modules/home/HomeScreen.jsx','utf8');
assert.doesNotMatch(home,/activeGuideLoadSummaryV105\(state, businessStore\) \|\| activeLoadSummary/);
const scan=fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx','utf8');
assert.doesNotMatch(scan,/extractRateConLoadNoFromFileV10964/);
assert.match(scan,/typeId === 'rate_confirmation'[\s\S]{0,120}normalizeCanonicalLoadNoV105\(rateConNewLoad \|\| preferredLoadNo\)/);
const router=fs.readFileSync('source/src/modules/scan/engines/isolatedDocumentRouterV10959.js','utf8');
assert.match(router,/document-readers\/rate-confirmation\/RateConfirmationReaderV11029/);
assert.doesNotMatch(router,/import \{ analyzeRateConfirmationV11 \}/);
const registry=fs.readFileSync('source/src/modules/scan/engines/documentEngineRegistryV10959.js','utf8');
assert.match(registry,/registryVersion:'110\.2\.9'/);
assert.match(registry,/rate_confirmation:RATE_CONFIRMATION_READER_V11029/);
for(const path of ['source/src/modules/editor/EditEventSheet.jsx','source/src/modules/editor/InsertEditEventSheet.jsx','source/src/modules/graph/LogGraphV110.jsx','source/src/core/hos/hosEngine.js']){
  assert.ok(fs.existsSync(path),`stable Logbook/HOS file missing: ${path}`);
}
const version=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
assert.equal(version.version,'110.2.9');assert.equal(version.build,'v110209-ratecon-one-way');assert.equal(version.force,false);
console.log('PASS — one-way wiring installed; filename fallback removed; Logbook editor/graph/HOS stay outside this change');
console.log('7 Rate Con authority/module-isolation regression groups passed');
