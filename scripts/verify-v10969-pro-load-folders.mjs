import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildLoadFoldersV10969 } from '../source/src/modules/owneros/loadFolderEngineV10969.js';

const screen=fs.readFileSync('source/src/modules/owneros/OwnerOperatorOSV102.jsx','utf8');
const component=fs.readFileSync('source/src/modules/owneros/LoadFoldersV10969.jsx','utf8');
const engine=fs.readFileSync('source/src/modules/owneros/loadFolderEngineV10969.js','utf8');
const css=fs.readFileSync('source/src/modules/owneros/loadFoldersV10969.css','utf8');
assert.ok(screen.includes("import LoadFoldersV10969 from './LoadFoldersV10969.jsx'"));
assert.ok(screen.includes('<LoadFoldersV10969 loads={loads}'));
for(const token of ['LOAD FOLDER','DELIVERY PROOF','Continue to billing','Add POD','Open supporting logbook']) assert.ok(component.includes(token),`missing ${token}`);
for(const token of ['Supporting Logbook','Daily Driving Miles','Fuel Receipt','Proof of Delivery']) assert.ok(engine.includes(token),`missing engine ${token}`);
for(const token of ['.load-folder-grid-v10969','.load-folder-alert-v10969','.load-folder-stops-v10969','.load-folder-actions-v10969']) assert.ok(css.includes(token),`missing css ${token}`);

const state={
  eventsByDay:{'2026-07-23':[
    {status:'ON',loadNo:'97155',note:'Delivery / Unloading',startMin:500,endMin:520},
    {status:'D',shippingDocs:'97155',startMin:520,endMin:600},
  ]},
  routeLegsByDay:{'2026-07-23':[
    {loadNo:'97155',stopSequence:2,stopCompany:'Dearborn',fromCity:'Woodhaven',fromState:'MI',toCity:'Dearborn',toState:'MI'},
    {loadNo:'97155',stopSequence:3,stopCompany:'Canton',fromCity:'Dearborn',fromState:'MI',toCity:'Canton',toState:'MI'},
    {loadNo:'97155',stopSequence:4,stopCompany:'Elgin Empty Return',fromCity:'Canton',fromState:'MI',toCity:'Elgin',toState:'IL'},
  ]},
  dailyMilesByDay:{'2026-07-23':{total:379,segments:[{miles:52},{miles:327}]}}
};
const loads=[{id:'load_97155',loadNo:'97155',origin:'Elgin, IL',destination:'Canton, MI',broker:'Red Lightning',stops:[
  {type:'pickup',sequence:1,city:'Elgin',state:'IL'},
  {type:'delivery',deliverySequence:1,company:'Woodhaven',city:'Woodhaven',state:'MI'},
  {type:'delivery',deliverySequence:2,company:'Dearborn',city:'Dearborn',state:'MI'},
  {type:'delivery',deliverySequence:3,company:'Canton',city:'Canton',state:'MI'},
]}];
const documents=[
  {local_id:'r',document_type:'rate_confirmation',load_no:'97155',vaultDate:'2026-07-22'},
  {local_id:'b1',document_type:'bol',load_no:'97155',vaultDate:'2026-07-23'},
  {local_id:'b2',document_type:'bol',load_no:'97155',vaultDate:'2026-07-23'},
  {local_id:'b3',document_type:'bol',load_no:'97155',vaultDate:'2026-07-23'},
  {local_id:'p1',document_type:'pod',load_no:'97155',stopSequence:1,vaultDate:'2026-07-23'},
  {local_id:'p2',document_type:'pod',load_no:'97155',stopSequence:2,vaultDate:'2026-07-23'},
];
const businessStore={fuel:[{id:'f',date:'2026-07-23',loadNo:'97155',receiptAttached:false}]};
const [folder]=buildLoadFoldersV10969({loads,documents,state,businessStore});
assert.equal(folder.loadNo,'97155');
assert.equal(folder.counts.stops,3);
assert.equal(folder.counts.pods,2);
assert.equal(folder.missingStops.length,1);
assert.ok(folder.missing.some(item=>item.id==='pod'));
assert.ok(folder.missing.some(item=>item.id==='fuel'));
assert.ok(!folder.missing.some(item=>item.id==='logbook'));
assert.ok(!folder.missing.some(item=>item.id==='miles'));
assert.equal(folder.status,'needs_attention');
assert.ok(folder.percent>0&&folder.percent<100);

const completeDocs=[...documents,{local_id:'p3',document_type:'pod',load_no:'97155',stopSequence:3,vaultDate:'2026-07-23'},{local_id:'fr',document_type:'fuel_receipt',load_no:'97155',vaultDate:'2026-07-23'}];
const [complete]=buildLoadFoldersV10969({loads,documents:completeDocs,state,businessStore});
assert.ok(!complete.missing.some(item=>item.id==='pod'));
assert.ok(!complete.missing.some(item=>item.id==='fuel'));
assert.equal(complete.status,'complete');
console.log('PASS — v109.6.9 smart load folders, missing POD and fuel evidence regression');
