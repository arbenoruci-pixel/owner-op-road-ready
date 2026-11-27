import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sealDotPack,openDotPack} from '../../app/operator/dotCache.js';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
register(new URL('./step3.css-loader.mjs',import.meta.url));
globalThis.React=React;
const {default:Workspace,money}=await import('../../app/operator/Step3Workspace.jsx');
const {PortalSession}=await import('../../app/operator/PortalSession.jsx');
const fake={from(){throw Error('No DB read/write allowed while rendering')},rpc(){throw Error('No RPC allowed while rendering')},auth:{getUser(){throw Error('No Auth call while rendering')}}};
const op={id:'driver-workspace',driver_name:'Fixture driver',company_name:'Fixture company',workspace_kind:'leased',carrier_user_id:'owner'};
const own={id:'owner-workspace',driver_name:'Fixture owner',company_name:'Fixture carrier',workspace_kind:'carrier',carrier_user_id:'owner'};
function render(operator,userId,operators){return renderToStaticMarkup(React.createElement(PortalSession.Provider,{value:fake},React.createElement(Workspace,{operator,session:{user:{id:userId}},operators})))}
test('driver has four tabs, no company controls, no DB calls in initial render',()=>{const html=render(op,'driver',[op]);for(const label of ['LOAD','PAY','DOCS','TRUCK'])assert.match(html,new RegExp('>'+label+'<'));assert.doesNotMatch(html,/Company control|Private carrier controls|FirstLine private events/);assert.match(html,/Add POD without a load/)});
test('owner own workspace and leased workspace both show four tabs and company entry',()=>{for(const operator of [own,op]){const html=render(operator,'owner',[own,op]);for(const label of ['LOAD','PAY','DOCS','TRUCK'])assert.match(html,new RegExp('>'+label+'<'));assert.match(html,/Company control/)}});
test('money is exact display-only and never invents missing payable',()=>{assert.equal(money('120000.00'),'$1,200.00');assert.equal(money('-1'),'-$0.01');assert.equal(money(null),'Pending');assert.equal(money(12.5),'Unavailable')});
test('encrypted six-document pack requires PIN, exact scope and authenticated ciphertext',async()=>{
 const docs=Array.from({length:6},(_,i)=>({id:'d'+i,title:'private fixture '+i,bytes:'JVBERi0xLjQ='}));
 const p=await sealDotPack('driver:workspace','49273518',docs);
 assert.equal(p.v,1);assert.ok(p.cipher instanceof ArrayBuffer);assert.equal(Buffer.from(p.cipher).includes(Buffer.from('private fixture')),false);
 assert.deepEqual((await openDotPack('driver:workspace','49273518',p)).docs,docs);
 await assert.rejects(()=>openDotPack('other:workspace','49273518',p));await assert.rejects(()=>openDotPack('driver:workspace','49273519',p));
 await assert.rejects(()=>sealDotPack('driver:workspace','111111',docs));await assert.rejects(()=>sealDotPack('driver:workspace','49273518',docs.slice(1)));
 const bad={...p,cipher:p.cipher.slice(0)};new Uint8Array(bad.cipher)[0]^=1;await assert.rejects(()=>openDotPack('driver:workspace','49273518',bad));
});

const {TonuApprovalForm}=await import('../../app/operator/Step3Carrier.jsx');
const {default:TruckTools}=await import('../../app/operator/Step3Truck.jsx');
const renderPart=(component,props)=>renderToStaticMarkup(React.createElement(PortalSession.Provider,{value:fake},React.createElement(component,props)));
test('actual carrier cancellation form requires independent original, amount, actual date and confirmation',()=>{
 const html=renderPart(TonuApprovalForm,{load:{id:'fixture'},documents:[{id:'proof',file_name:'cancellation.pdf'}]});
 assert.match(html,/name="documentId"/);assert.match(html,/cancellation.pdf/);assert.match(html,/name="amount"/);assert.match(html,/name="cancelledAt"/);assert.match(html,/name="confirmCancellation"/);assert.match(html,/Approve confirmed OTR TONU/);
});
test('TRUCK offers receipt capture and manual maintenance with mileage, service reminders and optional cost',async()=>{
 const html=renderPart(TruckTools,{operator:op,refresh:0});
 assert.match(html,/Scan receipt/);assert.match(html,/Manual entry/);assert.match(html,/application\/pdf,image\/jpeg,image\/png/);
 const {default:Editor}=await import('../../app/operator/MaintenanceEditor.jsx');
 const {maintenanceDraft}=await import('../../app/operator/maintenanceReview.js');
 const draft={...maintenanceDraft(),mode:'service_only'};
 const form=renderPart(Editor,{draft,setDraft(){},onBack(){},onSubmit(){}});
 for(const field of ['date','unit','assetType','category','vendor','odometer','nextOdometer','nextDate','description'])assert.match(form,new RegExp('name="'+field+'"'));
 assert.match(form,/Save maintenance record/);
});

test('installed driver entry uses the four-tab workspace and keeps carrier access separate', async () => {
  const {readFile} = await import('node:fs/promises');
  const root = new URL('../../', import.meta.url);
  const read = (path) => readFile(new URL(path, root), 'utf8');
  const manifest = JSON.parse(await read('public/operator/manifest.webmanifest'));
  const layout = await import('../../app/operator/layout.jsx');
  assert.equal(layout.metadata.manifest, '/operator/manifest.webmanifest');
  assert.equal(layout.metadata.appleWebApp.title, 'My Loads');
  for (const page of ['page.jsx', 'confirm/page.jsx', 'carrier/page.jsx']) {
    const {metadata} = await import('../../app/operator/' + page);
    assert.equal(metadata.manifest ?? layout.metadata.manifest, layout.metadata.manifest);
    assert.equal((metadata.appleWebApp ?? layout.metadata.appleWebApp).title, 'My Loads');
  }
  assert.equal(manifest.id, '/operator');
  assert.equal(manifest.start_url, '/operator');
  const driverPage = await read('app/operator/page.jsx');
  assert.match(driverPage, /return <OperatorPortal\s*\/>/);
  const portal = await read('app/operator/OperatorPortal.jsx');
  assert.match(portal, /operator && \(carrierEntry\s*\? <Workspace\b[^\n]+\s*: <Step3Workspace\b/);
  assert.doesNotMatch(portal, /\{operator && <Workspace\b/);
});

test('each assigned training candidate checks the server using its own load identity', async () => {
  const {default: RateconDriverTest} = await import('../../app/operator/RateconDriverTest.jsx');
  const candidate = (id, number, status = 'assigned') =>
    RateconDriverTest({load: {id, load_number: number, status}, refresh: 0});
  for (const [id, number] of [['first', 'TEST-AGREE-03'], ['second', 'TEST-RC-EXAMPLE']]) {
    const confirmation = candidate(id, number);
    assert.equal(confirmation.props.loadId, id);
    assert.equal(confirmation.props.loadNumber, number);
  }
  assert.equal(candidate('live', 'RC-EXAMPLE'), null);
  assert.equal(candidate('finished', 'TEST-RC-EXAMPLE', 'delivered'), null);
});
