import assert from 'node:assert/strict';
import {cleanupDocumentPaper} from './v110345/paperQuality.js';
const width=500,height=700,data=new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const shade=.68+.26*x/width,offset=(y*width+x)*4;
 data.set([228*shade,239*shade,250*shade,255],offset);
}
const pixel=(x,y)=>[...data.slice((y*width+x)*4,(y*width+x)*4+3)];
function rectangle(x,y,w,h,color){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)data.set([...color,255],(j*width+i)*4);}
// A small gray digit with an open center, thin separators and colored stamps.
const centerPaper=pixel(100,155);
rectangle(95,150,11,23,[75,78,80]);rectangle(98,154,5,15,centerPaper);
rectangle(115,150,3,23,[75,78,80]);
rectangle(80,200,180,1,[125,127,130]);
rectangle(250,300,65,50,[170,35,30]);rectangle(330,300,65,50,[30,55,175]);
const before=data.slice(),out=cleanupDocumentPaper({width,height,data});
assert.deepEqual(data,before);assert.equal(out.width,width);assert.equal(out.height,height);
const rgb=(x,y)=>[...out.data.slice((y*width+x)*4,(y*width+x)*4+3)];
const luma=(x,y)=>rgb(x,y).reduce((n,v)=>n+v,0)/3;
assert.ok(Math.min(...rgb(40,80))>248,'shadowed paper becomes white');
assert.ok(Math.max(...rgb(40,80))-Math.min(...rgb(40,80))<5,'blue paper cast is neutralized');
assert.ok(luma(96,160)<90,'ink remains dark');
assert.ok(luma(100,160)>245,'digit counter remains open');
assert.ok(luma(110,160)>245,'adjacent digits remain separated');
assert.ok(luma(150,200)<180,'thin gray rule remains visible');
assert.ok(rgb(275,320)[0]>rgb(275,320)[1]*2,'broad red stamp stays red');
assert.ok(rgb(350,320)[2]>rgb(350,320)[0]*2,'broad blue stamp stays blue');
assert.ok(out.data.every((v,i)=>i%4!==3||v===255));
console.log('PASS — neutral white paper, darker text, open digit gaps, thin rules, color stamps and immutable native pixels');
