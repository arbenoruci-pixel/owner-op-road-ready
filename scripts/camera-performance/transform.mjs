import assert from 'node:assert/strict';

// Mechanical allocation reduction only. Preserve arithmetic order, candidate
// traversal, thresholds and returned metadata. Fail on unknown historical code.
export function optimizeBoundarySource(source){
  {
    const before=`function sampleImage(image,maxSide) {
  const scale=Math.min(1,maxSide/Math.max(image.width,image.height)),w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
  // Relative chroma separates pale paper from pale furniture despite fold shadows.
  const rgb=new Float32Array(w*h*3),gray=new Float32Array(w*h),neutral=new Float32Array(w*h),paperColor=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=clamp((x+.5)/scale-.5,0,image.width-1),sy=clamp((y+.5)/scale-.5,0,image.height-1),x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0,i=y*w+x;
    for(let c=0;c<3;c++){
      const at=(xx,yy)=>image.data[(Math.min(image.height-1,yy)*image.width+Math.min(image.width-1,xx))*4+c];
      rgb[i*3+c]=(at(x0,y0)*(1-fx)+at(x0+1,y0)*fx)*(1-fy)+(at(x0,y0+1)*(1-fx)+at(x0+1,y0+1)*fx)*fy;
    }
    const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2];gray[i]=r*.2126+g*.7152+b*.0722;neutral[i]=gray[i]-(Math.max(r,g,b)-Math.min(r,g,b))*.7;paperColor[i]=gray[i]<85?0:255-700*(Math.max(r,g,b)-Math.min(r,g,b))/Math.max(40,gray[i]);
  }
  const smooth=input=>{const out=new Float32Array(input.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=input[clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1)]*(dx===0?2:1)*(dy===0?2:1);out[y*w+x]=sum/16;}return out;};
  return {w,h,rgb,gray,blur:smooth(gray),neutral:smooth(neutral),paperColor:smooth(paperColor)};
}
`;
    const after=`function sampleImage(image,maxSide) {
  const scale=Math.min(1,maxSide/Math.max(image.width,image.height)),w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
  // Relative chroma separates pale paper from pale furniture despite fold shadows.
  const rgb=new Float32Array(w*h*3),gray=new Float32Array(w*h),neutral=new Float32Array(w*h),paperColor=new Float32Array(w*h);
  const direct=scale===1&&image.width===w&&image.height===h&&(image.data instanceof Uint8Array||image.data instanceof Uint8ClampedArray)&&image.data.length===w*h*4;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(direct){
      rgb[i*3]=image.data[i*4];rgb[i*3+1]=image.data[i*4+1];rgb[i*3+2]=image.data[i*4+2];
    }else{
    const sx=clamp((x+.5)/scale-.5,0,image.width-1),sy=clamp((y+.5)/scale-.5,0,image.height-1),x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
    for(let c=0;c<3;c++){
      const at=(xx,yy)=>image.data[(Math.min(image.height-1,yy)*image.width+Math.min(image.width-1,xx))*4+c];
      rgb[i*3+c]=(at(x0,y0)*(1-fx)+at(x0+1,y0)*fx)*(1-fy)+(at(x0,y0+1)*(1-fx)+at(x0+1,y0+1)*fx)*fy;
    }    }
    const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2];gray[i]=r*.2126+g*.7152+b*.0722;neutral[i]=gray[i]-(Math.max(r,g,b)-Math.min(r,g,b))*.7;paperColor[i]=gray[i]<85?0:255-700*(Math.max(r,g,b)-Math.min(r,g,b))/Math.max(40,gray[i]);
  }
  const blur=new Float32Array(w*h),smoothNeutral=new Float32Array(w*h),smoothPaper=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let a=0,b=0,c=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const i=clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1),wx=dx===0?2:1,wy=dy===0?2:1;
      a+=gray[i]*wx*wy;b+=neutral[i]*wx*wy;c+=paperColor[i]*wx*wy;
    }
    const i=y*w+x;blur[i]=a/16;smoothNeutral[i]=b/16;smoothPaper[i]=c/16;
  }
  return {w,h,rgb,gray,blur,neutral:smoothNeutral,paperColor:smoothPaper};
}
`;
    assert.equal(source.split(before).length,2,'Exact historical detector optimization anchor');
    source=source.replace(before,()=>after);
  }
  {
    const before=`function regions(values,threshold,w,h,visit) {
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),minCount=w*h*.065;
  for(let seed=0;seed<values.length;seed++){
    if(seen[seed]||values[seed]<threshold)continue;
    let head=0,tail=1;queue[0]=seed;seen[seed]=1;const boundary=[];let touches=0;
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);let border=false;
      if(x===0||y===0||x===w-1||y===h-1)touches++;
      for(const n of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1]){
        if(n<0||values[n]<threshold){border=true;continue;}if(!seen[n]){seen[n]=1;queue[tail++]=n;}
      }
      if(border)boundary.push({x,y});
    }
    if(tail>=minCount&&tail<w*h*.94&&touches<Math.min(w,h)*.45)visit(boundary,tail);
  }
}
`;
    const after=`function regions(values,threshold,w,h,visit) {
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),minCount=w*h*.065;
  for(let seed=0;seed<values.length;seed++){
    if(seen[seed]||values[seed]<threshold)continue;
    let head=0,tail=1;queue[0]=seed;seen[seed]=1;const boundary=[];let touches=0;
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);let border=false;
      if(x===0||y===0||x===w-1||y===h-1)touches++;
      {const n=x>0?i-1:-1;if(n<0||values[n]<threshold)border=true;else if(!seen[n]){seen[n]=1;queue[tail++]=n;}}
      {const n=x<w-1?i+1:-1;if(n<0||values[n]<threshold)border=true;else if(!seen[n]){seen[n]=1;queue[tail++]=n;}}
      {const n=y>0?i-w:-1;if(n<0||values[n]<threshold)border=true;else if(!seen[n]){seen[n]=1;queue[tail++]=n;}}
      {const n=y<h-1?i+w:-1;if(n<0||values[n]<threshold)border=true;else if(!seen[n]){seen[n]=1;queue[tail++]=n;}}

      if(border)boundary.push({x,y});
    }
    if(tail>=minCount&&tail<w*h*.94&&touches<Math.min(w,h)*.45)visit(boundary,tail);
  }
}
`;
    assert.equal(source.split(before).length,2,'Exact historical detector optimization anchor');
    source=source.replace(before,()=>after);
  }
  return source;
}
