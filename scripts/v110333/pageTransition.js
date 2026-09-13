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

export function lockCapturedPage(detection,signature){
  return {locked:true,corners:detection?.found?detection.corners:null,signature,missing:0,changed:0};
}

export function observePageTransition(previous,detection,signature){
  if(!previous?.locked)return previous;
  if(!detection.found){const missing=previous.missing+1;return {...previous,missing,changed:0,locked:missing<2};}
  // A weak outline cannot prove that the driver has presented a new page.
  if(detection.confidence<.8)return {...previous,missing:0,changed:0};
  let different=false;
  if(previous.corners){
    const movement=detection.corners.reduce((sum,p,i)=>sum+Math.hypot(p.x-previous.corners[i].x,p.y-previous.corners[i].y),0)/4;
    different=movement>.13;
  }
  if(!different&&signature&&previous.signature){
    let delta=0,ink=0;
    for(let i=0;i<signature.length;i++){delta+=Math.abs(signature[i]-previous.signature[i]);ink+=Math.max(signature[i],previous.signature[i]);}
    different=delta/signature.length>.035&&delta/Math.max(ink,1)>.5;
  }
  const changed=different?previous.changed+1:0;
  return {...previous,missing:0,changed,locked:changed<3};
}
