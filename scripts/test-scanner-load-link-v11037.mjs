import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { matchScanDocumentToLoadV11037, referenceIsOnDocumentV11037 } from '../source/src/modules/scan/scanLoadAssignmentV11037.js';
import { matchDocumentToLoadV105, migrateBusinessStoreV105 } from '../source/src/modules/documents/documentFoundationV105.js';
import { readBusinessStore, writeBusinessStore, emptyBusinessStore } from '../source/src/modules/business/businessStore.js';
import { resolveArchiveDocumentLink } from '../source/src/modules/owneros/archiveEvidenceV1103.js';
register(new URL('./test-scan-io-loader-v11037.mjs',import.meta.url));
const {default:Sheet}=await import('../source/src/modules/scan/SmartScanSheetV105.jsx');
const state={activeDay:'2026-09-09',loadInfo:{loadNo:'97155',broker:'Red Lightning Logistics, LLC'},eventsByDay:{}};
const loads=[
  {id:'load_97155',loadNo:'97155',canonicalLoadNo:'97155',broker:'Red Lightning Logistics, LLC',status:'active',pickupDate:'2026-09-09',aliases:[]},
  {id:'load_88222',loadNo:'88222',canonicalLoadNo:'88222',broker:'Sample Freight',status:'booked',aliases:[{kind:'bol_number',value:'26023311'}]},
];
loads.forEach(load=>{load.source='rate_confirmation_v105';});
const baseStore={...emptyBusinessStore(),loads};
const weak={type:{id:'bol',label:'Bill of Lading'},confidence:.7,needsReview:true,text:'BILL OF LADING\nSHIP FROM\nSHIP TO\nWEIGHT CLASS',fields:{documentDate:'2026-09-09'}};
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS — '+name);}
const options=result=>({state,businessStore:baseStore,typeId:result.type.id,fields:result.fields,analysis:result});
await test('Reproduce 110.3.6: unrelated BOL selects active Load 97155',()=>assert.equal(matchDocumentToLoadV105(options(weak)).loadNo,'97155'));
await test('Active load, same date and broker provide no filing identity',()=>{
  for(const fields of [{},{broker:loads[0].broker,documentDate:'2026-09-09'},{loadNo:'97155',orderNo:'97155'}]) {
    const match=matchScanDocumentToLoadV11037(options({...weak,fields}));
    assert.equal(match.loadNo,'');assert.equal(match.matched,false);assert.equal(match.automatic,false);
  }
});
await test('Only an exact unique reference read from the document selects a folder',()=>{
  const result={...weak,text:weak.text+'\nBOL NO 26023311',fields:{bolNo:'26023311'}};
  assert.equal(matchScanDocumentToLoadV11037(options(result)).loadNo,'88222');
  const shared={...baseStore,loads:loads.map(load=>({...load,aliases:[{kind:'bol_number',value:'26023311'}]}))};
  assert.equal(matchScanDocumentToLoadV11037({...options(result),businessStore:shared}).loadNo,'');
  assert.equal(referenceIsOnDocumentV11037('97155','LOAD NO 9971550'),false);
});
const memory=new Map();
globalThis.window={localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},dispatchEvent:()=>true,setTimeout};
globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options?.detail;}};
globalThis.__scanIO={result:weak,saved:[]};
// Drive the real production component's event handlers with a deterministic
// React hook dispatcher. Child UI and native camera rendering are outside this test.
function mount() {
  const slots=[];let cursor=0,tree;
  const cell=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];};
  const dispatcher={useState:cell,useRef:initial=>cell(()=>({current:initial}))[0],useMemo:fn=>fn(),useEffect:()=>{}};
  const render=()=>{
    cursor=0;const internal=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
    const before=internal.current;internal.current=dispatcher;
    try {tree=Sheet({state,profile:{}});}finally{internal.current=before;}
    return tree;
  };
  const all=()=>{const out=[];function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}out.push(node);walk(node.props?.children);}walk(tree);return out;};
  const find=predicate=>{const node=all().find(predicate);assert.ok(node,'Expected production control exists');return node;};
  const byLabel=label=>find(n=>n.props?.['aria-label']===label);
  const choose=async(label,value)=>{await byLabel(label).props.onChange({target:{value}});render();};
  const scan=async(result=weak)=>{__scanIO.result=result;render();await tree.props.onReady(new File(['synthetic image'],'scan.jpg',{type:'image/jpeg'}),'auto',{});render();};
  const save=async()=>{const review=all().find(n=>n.props?.className==='scan-driver-check-v105');if(review){review.props.children[0].props.onChange({target:{checked:true}});render();}const button=find(n=>n.props?.className==='scan-save-v105');assert.equal(button.props.disabled,false);await button.props.onClick();render();assert.ok(all().some(n=>n.props?.className==='scan-saved-v105'),'Saved screen is reached');};
  const text=()=>JSON.stringify(tree,(key,value)=>typeof value==='function'?undefined:value);
  return {render,scan,choose,save,byLabel,all,text};
}
function resetStore(){memory.clear();delete window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__;writeBusinessStore(baseStore);__scanIO.saved=[];}
await test('Real scan screen has no selected folder, Confirmed badge or Logbook opt-in',async()=>{
  resetStore();const ui=mount();await ui.scan();assert.equal(ui.byLabel('Load folder').props.value,'');assert.ok(!ui.text().includes('Confirmed'));
  const checkbox=ui.all().find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.checked,false);
  await ui.save();const saved=__scanIO.saved.at(-1);assert.equal(saved.metadata.loadNo,'');assert.equal(saved.extracted.loadNo,'');
  for(let i=0;i<3;i++){const reopened=migrateBusinessStoreV105(readBusinessStore(),state);assert.equal(reopened.documents[0].canonicalLoadNo,'');assert.equal(reopened.documents[0].canonicalLoadId,'');assert.equal(reopened.documents[0].folder,'needs_review');assert.equal(reopened.documents[0].linkedEventId,'');writeBusinessStore(reopened);}
});
await test('Manual folder selection survives document type change and files to that folder',async()=>{
  resetStore();const ui=mount();await ui.scan();await ui.choose('Load folder','88222');await ui.choose('Document type','pod');assert.equal(ui.byLabel('Load folder').props.value,'88222');assert.ok(ui.text().includes('Your selection'));await ui.save();
  const record=readBusinessStore().documents[0];assert.equal(record.canonicalLoadNo,'88222');assert.equal(record.canonicalLoadId,'load_88222');assert.equal(record.broker,'Sample Freight');assert.equal(record.loadAssignmentStatusV11037,'driver_selected');
});
await test('Choose later clears a strong match through save, reload and archive resolution',async()=>{
  resetStore();const ui=mount();await ui.scan({...weak,text:weak.text+'\nBOL NO 26023311',fields:{bolNo:'26023311',documentDate:'2026-09-09'}});
  assert.equal(ui.byLabel('Load folder').props.value,'88222');await ui.choose('Load folder','');await ui.choose('Document type','pod');assert.equal(ui.byLabel('Load folder').props.value,'');await ui.save();
  const record=migrateBusinessStoreV105(readBusinessStore(),state).documents[0];assert.equal(record.canonicalLoadNo,'');assert.equal(record.canonicalLoadId,'');assert.equal(record.loadAssignmentStatusV11037,'unassigned');assert.equal(resolveArchiveDocumentLink(record,state).status,'unassigned');
  const cloudCopy={...record,loadAssignmentStatusV11037:undefined};assert.equal(migrateBusinessStoreV105({...baseStore,documents:[cloudCopy]},state).documents[0].canonicalLoadNo,'');
});
await test('New Rate Con references can create their own folder without using active load',async()=>{
  resetStore();const ui=mount();await ui.scan({type:{id:'rate_confirmation',label:'Rate Confirmation'},confidence:.96,needsReview:false,text:'RATE CONFIRMATION\nLOAD NO 77777\nTOTAL CARRIER PAY $1000\n9/9/2026',fields:{loadNo:'77777',documentDate:'2026-09-09',gross:1000}});assert.equal(ui.byLabel('Load folder').props.value,'77777');
});
await test('Receipts cannot inherit a hidden load when their document type changes',async()=>{
  resetStore();const ui=mount();await ui.scan();await ui.choose('Load folder','97155');await ui.choose('Document type','parts_receipt');
  assert.ok(!ui.all().some(n=>n.props?.['aria-label']==='Load folder'));await ui.save();
  assert.equal(__scanIO.saved.at(-1).metadata.loadNo,'');assert.equal(readBusinessStore().documents[0].canonicalLoadNo,'');
});
console.log(`${count} scanner assignment checks passed, including production sheet save/reopen handlers`);
