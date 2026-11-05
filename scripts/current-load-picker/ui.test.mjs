import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadPickerCandidates} from '../../source/src/modules/scan/loadPickerV110472.js';
import {collectShipmentScanCandidates} from '../../source/src/modules/scan/shipmentFiling.js';
import {operationalCandidateContext} from '../../source/src/modules/loads/currentLoadV110473.js';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
const {default:Picker}=await import('../../source/src/modules/scan/LoadFolderPicker.jsx');
function mount(props){
 const cells=[];let cursor=0,tree;
 const cell=initial=>{const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v;}];};
 const dispatcher={useState:cell,useRef:v=>cell(()=>({current:v}))[0],useEffect:()=>{}};
 function render(){cursor=0;const ref=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,old=ref.current;ref.current=dispatcher;try{tree=Picker(props);}finally{ref.current=old;}return tree;}
 function nodes(){const out=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}out.push(n);walk(n.props?.children);}walk(tree);return out;}
 return{render,find:fn=>nodes().find(fn),html:()=>renderToStaticMarkup(tree)};
}
test('opening Choose a load puts the current Example City–Example Town pickup first and completed Example Broker below it',()=>{
 const state={loadInfo:{loadNo:'OLD-73001'},loadGuidesById:{old:{id:'old',loadNo:'OLD-73001',status:'completed'}},
 eventsByDay:{'2026-11-04':[{id:'pickup',status:'ON',startMin:900,note:'Pickup / Loading',loadNo:'SHIP-NEW-82002',shippingDocs:'SHIP-NEW-82002',city:'Example City',state:'NY',destination:'Example Town, KY'}],
 '2026-11-05':[{id:'pretrip',status:'ON',startMin:300,note:'Pre-trip'}]},routeLegsByDay:{'2026-11-04':[{id:'route',pickupEventId:'pickup',loadNo:'SHIP-NEW-82002',shippingDocs:'SHIP-NEW-82002',status:'open',fromCity:'Example City',fromState:'NY',toCity:'Example Town',toState:'KY'}]}};
 const store={loads:[{loadNo:'OLD-73001',status:'booked',broker:'Example Broker',origin:'Previous Origin, MI',destination:'Previous Destination, OH',pickupDate:'2026-10-29'}]},before=structuredClone({state,store});
 const context=operationalCandidateContext(state,store,{day:'2026-11-05',minute:400});
 const candidates=loadPickerCandidates(collectShipmentScanCandidates(state,store),state,store,context),selected=[];
 const ui=mount({candidates,value:'',onChange:value=>selected.push(value)});ui.render();
 ui.find(n=>n.props?.['aria-label']==='Choose load folder').props.onClick();ui.render();
 const html=ui.html();assert.ok(html.indexOf('SHIP-NEW-82002')<html.indexOf('OLD-73001'),html);
 assert.match(html,/<h3>Current load<\/h3>/);assert.match(html,/<h3>Completed loads<\/h3>/);
 assert.doesNotMatch(html,/<h3>In progress<\/h3>/);assert.match(html,/Example City, NY → Example Town, KY/);
 assert.equal(candidates.find(r=>r.loadNo==='OLD-73001').status,'completed');assert.deepEqual(selected,[],'opening does not automatically file a document');
 const current=ui.find(n=>n.type==='button'&&n.key==='SHIP-NEW-82002');assert.equal(current.props.disabled,false);current.props.onClick();ui.render();assert.deepEqual(selected,['SHIP-NEW-82002']);
 ui.find(n=>n.props?.['aria-label']==='Choose load folder').props.onClick();ui.render();
 ui.find(n=>n.props?.['aria-label']==='Search loads').props.onChange({target:{value:'Example Broker'}});ui.render();assert.doesNotMatch(ui.html(),/SHIP-NEW-82002/);
 ui.find(n=>n.props?.['aria-label']==='Close load picker').props.onClick();ui.render();
 ui.find(n=>n.props?.['aria-label']==='Choose load folder').props.onClick();ui.render();assert.match(ui.html(),/SHIP-NEW-82002/);
 assert.deepEqual({state,store},before,'displaying and choosing a folder preserves the original records');
});
test('a delivered shipment uses Completed and remains selectable alongside completed broker loads',()=>{
 const ui=mount({candidates:[{loadNo:'BOL-DONE',shipmentReference:'BOL-DONE',shipmentFiling:true,referenceOnly:true,status:'completed',active:false}],value:'',onChange:()=>{}});
 ui.render();ui.find(n=>n.props?.['aria-label']==='Choose load folder').props.onClick();ui.render();
 assert.match(ui.html(),/<h3>Completed loads<\/h3>/);assert.match(ui.html(),/>Completed<\/small>/);assert.doesNotMatch(ui.html(),/Recorded pickup|>In progress</);
 assert.equal(ui.find(n=>n.type==='button'&&n.key==='BOL-DONE').props.disabled,false);
});
