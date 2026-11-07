import test from 'node:test';
import assert from 'node:assert/strict';
import {register,createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
register(new URL('../test-jsx-loader.mjs',import.meta.url));register(new URL('./ui-loader.mjs',import.meta.url));
const {default:Folders}=await import('../../source/src/modules/owneros/SmartLoadFolders.jsx');
const require=createRequire(import.meta.url),renderer=process.env.TEST_RENDERER?require(process.env.TEST_RENDERER):null;
const props={loads:[{loadNo:'ACTIVE-1',status:'booked'},{loadNo:'DONE-1',status:'delivered'}],documents:[{id:'p1',clientDocumentId:'p1',type:'pod',loadNo:'DONE-1',title:'generic.jpg'}],state:{}};
test('folder list starts with active trips and exposes completed trips and one search',()=>{
 const html=renderToStaticMarkup(React.createElement(Folders,props));
 assert.match(html,/Active/);assert.match(html,/Completed/);assert.match(html,/ACTIVE-1/);assert.doesNotMatch(html,/DONE-1/);assert.match(html,/Load, BOL, broker or destination/);assert.doesNotMatch(html,/Choose week/);
});
test('completed folder opens its POD directly and adds fuel to the chosen folder',{skip:!renderer},async()=>{
 globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.sessionStorage={getItem(){return '';},removeItem(){},setItem(){}};
 let tree,context;await renderer.act(async()=>{tree=renderer.create(React.createElement(Folders,{...props,onScan:c=>context=c}));});
 const label=node=>node.children.map(c=>typeof c==='string'?c:typeof c==='object'?label(c):'').join('');
 const button=pattern=>tree.root.findAllByType('button').find(b=>pattern.test(label(b)));
 await renderer.act(async()=>button(/^Completed/).props.onClick());
 await renderer.act(async()=>button(/Load DONE-1/).props.onClick());
 assert.match(JSON.stringify(tree.toJSON()),/Missing: Ratecon/);assert.match(JSON.stringify(tree.toJSON()),/Fuel receipts/);
 await renderer.act(async()=>button(/^✓POD/).props.onClick());assert.equal(globalThis.__openedDocument.id,'p1');
 await renderer.act(async()=>button(/^Share documents$/).props.onClick());
 const share=tree.root.find(node=>node.props['aria-label']==='Share load documents');assert.equal(share.props.role,'region');
 await renderer.act(async()=>button(/Add fuel receipt/).props.onClick());assert.equal(context.loadNo,'DONE-1');assert.equal(context.kind,'fuel_receipt');
 await renderer.act(async()=>tree.unmount());
});
