import assert from 'node:assert/strict';
import { assessDocumentQuality, normalizePaperLighting, updateCaptureStability } from '../source/src/modules/scan/v3/DocumentQualityV11036.js';
import { qualifyScanResultV11036 } from '../source/src/modules/scan/DocumentEvidenceV11036.js';
import { recognizeDocumentText, terminateWebOcr } from '../source/src/modules/scan/webOcr.js';
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS — '+name);};
function page(w=1200,h=1600){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=Math.round(150+90*x/w);if(y%36<5&&x>100&&x<w-100)v=35;const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}return {width:w,height:h,data};}
const original=page(),before=original.data.slice(),fixed=normalizePaperLighting(original);
test('Enhancement preserves original bytes and image dimensions',()=>{assert.deepEqual(original.data,before);assert.equal(fixed.width,original.width);assert.equal(fixed.data.length,original.data.length);});
test('Uneven paper illumination becomes more uniform while ink stays dark',()=>{const at=(im,x,y)=>im.data[(y*im.width+x)*4];assert.ok(Math.abs(at(fixed,100,100)-at(fixed,1100,100))<Math.abs(at(original,100,100)-at(original,1100,100)));assert.ok(at(fixed,300,36)<80);});
test('Color stamp channels retain their order',()=>{const im=page(300,400),i=(100*300+100)*4;im.data[i]=190;im.data[i+1]=40;im.data[i+2]=30;const out=normalizePaperLighting(im);assert.ok(out.data[i]>out.data[i+1]*3);assert.ok(out.data[i+1]>out.data[i+2]);});
test('Blank and small photos require review',()=>{const blank={width:500,height:700,data:new Uint8ClampedArray(500*700*4).fill(255)};assert.equal(assessDocumentQuality(blank).ready,false);assert.ok(assessDocumentQuality(blank).issues.some(s=>s.includes('Low resolution')));});
test('Live auto capture requires stable corners and resets on motion or bad quality',()=>{const corners=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}],d={corners};let s=null;for(let t=0;t<=1400;t+=350)s=updateCaptureStability(s,d,{ready:true},t);assert.equal(s.ready,true);s=updateCaptureStability(s,{corners:corners.map(p=>({...p,x:p.x+.04}))},{ready:true},1750);assert.equal(s.ready,false);s=updateCaptureStability(s,d,{ready:false},2100);assert.equal(s.ready,false);});
const state={activeDay:'2026-09-09',eventsByDay:{'2026-09-09':[{id:'sample',status:'ON',startMin:500,reason:'pickup',bol:'999999'}]}};
test('Driver can manually choose BOL after empty OCR while keeping review required',()=>{const r=qualifyScanResultV11036({type:{id:'bol'},userSelectedTypeV11036:'bol',text:'',fields:{},confidence:.1},state);assert.equal(r.type.id,'bol');assert.equal(r.needsReview,true);assert.equal(r.fields.bolNo,undefined);});
test('Weak empty OCR cannot invent BOL number or document date from active load',()=>{const r=qualifyScanResultV11036({type:{id:'rate_confirmation'},text:'',fields:{},confidence:.6},state);assert.equal(r.type.id,'other');assert.equal(r.fields.bolNo,undefined);assert.equal(r.fields.documentDate,undefined);assert.equal(r.evidenceReviewV11036.suggestedLoad.loadNo,'999999');assert.equal(r.routing.autoFile,false);});
test('TQL shipping form is BOL when structured shipping evidence beats weak Rate Con guess',()=>{const r=qualifyScanResultV11036({type:{id:'rate_confirmation'},text:'BILL OF LADING\nTT SHIPPING CUSTOMER COPY\nSHIP FROM\nSHIP TO\nPACKAGING WEIGHT CLASS\nBOL NO: 26023311\nPage 1 of 2',fields:{bolNo:'26023311'},confidence:.65},state);assert.equal(r.type.id,'bol');assert.equal(r.fields.bolNo,'26023311');assert.ok(r.evidenceReviewV11036.issues.some(s=>s.includes('2 pages')));assert.equal(r.evidenceReviewV11036.evidence.bolNo.source,'document_text');});
test('Strong Rate Confirmation stays a Rate Confirmation',()=>{const r=qualifyScanResultV11036({type:{id:'rate_confirmation'},text:'CARRIER RATE CONFIRMATION\nTOTAL CARRIER PAY $4,800.00\nLOAD NO 123456\n9/9/2026',fields:{loadNo:'123456',date:'2026-09-09'},confidence:.97},state);assert.equal(r.type.id,'rate_confirmation');assert.equal(r.fields.loadNo,'123456');assert.equal(r.evidenceReviewV11036.evidence.date.source,'document_text');});
test('Printed signature labels and OCR flags do not verify a receiver signature',()=>{const r=qualifyScanResultV11036({type:{id:'pod'},text:'PROOF OF DELIVERY\nReceiver signature: __________\nDelivery date: ______',fields:{podSigned:true,podSignedEvidence:true},confidence:.99});assert.equal(r.type.id,'pod');assert.equal(r.fields.podSigned,false);assert.equal(r.needsReview,true);assert.equal(r.evidenceReviewV11036.signatureStatus,'needs_visual_review');});
test('Mixed packet and unobserved critical values require review',()=>{const r=qualifyScanResultV11036({type:{id:'bol'},text:'BILL OF LADING\nRATE CONFIRMATION',fields:{bolNo:'123456',date:'2026-09-09'},confidence:.95,routing:{autoFile:true}});assert.ok(r.evidenceReviewV11036.issues.some(s=>s.includes('mixed')));assert.equal(r.evidenceReviewV11036.evidence.bolNo.source,'unverified');assert.equal(r.routing.autoFile,false);});
test('Parts receipts retain classification and values',()=>{const r=qualifyScanResultV11036({type:{id:'parts_receipt'},text:'PARTS RECEIPT TOTAL 50.00',fields:{total:50},confidence:.91});assert.equal(r.type.id,'parts_receipt');assert.equal(r.fields.total,50);});
let reads=0,parameters=[],terminated=0;
globalThis.window={Tesseract:{createWorker:async()=>({setParameters:async p=>parameters.push(p),recognize:async()=>{reads++;return {data:{text:'BILL OF LADING 123456',confidence:95,tsv:''}};},terminate:async()=>{terminated++;}})}};
const image=new File(['test'],'test.jpg',{type:'image/jpeg'});
await Promise.all([recognizeDocumentText(image,{returnLayout:true,numericMode:true}),recognizeDocumentText(image,{returnLayout:true,numericMode:true})]);
test('Concurrent identical OCR calls share one worker read',()=>assert.equal(reads,1));
await recognizeDocumentText(image,{returnLayout:true,numericMode:false});
test('OCR settings reset numeric mode and distinct options are independently read',()=>{assert.equal(reads,2);assert.equal(parameters.at(-1).classify_bln_numeric_mode,'0');});
await terminateWebOcr();
test('Worker cleanup releases the worker',()=>assert.equal(terminated,1));
const nativeTimeout=globalThis.setTimeout;
let attempts=0;
window.Tesseract.createWorker=async()=>({setParameters:async()=>{},recognize:()=>++attempts===1?new Promise(()=>{}):Promise.resolve({data:{text:'BOL 123456',confidence:94}}),terminate:async()=>{}});
try {
  globalThis.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms>=35000?20:ms,...args);
  await assert.rejects(recognizeDocumentText(image),/ocr_read_timeout/);
  const retry=await recognizeDocumentText(image);
  test('Timed-out OCR releases the queue, discards failed cache and can retry',()=>assert.equal(retry.text,'BOL 123456'));
} finally {globalThis.setTimeout=nativeTimeout;await terminateWebOcr();}
console.log(`${count} scanner behavior checks passed`);
