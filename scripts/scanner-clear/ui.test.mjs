import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {readDocument,textObservation} from '../../packages/smart-reader-core/src/index.js';
import {admitAiExtractionCandidates} from '../../lib/reader-ai/extraction.js';
register(new URL('../test-jsx-loader.mjs',import.meta.url));register(new URL('./ui-loader.mjs',import.meta.url));
const {default:Compact}=await import('../../source/src/modules/scan/CompactReadingV1104101.jsx');
const require=createRequire(import.meta.url),renderer=process.env.TEST_RENDERER?require(process.env.TEST_RENDERER):null;
function fixture(){
  const result=readDocument({documentId:'doc',pages:[{id:'p1',number:1,observations:[{...textObservation('BILL OF LADING\nBOL No: B-4321\nSHIP FROM: Test Mill\nSHIP TO: Test Market\nWeight: 1000 LB'),sourceImageId:'doc:p1:original'}]}]}),group=result.documents[0];
  const stage=admitAiExtractionCandidates({kind:'bol',quality:'readable',candidates:[{field:'poNumber',rawValue:'PO-7401',quote:'Order PO-7401',location:'top'},{field:'documentDate',rawValue:'2026-11-04',quote:'Date 2026-11-04',location:'top'}]},{documentId:'doc',groupId:group.id,page:result.pages[0],sourceImageId:'doc:p1:original',model:'example/vision',imageHash:'a'.repeat(64),fields:['poNumber','documentDate'],allowVisual:true});
  return {result,stage:{...stage,state:'attempted'},analysis:{},sources:{'doc:p1:original':new Blob(['synthetic'])}};
}
test('default review shows a small set of key details without the full uncertainty queue',()=>{
  const f=fixture(),html=renderToStaticMarkup(React.createElement(Compact,{...f,group:f.result.documents[0]}));
  assert.match(html,/Key details for/);assert.doesNotMatch(html,/items to check|AI suggests|Fix next reading|Net weight|Tare weight/);
  assert.ok((html.match(/class="/g)||[]).length<30);
});
test('the real compact UI makes one AI request and confirms multiple fields in one source review',{skip:!renderer},async()=>{
  const f=fixture();let calls=0,saved=f.result,tree;globalThis.__scannerExtract=async args=>{calls++;assert.equal(args.allowVisual,true);return f.stage;};
  function Harness(){const [result,setResult]=React.useState(f.result);saved=result;return React.createElement(Compact,{...f,result,group:result.documents[0],onStage:stage=>setResult({...result,aiExtraction:stage}),onConfirm:setResult});}
  await renderer.act(async()=>{tree=renderer.create(React.createElement(Harness));});
  const button=text=>tree.root.findAllByType('button').find(b=>b.children.join('').includes(text));
  assert.equal(calls,1);await renderer.act(async()=>{button('Check 2 read').props.onClick();});
  assert.equal(tree.root.findAllByType('input').length,2);assert.equal(tree.root.findAllByType('img').length,1);
  await renderer.act(async()=>{tree.root.findAllByType('input').find(i=>i.props.value==='PO-7401').props.onChange({target:{value:'PO-7402'}});});
  await renderer.act(async()=>{button('Use checked details').props.onClick();});
  assert.equal(saved.documents[0].fields.poNumber.value,'PO-7402');assert.equal(saved.documents[0].fields.documentDate.value,'2026-11-04');assert.equal(calls,1);
  await renderer.act(async()=>tree.unmount());
});
test('a late visual reading cannot replace an edited document revision',{skip:!renderer},async()=>{
  const f=fixture();let resolve,tree,applied=0;globalThis.__scannerExtract=()=>new Promise(done=>{resolve=done;});
  const props={...f,group:f.result.documents[0],onStage:()=>applied++};
  await renderer.act(async()=>{tree=renderer.create(React.createElement(Compact,props));});
  const edited={...f.result,reviewRevision:f.result.reviewRevision+1};
  await renderer.act(async()=>{tree.update(React.createElement(Compact,{...props,result:edited,group:edited.documents[0]}));resolve(f.stage);});
  assert.equal(applied,0);await renderer.act(async()=>tree.unmount());
});
