import test,{mock} from 'node:test';import assert from 'node:assert/strict';import {register} from 'node:module';import React from 'react';import Renderer from 'react-test-renderer';
import {fixture,at} from '../inspection-signed/fixture.mjs';import {captureInspection} from '../../lib/owner-op-cloud/inspectionSnapshot.js';import {captureInspectionWallet} from '../../lib/owner-op-cloud/inspectionWallet.js';
register(new URL('../test-jsx-loader.mjs',import.meta.url));register(new URL('../inspection-signed/jsx-loader.mjs',import.meta.url));
mock.timers.enable({apis:['Date','setInterval'],now:at});globalThis.window={location:{origin:'https://example.test'}};globalThis.document={activeElement:{blur(){}}};
const {default:Wizard}=await import('../../source/src/modules/dot/InspectionWizard.jsx');const {act}=Renderer;
const content=node=>typeof node==='string'?node:(node.children||[]).map(content).join('');
test('the real three-step wizard uploads the explicit document selection and leaves source logs unchanged',async t=>{
 const state=fixture();state.dotWallet={documents:{driver_license:{attachmentDataUrl:'data:image/png;base64,bGljZW5zZQ=='},insurance:{attachmentDataUrl:'data:application/pdf;base64,aW5zdXJhbmNl'}}};const before=structuredClone(state);let selected,root;
 const createShare=async args=>{selected=args.walletKeys;return{id:'link',token:'selected',log_count:8,document_count:selected.length,expires_at:new Date(+at+3600000).toISOString(),inspection:captureInspection(args.getState(),at),wallet:captureInspectionWallet(args.getState())};};
 await act(async()=>{root=Renderer.create(React.createElement(Wizard,{state,createShare}));});t.after(()=>act(async()=>root.unmount()));
 const button=label=>root.root.findAllByType('button').find(b=>content(b)===label);
 const check=()=>root.root.findAllByType('input').find(n=>n.props.type==='checkbox'&&!n.props['data-wallet-key']);
 const file=root.root.findAllByType('input').find(n=>n.props['data-wallet-key']==='driver_license');
 assert.ok(file.props.checked);await act(async()=>file.props.onChange({target:{checked:false}}));
 await act(async()=>check().props.onChange({target:{checked:true}}));await act(async()=>button('Prepare inspection link').props.onClick());
 assert.deepEqual(selected,['insurance']);assert.match(content(root.toJSON()),/STEP 2 OF 3/);assert.match(content(root.toJSON()),/1 wallet documents/);
 await act(async()=>check().props.onChange({target:{checked:true}}));assert.equal(button('Continue to email').props.disabled,false);await act(async()=>button('Continue to email').props.onClick());assert.match(content(root.toJSON()),/STEP 3 OF 3/);assert.deepEqual(state,before);
});
