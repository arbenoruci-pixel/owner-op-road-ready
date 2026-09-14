const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

// Sliding extrema are linear in the analysis pixels, independent of kernel size.
function extrema(input,w,h,radius,maximum,horizontal){
  const output=new Float32Array(input.length),length=horizontal?w:h,lines=horizontal?h:w,stride=horizontal?1:w,queue=new Int32Array(length);
  for(let line=0;line<lines;line++){
    const base=horizontal?line*w:line;let head=0,tail=0,entered=0;
    for(let p=0;p<length;p++){
      const end=Math.min(length-1,p+radius);
      while(entered<=end){const value=input[base+entered*stride];while(tail>head&&(maximum?input[base+queue[tail-1]*stride]<=value:input[base+queue[tail-1]*stride]>=value))tail--;queue[tail++]=entered++;}
      while(queue[head]<p-radius)head++;
      output[base+p*stride]=input[base+queue[head]*stride];
    }
  }
  return output;
}
function smooth(input,w,h){
  const temp=new Float32Array(input.length),out=new Float32Array(input.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)temp[y*w+x]=(input[y*w+Math.max(0,x-1)]+input[y*w+x]*2+input[y*w+Math.min(w-1,x+1)])/4;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[y*w+x]=(temp[Math.max(0,y-1)*w+x]+temp[y*w+x]*2+temp[Math.min(h-1,y+1)*w+x])/4;
  return out;
}

// Fill strokes in a reduced analysis image only. Output pixels retain native
// dimensions. Separate channel surfaces remove local color casts from paper.
export function cleanupDocumentPaper(image){
  const {width,height,data}=image,scale=Math.min(1,900/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  const channels=[new Float32Array(w*h),new Float32Array(w*h),new Float32Array(w*h)];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=Math.min(width-1,Math.floor((x+.5)*width/w)),sy=Math.min(height-1,Math.floor((y+.5)*height/h)),i=(sy*width+sx)*4,p=y*w+x;
    for(let c=0;c<3;c++)channels[c][p]=data[i+c];
  }
  const radius=Math.max(3,Math.round(Math.min(w,h)*.012));
  const surfaces=channels.map(values=>{
    let surface=extrema(values,w,h,radius,true,true);
    surface=extrema(surface,w,h,radius,true,false);
    surface=extrema(surface,w,h,radius,false,true);
    surface=extrema(surface,w,h,radius,false,false);
    return smooth(surface,w,h);
  });
  // The bright paper defines fallback white balance inside broad colored marks.
  const bins=new Uint32Array(256);
  for(let p=0;p<w*h;p++)bins[Math.round(channels[0][p]*.2126+channels[1][p]*.7152+channels[2][p]*.0722)]++;
  let count=0,level=255;for(let v=0;v<256;v++){count+=bins[v];if(count>=w*h*.85){level=v;break;}}
  const paper=[0,0,0];let samples=0;
  for(let p=0;p<w*h;p++)if(channels[0][p]*.2126+channels[1][p]*.7152+channels[2][p]*.0722>=level){for(let c=0;c<3;c++)paper[c]+=channels[c][p];samples++;}
  for(let c=0;c<3;c++)paper[c]=Math.max(65,paper[c]/Math.max(1,samples));
  const out=new Uint8ClampedArray(data.length),background=[0,0,0];
  const x0s=new Int32Array(width),x1s=new Int32Array(width),fxs=new Float32Array(width);
  for(let x=0;x<width;x++){const gx=clamp((x+.5)*w/width-.5,0,w-1);x0s[x]=Math.floor(gx);x1s[x]=Math.min(w-1,x0s[x]+1);fxs[x]=gx-x0s[x];}
  const curve=Float32Array.from({length:4097},(_,i)=>255*Math.pow(Math.min(1,i/4096/0.985),1.4));
  for(let y=0;y<height;y++){
    const gy=clamp((y+.5)*h/height-.5,0,h-1),y0=Math.floor(gy),y1=Math.min(h-1,y0+1),fy=gy-y0;
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4,x0=x0s[x],x1=x1s[x],fx=fxs[x];
      for(let c=0;c<3;c++){
        const surface=surfaces[c];
        background[c]=Math.max(65,(surface[y0*w+x0]*(1-fx)+surface[y0*w+x1]*fx)*(1-fy)+(surface[y1*w+x0]*(1-fx)+surface[y1*w+x1]*fx)*fy);
      }
      const broadColor=Math.max(...background)-Math.min(...background)>45;
      for(let c=0;c<3;c++)out[i+c]=curve[clamp(Math.round(data[i+c]/(broadColor?paper[c]:background[c])*4096),0,4096)];
      out[i+3]=data[i+3];
    }
  }
  // Edge contrast darkens existing strokes. No dilation: white gaps in digits
  // and adjacent letters must stay open. Positive halos are deliberately absent.
  const sharpened=new Uint8ClampedArray(out);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=(y*width+x)*4;
    for(let c=0;c<3;c++){
      const center=out[i+c],mean=(out[i-4+c]+out[i+4+c]+out[i-width*4+c]+out[i+width*4+c])/4;
      const detail=center-mean;
      if(detail < -4)sharpened[i+c]=center+Math.max(-24,detail*.35);
    }
  }
  return {width,height,data:sharpened};
}
