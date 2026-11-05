import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readDocument,textObservation} from '../../packages/smart-reader-core/src/index.js';
import {admitAiExtractionCandidates,validateAiExtractionResponse,extractionFields} from '../../lib/reader-ai/extraction.js';
import {PROFILES} from '../../packages/smart-reader-core/src/profiles.js';
import {createAiExtraction} from '../../lib/reader-ai/extract.js';
import {keyReadingFields,pageProposals,confirmReadingBatch} from '../../source/src/modules/scan/compactReadingV1104101.js';
import {captureRank,canAutoDeliver,sameCapturePage} from './captureQuality.js';
import {cleanupDocumentPaper} from './paperQuality.js';
import {assessDocumentQuality} from '../../source/src/modules/scan/v3/DocumentQualityV11036.js';

const hash='a'.repeat(64),image='data:image/jpeg;base64,/9j/2Q==';
function fixture(){
  const result=readDocument({documentId:'doc',pages:[{id:'p1',number:1,observations:[{...textObservation('BILL OF LADING\nBOL No: B-4321\nSHIP FROM: Test Mill\nSHIP TO: Test Market\nWeight: 1000 LB'),sourceImageId:'doc:p1:original'}]}]});
  const group=result.documents[0],page=result.pages[0];
  const raw={kind:'bol',quality:'readable',candidates:[{field:'poNumber',rawValue:'PO-7401',quote:'Purchase order PO-7401',location:'top'},{field:'documentDate',rawValue:'2026-11-04',quote:'Date 2026-11-04',location:'top'}]};
  const options={documentId:'doc',groupId:group.id,page,sourceImageId:'doc:p1:original',model:'example/vision',imageHash:hash,fields:['poNumber','documentDate']};
  return {result,group,page,raw,options};
}
test('image-only reading stays explicitly unverified and requires the exact retained original',()=>{
  const f=fixture(),before=structuredClone(f.result);
  assert.equal(admitAiExtractionCandidates(f.raw,f.options).candidates.length,0);
  const recovered=admitAiExtractionCandidates(f.raw,{...f.options,allowVisual:true});
  assert.equal(recovered.candidates.length,2);
  for(const c of recovered.candidates){assert.equal(c.visualOnly,true);assert.equal(c.verified,false);assert.equal(c.canAutoFile,false);assert.deepEqual(c.provenance.evidence,[]);assert.equal(c.provenance.sourceLinkVerified,false);}
  for(const change of [{sourceImageId:'another:p1:original'},{imageHash:'wrong'},{model:''}])assert.equal(admitAiExtractionCandidates(f.raw,{...f.options,...change,allowVisual:true}).candidates.length,0);
  assert.deepEqual(f.result,before);
});
test('one checked batch updates only the displayed fields, atomically and at the current revision',()=>{
  const f=fixture();f.result.aiExtraction=admitAiExtractionCandidates(f.raw,{...f.options,allowVisual:true});
  const before=structuredClone(f.result),request={documentId:'doc',groupId:f.group.id,pageId:'p1',sourceImageId:'doc:p1:original',expectedRevision:f.result.reviewRevision,values:{poNumber:'PO-7401',documentDate:'2026-11-04'},userConfirmed:true};
  const next=confirmReadingBatch(f.result,request);
  assert.equal(next.documents[0].fields.poNumber.value,'PO-7401');assert.equal(next.documents[0].fields.documentDate.value,'2026-11-04');
  assert.equal(next.documents[0].fields.poNumber.correction.origin,'human');assert.deepEqual(next.documents[0].fields.bolNumber,f.group.fields.bolNumber);assert.equal(next.documents[0].kind,'bol');
  for(const change of [{userConfirmed:false},{expectedRevision:99},{pageId:'other'},{sourceImageId:'doc:p1:crop'},{values:{poNumber:'PO-7401',documentDate:'not a date'}},{values:{carrier:'OTHER'}}])assert.throws(()=>confirmReadingBatch(f.result,{...request,...change}));
  assert.throws(()=>confirmReadingBatch(next,request));assert.deepEqual(f.result,before);
  assert.ok(keyReadingFields(f.group).length<=4);assert.equal(pageProposals(f.result,f.group,'p1').length,2);
});
test('visual extraction uses the existing authenticated budget and requests only missing key fields',async()=>{
  const f=fixture(),calls=[],imageHash=createHash('sha256').update(Buffer.from(image.split(',')[1],'base64')).digest('hex');
  const extract=createAiExtraction({session:async()=>({access_token:'test',user:{id:'synthetic'}}),prepare:async()=>image,fetcher:async(_url,options={})=>{
    if(options.method!=='POST')return Response.json({enabled:true,model:'example/vision',extraction:{version:'document-extraction-candidates-v1'}});
    calls.push(JSON.parse(options.body));return Response.json({ok:true,pageNumber:1,result:{...f.raw,version:'document-extraction-candidates-v1',model:'example/vision',imageHash}});
  }});
  const analysis={aiClassification:{attemptedPageCount:3}},args={analysis,result:f.result,groupId:f.group.id,pageId:'p1',sourceImageId:'doc:p1:original',file:{},allowVisual:true,requestedFields:['poNumber','documentDate']};
  const stage=await extract(args);assert.equal(stage.candidates.length,2);assert.equal(stage.reason,'visual_candidates');assert.deepEqual(new Set(calls[0].fields),new Set(['poNumber','documentDate']));
  assert.equal((await extract({...args,previous:stage})).reason,'limit_reached');assert.equal(calls.length,1);
});
test('capture ranks text focus and ready pages over sharp borders and rejects changed auto shots',()=>{
  const sharpBorder={ready:false,score:1,metrics:{sharpness:9000,textSharpness:10,textTileCount:8,shortEdge:1800}};
  const text={ready:true,score:.7,metrics:{sharpness:500,textSharpness:300,textTileCount:8,shortEdge:1600}};
  assert.ok(captureRank(text)>captureRank(sharpBorder));
  const signature=Array.from({length:192},(_,i)=>i%3?.02:.2),changed=signature.map(x=>x===.2?.02:.3);
  assert.equal(sameCapturePage(signature,signature),true);assert.equal(sameCapturePage(signature,changed),false);
  const candidate={quality:text,detection:{found:true,confidence:.9},signature};
  assert.equal(canAutoDeliver(candidate,signature),true);assert.equal(canAutoDeliver(candidate,changed),false);
  assert.equal(canAutoDeliver({...candidate,quality:sharpBorder},signature),false);
  assert.equal(canAutoDeliver({...candidate,detection:{found:false}},signature),false);
});
test('warm paper shadows become white while gray strokes, open digits and colored stamps survive',()=>{
  const width=400,height=560,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const shade=.5+.45*x/width;data.set([250*shade,210*shade,175*shade,255],(y*width+x)*4);}
  const rectangle=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)data.set([...c,255],(j*width+i)*4);};
  const paper=[...data.slice((150*width+102)*4,(150*width+102)*4+3)];
  rectangle(95,140,14,26,[72,63,51]);rectangle(99,144,6,18,paper);rectangle(125,140,3,26,[72,63,51]);rectangle(30,210,300,1,[100,85,70]);
  rectangle(220,300,65,50,[150,25,20]);rectangle(300,300,65,50,[25,45,150]);
  const before=data.slice(),out=cleanupDocumentPaper({width,height,data}),rgb=(x,y)=>[...out.data.slice((y*width+x)*4,(y*width+x)*4+3)];
  assert.deepEqual(data,before);assert.ok(Math.min(...rgb(40,80))>248);assert.ok(Math.max(...rgb(40,80))-Math.min(...rgb(40,80))<5);
  assert.ok(Math.min(...rgb(96,150))<90);assert.ok(Math.min(...rgb(102,150))>240);assert.ok(Math.min(...rgb(120,150))>245);assert.ok(Math.min(...rgb(150,210))<180);
  assert.ok(rgb(240,320)[0]>rgb(240,320)[1]*2);assert.ok(rgb(330,320)[2]>rgb(330,320)[0]*2);
});
test('sparse sharp print is not mistaken for an empty page because margins dominate percentiles',()=>{
  const width=640,height=900,data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4)data.set([240,240,240,255],i);
  const options={nativeWidth:1600,nativeHeight:2250};
  assert.equal(assessDocumentQuality({width,height,data},options).ready,false);
  for(let y=70;y<830;y+=42)for(let x=70;x<570;x+=22)for(let dy=0;dy<6;dy++)data.set([50,50,50,255],((y+dy)*width+x)*4);
  const quality=assessDocumentQuality({width,height,data},options);
  assert.equal(quality.metrics.contrast,0);assert.equal(quality.ready,true);
  assert.equal(assessDocumentQuality({width,height,data},{...options,live:true,detectionFound:false}).ready,false);
});
test('conflicting AI values stay out of the single checked batch',()=>{
  const f=fixture(),stage=admitAiExtractionCandidates(f.raw,{...f.options,allowVisual:true});
  stage.candidates.push({...stage.candidates[0],rawValue:'PO-OTHER'});f.result.aiExtraction=stage;
  assert.deepEqual(pageProposals(f.result,f.group,'p1').map(c=>c.field),['documentDate']);
});
test('compact details use real fields across receipts, shipping and wallet document types',()=>{
  for(const profile of PROFILES){const keys=keyReadingFields({...profile,kind:profile.id});assert.ok(keys.length<=4);assert.ok(keys.every(key=>profile.fields[key]));}
  for(const kind of ['meal_receipt','washout_receipt','toll_parking_receipt']){
    const profile=PROFILES.find(p=>p.id===kind);assert.ok(keyReadingFields({...profile,kind:profile.id}).includes('total'));
    const value=validateAiExtractionResponse({kind,quality:'readable',candidates:[{field:'total',rawValue:'$35.00',quote:'Total $35.00',location:'bottom'}]},{kind,fields:['total']});assert.equal(value.candidates[0].rawValue,'$35.00');
  }
  for(const kind of ['delivery_order','packing_list'])assert.ok(extractionFields(kind,keyReadingFields({...PROFILES.find(p=>p.id===kind),kind})).includes('date'));
  for(const kind of ['driver_license','registration','insurance'])assert.ok(extractionFields(kind,keyReadingFields({...PROFILES.find(p=>p.id===kind),kind})).includes('expirationDate'));
});
