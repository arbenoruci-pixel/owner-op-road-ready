import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {state,store,analysis,pickup,archive} from './fixture.mjs';
register(new URL('../scan-reference-safety/loader.mjs',import.meta.url));
const {default:Sheet}=await import('../../source/src/modules/scan/SmartScanSheetV105.jsx');
const {writeBusinessStore,readBusinessStore,emptyBusinessStore}=await import('../../source/src/modules/business/businessStore.js');
const memory=new Map();globalThis.window={localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},dispatchEvent:()=>true,setTimeout};
globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
globalThis.__scanIO={saved:[]};
function mount(){
 const slots=[];let cursor=0,tree;
 const cell=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];};
 const dispatcher={useState:cell,useRef:v=>cell(()=>({current:v}))[0],useMemo:fn=>fn(),useEffect:()=>{}};
 function render(){cursor=0;const ref=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,old=ref.current;ref.current=dispatcher;try{tree=Sheet({state,profile:{}});}finally{ref.current=old;}return tree;}
 function nodes(){const rows=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}rows.push(n);visit(n.props?.children);}visit(tree);return rows;}
 return{async scan(result){globalThis.__scanIO.result=result;render();await tree.props.onReady(new File(['original'],'shipment-test.jpg',{type:'image/jpeg'}),'auto',{});render();},
 picker:()=>nodes().find(n=>n.props&&Object.hasOwn(n.props,'createLoadNo')).props,
 async save(){const check=nodes().find(n=>n.props?.className==='scan-driver-check-v105');assert.ok(check);check.props.children[0].props.onChange({target:{checked:true}});render();const button=nodes().find(n=>n.props?.className==='scan-save-v105');assert.equal(button.props.disabled,false);await button.props.onClick();render();},
 text:()=>JSON.stringify(tree,(k,v)=>typeof v==='function'?undefined:v)};
}
test('real review and Save file the original with yesterday’s pickup; cloud metadata and Vault never receive the old broker load',async()=>{
 memory.clear();writeBusinessStore({...emptyBusinessStore(),...store});globalThis.__scanIO.saved=[];
 const ui=mount();await ui.scan({...analysis,resumedRecordV110318:{loadNo:archive.loadNo,assignment:'document_reference',date:'2026-10-27'}});
 assert.equal(ui.picker().value,pickup.bol);assert.ok(ui.picker().candidates.find(c=>c.loadNo===pickup.bol).shipmentFiling);assert.match(ui.text(),/Shipment reference match/);
 await ui.save();assert.equal(globalThis.__scanIO.saved.length,1,ui.text());
 const uploaded=globalThis.__scanIO.saved[0];assert.equal(uploaded.metadata.loadNo,'');assert.equal(uploaded.metadata.shipmentReference,pickup.bol);assert.equal(uploaded.extracted.loadNo,'');assert.equal(uploaded.extracted.shipmentReference,pickup.bol);
 const saved=readBusinessStore().documents.find(d=>d.id==='test-document-1');assert.ok(saved,ui.text());assert.equal(saved.canonicalLoadNo,'');assert.equal(saved.shipmentReference,pickup.bol);assert.equal(saved.shipmentEventId,pickup.id);
 assert.equal(readBusinessStore().loads.length,1);assert.equal(readBusinessStore().loads[0].loadNo,archive.loadNo);assert.match(ui.text(),/Shipment \/ BOL/);
});
