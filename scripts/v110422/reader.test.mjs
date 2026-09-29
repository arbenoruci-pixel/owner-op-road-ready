import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation} from '../../packages/smart-reader-core/src/index.js';
import {createAiReaderHandlers} from '../../lib/reader-ai/server.js';
import {scanWithSourceFields} from '../../packages/smart-reader-core/src/scanFields.js';
const project='prj_OsMcJCe943O2dpo2Z9CMXKzRBOtX';
const text='DELIVERY ORDER\nDELIVERY ORDER No: D-1234\nLOAD No: L-1234\nBILL TO: Example Company\nCTNS DESCRIPTION MASTER BILL HOUSE BILL WEIGHT\nNOT a Bill of Lading\nShipper signature: _____';
function read(source=text,sideways=false){const observation=textObservation(source);observation.sourceImageId='original';observation.lines.forEach((l,i)=>{l.confidence=.9;l.box=sideways?{x:.92-i*.04,y:.05,width:.02,height:.5}:{x:.05,y:.03+i*.06,width:.5,height:.02};});return readDocument({documentId:'synthetic',pages:[{id:'p',observations:[observation]}]});}
test('sideways delivery authorization keeps original evidence and never becomes BOL/POD',()=>{
  for(const sideways of [false,true]){const result=read(text,sideways);assert.equal(result.pageIdentities[0].kind,'delivery_order');assert.equal(result.pageIdentities[0].status,'supported');assert.equal(result.pageIdentities[0].evidence[0].evidence.box.x,sideways?.92:.05);}
});
test('shipping structure is required and instructions cannot establish a Delivery Order',()=>{
  assert.equal(read('DELIVERY ORDER').pageIdentities[0].kind,'unknown');
  assert.notEqual(read('Please send DELIVERY ORDER\nBILL TO: Example\nCTNS MASTER BILL WEIGHT').pageIdentities[0].kind,'delivery_order');
});
test('activation is isolated to the authorized project and has an explicit kill switch',async()=>{
  for(const env of [{VERCEL_OIDC_TOKEN:'test'}, {VERCEL_PROJECT_ID:'another',VERCEL_OIDC_TOKEN:'test'}, {VERCEL_PROJECT_ID:project,VERCEL_OIDC_TOKEN:'test',READER_AI_ENABLED:'false'}])assert.equal((await (await createAiReaderHandlers({env:()=>env}).GET()).json()).enabled,false);
  const result=await (await createAiReaderHandlers({env:()=>({VERCEL_PROJECT_ID:project,VERCEL_OIDC_TOKEN:'test'})}).GET()).json();assert.equal(result.enabled,true);assert.equal(result.model,'openai/gpt-5.4-mini');assert.equal('key' in result,false);
});
test('delivery reference updates come from this exact source review',()=>{
  const result=read();const analysis={type:{id:'delivery_order'},fields:{loadNo:'STALE'},text};
  assert.equal(scanWithSourceFields(analysis,{analysis:{},result},'delivery_order'),analysis);
  const updated=scanWithSourceFields(analysis,{analysis,result},'delivery_order');assert.equal(updated.fields.loadNo,'L-1234');assert.equal(updated.routing.autoFile,false);assert.equal(updated.fields.readerSourceFieldsV110393.fields.loadNo.evidence[0].quote,'L-1234');
});

test('rotated OCR line ordering can place a real heading after twenty lines',()=>{const result=readDocument({documentId:'late-title',pages:[{id:'p',observations:[textObservation(Array(30).fill('form detail').join('\n')+'\n'+text)]}]});assert.equal(result.pageIdentities[0].kind,'delivery_order');});
