// Optional interactive React check. Set TEST_RENDERER to a React 18.3.1
// react-test-renderer installation resolving the same React as this checkout.
import test,{mock} from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import React from 'react';import {fixture,at} from '../inspection-signed/fixture.mjs';
import {captureInspection} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
import {captureInspectionWallet} from '../../lib/owner-op-cloud/inspectionWallet.js';
const require=createRequire(import.meta.url),Renderer=require(process.env.TEST_RENDERER||'react-test-renderer'),{act}=Renderer;
register(new URL('../test-jsx-loader.mjs',import.meta.url));register(new URL('../inspection-signed/jsx-loader.mjs',import.meta.url));
mock.timers.enable({apis:['Date'],now:at});globalThis.window={location:{origin:'https://example.test'}};globalThis.document={activeElement:{blur(){}}};
const {default:Wizard}=await import('../../source/src/modules/dot/InspectionWizard.jsx');
const content=node=>typeof node==='string'?node:(node.children||[]).map(content).join('');
test('Review → prepare and open → review → officer email, with invalidation when wallet changes',async()=>{
 let state=fixture(),creates=0;state.dotWallet={documents:{driver_license:{attachmentDataUrl:'data:image/png;base64,dGVzdA=='}}};
 const createShare=async args=>{creates++;assert.equal(args.walletKeys,undefined);return {id:'share',token:'test-token',log_count:8,document_count:1,expires_at:new Date(+at+3600000).toISOString(),inspection:captureInspection(args.getState(),at),wallet:captureInspectionWallet(args.getState())};};
 let root;await act(async()=>{root=Renderer.create(React.createElement(Wizard,{state,createShare}));});
 const button=label=>root.root.findAllByType('button').find(n=>content(n)===label),check=()=>root.root.findAllByType('input').find(n=>n.props.type==='checkbox');
 assert.equal(button('Prepare inspection link').props.disabled,true);
 await act(async()=>check().props.onChange({target:{checked:true}}));assert.equal(button('Prepare inspection link').props.disabled,false);
 await act(async()=>button('Prepare inspection link').props.onClick());assert.equal(creates,1);assert.match(content(root.toJSON()),/STEP 2 OF 3/);
 assert.equal(button('Continue to email').props.disabled,true);assert.equal(check().props.disabled,true);
 await act(async()=>root.root.findAllByType('a').find(n=>content(n)==='Open officer package').props.onClick());
 await act(async()=>check().props.onChange({target:{checked:true}}));assert.equal(button('Continue to email').props.disabled,false);
 await act(async()=>button('Continue to email').props.onClick());assert.match(content(root.toJSON()),/STEP 3 OF 3/);
 await act(async()=>root.root.findAllByType('input').find(n=>n.props.type==='email').props.onChange({target:{value:'officer@example.gov'}}));
 const mail=root.root.findAllByType('a').find(n=>content(n)==='Open email to officer');assert.match(mail.props.href,/mailto:officer%40example.gov/);assert.ok(decodeURIComponent(mail.props.href).includes('Digital Wallet documents are included'));
 let prevented=false;mail.props.onClick({preventDefault(){prevented=true;}});assert.equal(prevented,false);
 state=structuredClone(state);state.dotWallet.documents.driver_license.attachmentDataUrl='data:image/png;base64,bmV3';
 await act(async()=>root.update(React.createElement(Wizard,{state,createShare})));assert.equal(root.root.findAllByType('a').some(n=>content(n)==='Open email to officer'),false);
 await act(async()=>root.unmount());
});
