import assert from 'node:assert/strict';
import fs from 'node:fs';
import {detectDocumentBoundary,trackBoundary,FULL_FRAME,validBoundary} from './v110329/documentBoundary.js';

// Known paper geometry with deterministic textured surroundings. These are
// detection contracts, not substitutes for physical iPhone camera verification.
function fixture({paper=[235,232,225],background=65,texture=24,rect=[65,70,230,305],blank=false,cabinet=false}={}){
  const width=320,height=400,data=new Uint8ClampedArray(width*height*4),[left,top,right,bottom]=rect;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,n=((x*37+y*83+x*y*7)%53)/53-.5;let rgb=Array(3).fill(background+n*texture);
    if(cabinet&&y<105&&x<300)rgb=[195,199,190];
    if(x>=left&&x<=right&&y>=top&&y<=bottom){const shade=1-.13*(x-left)/(right-left);rgb=paper.map(v=>v*shade);if(!blank&&x>left+12&&x<right-12&&y>top+20&&y<bottom-18&&((y-top)%17<3)&&((x-left)%27<22))rgb=[45,43,43];}
    for(let c=0;c<3;c++)data[i+c]=rgb[c];data[i+3]=255;
  }
  return {width,height,data,expected:[{x:left/(width-1),y:top/(height-1)},{x:right/(width-1),y:top/(height-1)},{x:right/(width-1),y:bottom/(height-1)},{x:left/(width-1),y:bottom/(height-1)}]};
}
for(const options of [{},{background:110,texture:100},{paper:[220,157,145],background:55},{background:170,texture:25},{cabinet:true,rect:[50,110,255,350]},{rect:[110,130,235,305]}]){
  const input=fixture(options),before=input.data.slice(),found=detectDocumentBoundary(input);
  assert.ok(found.found,'find document '+JSON.stringify(options));
  const error=Math.max(...found.corners.map((p,i)=>Math.hypot(p.x-input.expected[i].x,p.y-input.expected[i].y)));
  assert.ok(error<.055,'boundary error '+error+' '+JSON.stringify(options));assert.deepEqual(input.data,before);
}
for(const input of [fixture({blank:true}),{width:80,height:120,data:new Uint8ClampedArray(80*120*4).fill(220)}]){const found=detectDocumentBoundary(input);assert.equal(found.found,false);assert.deepEqual(found.corners,FULL_FRAME);}
assert.equal(validBoundary([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]),false);
const d=detectDocumentBoundary(fixture());let tracked=trackBoundary(null,d,0);tracked=trackBoundary(tracked,d,250);assert.equal(tracked.since,0);
const moved={...d,corners:d.corners.map(p=>({...p,x:p.x+.04}))};tracked=trackBoundary(tracked,moved,500);assert.equal(tracked.since,500);assert.equal(trackBoundary(tracked,{found:false},750).corners,null);
// A missed detection must never be described as a clipped physical document.
const qualitySource=fs.readFileSync('scripts/v110329/DocumentQualityV11036.js','utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
const assess=new Function(qualitySource+';return assessDocumentQuality;')();
const result=assess(fixture(),{corners:FULL_FRAME,live:true,detectionFound:false,detectionConfidence:.70,nativeWidth:2160,nativeHeight:3840});
assert.equal(result.ready,false);assert.match(result.issues[0],/Finding the paper/);assert.ok(!result.issues.some(s=>/space around|whole page/.test(s)));
const intake=fs.readFileSync('source/src/modules/scan/ScanIntakeV110328.jsx','utf8');
assert.ok(intake.includes('session.detection?.found'));assert.ok(intake.includes('finalize(session,corners,{preserveOrientation:true})'));assert.ok(intake.includes('finalize(session,page.corners||FULL_PAGE,{preserveOrientation:true})'));
assert.ok(intake.includes('onCapture={file=>addFiles([file],true)}'));
console.log('PASS — paper boundaries on six backgrounds, unchanged pixels, blank rejection, tracking, guidance and retained crop');
