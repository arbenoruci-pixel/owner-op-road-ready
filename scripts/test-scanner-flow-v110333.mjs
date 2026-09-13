import assert from 'node:assert/strict';
import {paperSignature,lockCapturedPage,observePageTransition} from './v110333/pageTransition.js';

const corners=[{x:.15,y:.12},{x:.85,y:.12},{x:.85,y:.9},{x:.15,y:.9}];
const detection={found:true,confidence:.96,corners};
function photo({second=false,exposure=1,dx=0,dy=0}={}){
  const width=300,height=400,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const px=x-dx,py=y-dy,paper=px>45&&px<255&&py>48&&py<360;
    const ink=paper&&px>60&&px<240&&(second?(py>90&&py<260&&py%29<5&&px<190):(py>80&&py<310&&py%18<4));
    const color=Math.round((paper?ink?30:240:62)*exposure),i=(y*width+x)*4;
    data[i]=data[i+1]=data[i+2]=color;data[i+3]=255;
  }
  return {width,height,data};
}
const first=paperSignature(photo(),corners),second=paperSignature(photo({second:true}),corners);
let state=lockCapturedPage(detection,first);
for(let i=0;i<30;i++)state=observePageTransition(state,detection,first);
assert.equal(state.locked,true,'holding the same page never repeatedly captures it');
const dimmed=paperSignature(photo({exposure:.78}),corners);
for(let i=0;i<8;i++)state=observePageTransition(state,detection,dimmed);
assert.equal(state.locked,true,'exposure changes do not create another page');
const shifted=corners.map(p=>({x:p.x+2/300,y:p.y+2/400}));
const jitter=paperSignature(photo({dx:2,dy:2}),shifted);
for(let i=0;i<8;i++)state=observePageTransition(state,{...detection,corners:shifted},jitter);
assert.equal(state.locked,true,'small hand movement keeps the captured page locked');
state=observePageTransition(state,{found:false},null);
state=observePageTransition(state,detection,first);
assert.equal(state.locked,true,'one missed detection does not duplicate a held page');
state=observePageTransition(state,detection,second);
state=observePageTransition(state,detection,first);
assert.equal(state.locked,true,'one changed frame cannot rearm capture');
for(let i=0;i<3;i++)state=observePageTransition(state,detection,second);
assert.equal(state.locked,false,'a different paper layout rearms without requiring an empty frame');
state=lockCapturedPage(detection,first);
for(let i=0;i<2;i++)state=observePageTransition(state,{found:false},null);
state=observePageTransition(state,detection,first);
assert.equal(state.locked,true,'looking away and returning to the same page must not duplicate it');
state=lockCapturedPage(detection,first);
for(let i=0;i<8;i++)state=observePageTransition(state,{...detection,confidence:.6},second);
assert.equal(state.locked,true,'weak boundaries cannot prove a different page');
console.log('PASS — continuous-page transitions, same-page duplicate prevention, exposure and movement tolerance');

state=lockCapturedPage(detection,first);
const far=corners.map(p=>({x:p.x+.18,y:p.y+.05}));
for(let i=0;i<12;i++)state=observePageTransition(state,{...detection,corners:far},first);
assert.equal(state.locked,true,'moving a held sheet far across the frame cannot rearm capture');
state=lockCapturedPage(detection,first);
for(let i=0;i<8;i++)state=observePageTransition(state,{...detection,corners:i%2?corners:far},second);
assert.equal(state.locked,true,'unstable changed pixels cannot prove a new page');
for(let i=0;i<4;i++)state=observePageTransition(state,detection,second);
assert.equal(state.locked,false,'a settled new page still rearms');
state=observePageTransition(state,detection,first);
assert.equal(state.locked,true,'returning to the saved page relocks before processing finishes');
