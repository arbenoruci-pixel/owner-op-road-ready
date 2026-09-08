import fs from 'node:fs';
import assert from 'node:assert/strict';
import { applyLiveBolContextV11035, currentLiveBolContextV11035 } from '../source/src/modules/scan/liveBolContextV11035.js';

const state={activeDay:'2026-09-08',currentStatus:'ON',loadInfo:{loadNo:'38246703',shippingDocs:'38246703',broker:'Red Lightning Logistics, LLC'},eventsByDay:{'2026-09-08':[
  {id:'pretrip',status:'ON',startMin:850,endMin:865,city:'Chicago',state:'IL',note:'Pre-trip inspection'},
  {id:'drive',status:'D',startMin:865,endMin:1059,city:'Chicago',state:'IL',note:'Driving started'},
  {id:'live-pickup',status:'ON',startMin:1059,endMin:1060,city:'Howe',state:'IN',note:'Hook / Pickup Trailer',description:'Pickup',shippingDocs:'26023311',loadNo:'26023311',bol:'26023311',destination:'Smithfield, RI'}
]}};

const context=currentLiveBolContextV11035(state);
assert.equal(context.loadNo,'26023311');
assert.equal(context.day,'2026-09-08');

const weak=applyLiveBolContextV11035({type:{id:'rate_confirmation',label:'Rate Confirmation'},detectedType:{id:'rate_confirmation'},confidence:.61,needsReview:true,text:'',fields:{},method:'weak-photo-reader'},state);
assert.equal(weak.type.id,'bol');
assert.equal(weak.fields.loadNo,'26023311');
assert.equal(weak.fields.bolNo,'26023311');
assert.equal(weak.fields.documentDate,'2026-09-08');
assert.equal(weak.fields.origin,'Howe, IN');
assert.equal(weak.fields.destination,'Smithfield, RI');
assert.equal(weak.needsReview,true);

const strong=applyLiveBolContextV11035({type:{id:'rate_confirmation'},confidence:.96,needsReview:false,text:'CARRIER RATE CONFIRMATION TOTAL CARRIER PAY 4800 SIGN AND RETURN',fields:{loadNo:'77777',documentDate:'2026-09-08'}},state);
assert.equal(strong.type.id,'rate_confirmation');
assert.equal(strong.fields.loadNo,'77777');

const fuel=applyLiveBolContextV11035({type:{id:'fuel_receipt'},confidence:.92,needsReview:false,text:'DIESEL 100 GALLONS PRICE PER GALLON',fields:{documentDate:'2026-09-08'}},state);
assert.equal(fuel.type.id,'fuel_receipt');

const scan=fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx','utf8');
assert.match(scan,/applyLiveBolContextV11035\(result, state\)/);
assert.match(scan,/Current live pickup BOL/);
const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
assert.equal(meta.version,'110.3.5');
assert.equal(meta.build,'v110305-live-bol-context');
assert.equal(meta.force,true);
console.log('PASS — v110.3.5 weak scanner result resolves to current live BOL without changing strong document engines');
