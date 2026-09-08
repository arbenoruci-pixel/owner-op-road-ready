import fs from 'node:fs';
import assert from 'node:assert/strict';
import { applyLiveBolContextV11035, currentLiveBolContextV11035 } from '../source/src/modules/scan/liveBolContextV11035.js';

const state={
  activeDay:'2026-09-08',
  currentStatus:'ON',
  loadInfo:{loadNo:'38246703',shippingDocs:'38246703',broker:'Red Lightning Logistics, LLC'},
  eventsByDay:{
    '2026-09-08':[
      {id:'pretrip',status:'ON',startMin:850,endMin:865,city:'Chicago',state:'IL',note:'Pre-trip inspection'},
      {id:'drive',status:'D',startMin:865,endMin:1059,city:'Chicago',state:'IL',note:'Driving started'},
      {id:'live-pickup',status:'ON',startMin:1059,endMin:1060,city:'Howe',state:'IN',note:'Hook / Pickup Trailer',description:'Pickup',shippingDocs:'26023311',loadNo:'26023311',bol:'26023311',destination:'Smithfield, RI'}
    ]
  }
};

const context=currentLiveBolContextV11035(state);
assert.equal(context.loadNo,'26023311');
assert.equal(context.day,'2026-09-08');
assert.equal(context.eventId,'live-pickup');

const weakRate=applyLiveBolContextV11035({
  type:{id:'rate_confirmation',label:'Rate Confirmation'},
  detectedType:{id:'rate_confirmation',label:'Rate Confirmation'},
  confidence:.61,
  needsReview:true,
  text:'',
  fields:{},
  method:'weak-photo-reader'
},state);
assert.equal(weakRate.type.id,'bol','weak Rate Con result during current pickup must be corrected to BOL context');
assert.equal(weakRate.fields.loadNo,'26023311');
assert.equal(weakRate.fields.bolNo,'26023311');
assert.equal(weakRate.fields.documentDate,'2026-09-08');
assert.equal(weakRate.fields.origin,'Howe, IN');
assert.equal(weakRate.fields.destination,'Smithfield, RI');
assert.equal(weakRate.needsReview,true,'context fallback still requires driver review');
assert.equal(weakRate.liveBolContextV11035.loadNo,'26023311');

const strongRate=applyLiveBolContextV11035({
  type:{id:'rate_confirmation',label:'Rate Confirmation'},
  detectedType:{id:'rate_confirmation',label:'Rate Confirmation'},
  confidence:.96,
  needsReview:false,
  text:'CARRIER RATE CONFIRMATION - TOTAL CARRIER PAY $4,800 - SIGN AND RETURN',
  fields:{loadNo:'77777',documentDate:'2026-09-08'},
  method:'rate-engine'
},state);
assert.equal(strongRate.type.id,'rate_confirmation','strong Rate Confirmation evidence must remain authoritative');
assert.equal(strongRate.fields.loadNo,'77777');
assert.equal(strongRate.liveBolContextV11035,undefined);

const fuel=applyLiveBolContextV11035({
  type:{id:'fuel_receipt',label:'Fuel Receipt'},
  detectedType:{id:'fuel_receipt',label:'Fuel Receipt'},
  confidence:.92,
  needsReview:false,
  text:'DIESEL 100 GALLONS PRICE PER GALLON',
  fields:{documentDate:'2026-09-08'}
},state);
assert.equal(fuel.type.id,'fuel_receipt','other confident document engines remain isolated');

const noPickup=applyLiveBolContextV11035({type:{id:'rate_confirmation'},confidence:.4,needsReview:true,fields:{}},{activeDay:'2026-09-08',eventsByDay:{'2026-09-08':[{id:'d',status:'D',startMin:1,endMin:2,note:'Driving',loadNo:'999'}]}});
assert.equal(noPickup.type.id,'rate_confirmation','no pickup BOL context means no fallback');

const scan=fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx','utf8');
assert.match(scan,/applyLiveBolContextV11035\(result, state\)/);
assert.match(scan,/Current live pickup BOL/);

const app=fs.readFileSync('source/src/app/App.jsx','utf8');
assert.match(app,/remote\.force \|\| prev\.dismissedVersion !== remote\.version/);
assert.match(app,/if \(prev\.remote\?\.force\) return prev/);
const banner=fs.readFileSync('source/src/modules/update/UpdateBanner.jsx','utf8');
assert.match(banner,/const forced = updateState\?\.remote\?\.force === true/);
assert.match(banner,/!busy && !forced/);

const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
assert.equal(meta.version,'110.3.5');
assert.equal(meta.build,'v110305-live-bol-context-force-update');
assert.equal(meta.force,true);

console.log('PASS — v110.3.5 weak scanner result follows current live BOL while strong document evidence stays isolated');
