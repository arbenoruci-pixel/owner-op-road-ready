// Small, local paper descriptors. No image bytes leave the camera. Comparing
// the paper in its own coordinates tolerates hand movement and exposure drift.
export function paperSignature(image,corners){
  if(!corners||corners.length!==4)return null;
  const {width,height,data}=image,values=[];
  for(let row=0;row<16;row++)for(let col=0;col<12;col++){
    let sum=0;
    for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
      const u=.04+.92*(col+(sx+.5)/4)/12,v=.04+.92*(row+(sy+.5)/4)/16;
      const x=(1-v)*((1-u)*corners[0].x+u*corners[1].x)+v*((1-u)*corners[3].x+u*corners[2].x);
      const y=(1-v)*((1-u)*corners[0].y+u*corners[1].y)+v*((1-u)*corners[3].y+u*corners[2].y);
      const i=(Math.max(0,Math.min(height-1,Math.round(y*(height-1))))*width+Math.max(0,Math.min(width-1,Math.round(x*(width-1)))))*4;
      sum+=.299*data[i]+.587*data[i+1]+.114*data[i+2];
    }
    values.push(sum/16);
  }
  const white=[...values].sort((a,b)=>a-b)[Math.floor(values.length*.85)];
  return values.map(value=>Math.max(0,Math.min(1,(white-value)/Math.max(white,80))));
}

const movement=(a,b)=>a&&b?Math.max(...a.map((point,i)=>Math.hypot(point.x-b[i].x,point.y-b[i].y))):Infinity;

export function lockCapturedPage(detection,signature){
  return {locked:true,corners:detection?.found?detection.corners:null,signature,missing:0,changed:0,observedCorners:detection?.corners||null};
}

export function observePageTransition(previous,detection,signature){
  if(!previous)return previous;
  // An absent outline or a moved phone is not evidence of another sheet.
  if(!detection.found)return {...previous,missing:previous.missing+1,changed:0,locked:true,observedCorners:null};
  const stable=movement(previous.observedCorners,detection.corners)<=.018;
  const next={...previous,missing:0,observedCorners:detection.corners};
  if(detection.confidence<.8||!stable||!signature||!previous.signature)return {...next,changed:0,locked:true};
  let delta=0,ink=0;
  for(let i=0;i<signature.length;i++){delta+=Math.abs(signature[i]-previous.signature[i]);ink+=Math.max(signature[i],previous.signature[i]);}
  const different=delta/signature.length>.035&&delta/Math.max(ink,1)>.5;
  const changed=different?previous.changed+1:0;
  // Re-check even after rearming: returning to the captured sheet relocks it.
  return {...next,changed,locked:changed<3};
}
