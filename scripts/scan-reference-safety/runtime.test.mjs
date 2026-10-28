import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
register(new URL('./loader.mjs',import.meta.url));
const {default:Sheet}=await import('../../source/src/modules/scan/SmartScanSheetV105.jsx');
const {writeBusinessStore,emptyBusinessStore}=await import('../../source/src/modules/business/businessStore.js');
const memory=new Map();
globalThis.window={localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},dispatchEvent:()=>true,setTimeout};
globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
globalThis.__scanIO={saved:[]};
const oldLoad={id:'load_ARCHIVE-80001',loadNo:'ARCHIVE-80001',broker:'Archived Broker',status:'invoiced',source:'rate_confirmation_v105',aliases:[{kind:'po_number',value:'RATES'}]};
function mount(){
 const slots=[];let cursor=0,tree;
 const cell=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];};
 const dispatcher={useState:cell,useRef:v=>cell(()=>({current:v}))[0],useMemo:fn=>fn(),useEffect:()=>{}};
 function render(){cursor=0;const ref=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,old=ref.current;ref.current=dispatcher;try{tree=Sheet({state:{eventsByDay:{}},profile:{}});}finally{ref.current=old;}return tree;}
 function all(){const rows=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}rows.push(n);visit(n.props?.children);}visit(tree);return rows;}
 return{async scan(result){globalThis.__scanIO.result=result;render();await tree.props.onReady(new File(['test original'],'nfi-test.jpg',{type:'image/jpeg'}),'auto',{});render();},
 folder(){const picker=all().find(n=>n.props&&Object.hasOwn(n.props,'createLoadNo')&&typeof n.props.onChange==='function');assert.ok(picker,'real folder picker exists');return picker.props.value;},
 text(){return JSON.stringify(tree,(k,v)=>typeof v==='function'?undefined:v);}};
}
const result=assignment=>({type:{id:'bol',label:'Bill of Lading'},confidence:.9,needsReview:true,text:'CURRENT SHIPPER BILL OF LADING\nBOL NUMBER 88001234\nSubject to RATES',fields:{bolNo:'88001234',poNumber:'RATES',documentDate:'2026-10-27'},resumedRecordV110318:{loadNo:oldLoad.loadNo,assignment,date:'2026-10-27',linkToLogbook:true}});
test('production review clears a saved incorrect automatic folder and its false Reference match badge',async()=>{
 memory.clear();writeBusinessStore({...emptyBusinessStore(),loads:[oldLoad]});const ui=mount();await ui.scan(result('document_reference'));
 assert.equal(ui.folder(),'');assert.ok(!ui.text().includes('Reference match'));assert.ok(!ui.text().includes('Load ARCHIVE-80001'));
});
test('production review retains a deliberate saved driver folder with Your selection badge',async()=>{
 memory.clear();writeBusinessStore({...emptyBusinessStore(),loads:[oldLoad]});const ui=mount();await ui.scan(result('driver_selected'));
 assert.equal(ui.folder(),oldLoad.loadNo);assert.ok(ui.text().includes('Your selection'));assert.ok(!ui.text().includes('Reference match'));
});
