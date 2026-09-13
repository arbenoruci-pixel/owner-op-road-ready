import assert from 'node:assert/strict';
import {detectDocumentBoundary,FULL_FRAME} from './v110332/documentBoundary.js';

// A page spans a pale board, coarse carpet and dark upholstery. The board
// touches the image border and shares the page's brightness; its chroma differs.
// Procedural pixels only: no private document or video content is committed.
function fixture({seed=1,tint=[211,211,204],plain=false,blank=false,background='mixed',shadow=.20}={}){
  const width=360,height=640,data=new Uint8ClampedArray(width*height*4);
  const expected=[{x:66,y:186},{x:286,y:182},{x:304,y:516},{x:47,y:524}];
  const cross=(a,b,x,y)=>(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const n=((x*73+y*137+x*y*seed)%127)/127,inside=!plain&&expected.every((p,i)=>cross(p,expected[(i+1)%4],x,y)>=0);
    let rgb=[95+n*100,82+n*99,64+n*95];
    if(background==='dark')rgb=[44+n*12,47+n*12,45+n*12];
    if(background==='light')rgb=[184+n*8,178+n*8,156+n*8];
    if(background==='mixed'){
      if(x<210&&y<535)rgb=[207-y*.035,202-y*.037,172-y*.043];
      if(y>=535&&x<319)rgb=[48+n*15,49+n*15,46+n*15];
    }
    if(inside){
      const shade=1-shadow*Math.exp(-(((x-88)/75)**2))-.09*Math.exp(-(((y-397)/10)**2));rgb=tint.map(v=>v*shade);
      if(!blank){
        if(x>83&&x<272&&y>203&&y<397&&(y%22<2)&&(x%37<28))rgb=[66,63,61];
        // Strong table rules inside the page must not become its outer boundary.
        if(x>76&&x<279&&y>241&&y<323&&(y%27<2||x===77||x===278))rgb=[35,35,35];
        if(x>145&&x<250&&y>423&&y<457&&y%17<2)rgb=[70,84,111];
        if(x>64&&x<289&&y>495&&y<501)rgb=[22,22,22];
      }
    }
    data.set([...rgb,255],(y*width+x)*4);
  }
  return {width,height,data,expected};
}
for(const options of [{},{seed:3},{seed:11,shadow:.12},{seed:17,shadow:.26},{background:'light'},{background:'dark'},{background:'dark',tint:[224,160,146]}]){
  const image=fixture(options),original=image.data.slice(),d=detectDocumentBoundary(image);
  assert.ok(d.found,'find the complete paper '+JSON.stringify(options));
  const error=Math.max(...d.corners.map((p,i)=>Math.hypot(p.x*(image.width-1)-image.expected[i].x,p.y*(image.height-1)-image.expected[i].y)));
  assert.ok(error<13,'outer paper error '+error+' '+JSON.stringify(options));
  assert.ok(d.confidence>=.80,'complete paper supports capture '+JSON.stringify(options));
  assert.deepEqual(image.data,original);
}
for(const options of [{plain:true},{plain:true,seed:7},{plain:true,background:'dark'},{plain:true,background:'light'},{blank:true,background:'dark'}]){
  const image=fixture(options),d=detectDocumentBoundary(image);
  assert.equal(d.found,false,'no automatic paper candidate on '+JSON.stringify(options));
  assert.deepEqual(d.corners,FULL_FRAME);
}
console.log('PASS — complete paper across pale board/carpet/upholstery, internal-rule rejection, colored forms and no-paper rejection');
