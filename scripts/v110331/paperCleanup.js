const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const tone=Float32Array.from({length:4097},(_,i)=>252*Math.pow(i/4096,1.16));

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

// Estimate the paper surface after filling thin ink strokes, so broad fold
// shadows are corrected without thresholding or synthesizing document content.
export function cleanupDocumentPaper(image){
  const {width,height,data}=image,scale=Math.min(1,1000/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  const gray=new Float32Array(w*h),hist=new Uint32Array(256),rgb=new Uint8Array(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=Math.min(width-1,Math.floor((x+.5)/scale)),sy=Math.min(height-1,Math.floor((y+.5)/scale)),i=(sy*width+sx)*4,p=y*w+x;
    const r=data[i],g=data[i+1],b=data[i+2],v=r*.2126+g*.7152+b*.0722;gray[p]=v;hist[Math.round(v)]++;rgb[p*3]=r;rgb[p*3+1]=g;rgb[p*3+2]=b;
  }
  let count=0,paperLevel=255;for(let i=0;i<256;i++){count+=hist[i];if(count>=gray.length*.85){paperLevel=i;break;}}
  let sr=0,sg=0,sb=0,n=0;
  for(let p=0;p<gray.length;p++){const i=p*3,r=rgb[i],g=rgb[i+1],b=rgb[i+2];if(gray[p]>=paperLevel&&Math.max(r,g,b)-Math.min(r,g,b)<70){sr+=r;sg+=g;sb+=b;n++;}}
  const white=n?(sr*.2126+sg*.7152+sb*.0722)/n:paperLevel;
  const balance=n?[clamp(white/(sr/n),.82,1.22),clamp(white/(sg/n),.82,1.22),clamp(white/(sb/n),.82,1.22)]:[1,1,1];
  const radius=2;
  let surface=extrema(gray,w,h,radius,true,true);surface=extrema(surface,w,h,radius,true,false);surface=extrema(surface,w,h,radius,false,true);surface=extrema(surface,w,h,radius,false,false);surface=smooth(surface,w,h);
  const floor=Math.max(55,paperLevel*.55),out=new Uint8ClampedArray(data.length);
  const x0s=new Int32Array(width),x1s=new Int32Array(width),fxs=new Float32Array(width);
  for(let x=0;x<width;x++){const gx=clamp((x+.5)*scale-.5,0,w-1);x0s[x]=Math.floor(gx);x1s[x]=Math.min(w-1,x0s[x]+1);fxs[x]=gx-x0s[x];}
  for(let y=0;y<height;y++){
    const gy=clamp((y+.5)*scale-.5,0,h-1),y0=Math.floor(gy),y1=Math.min(h-1,y0+1),fy=gy-y0;
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4,x0=x0s[x],x1=x1s[x],fx=fxs[x];
      const bg=Math.max(floor,(surface[y0*w+x0]*(1-fx)+surface[y0*w+x1]*fx)*(1-fy)+(surface[y1*w+x0]*(1-fx)+surface[y1*w+x1]*fx)*fy);
      const r=data[i]*balance[0],g=data[i+1]*balance[1],b=data[i+2]*balance[2],v=r*.2126+g*.7152+b*.0722;
      const index=clamp(Math.round(v/bg*4096),0,4096),gain=v>0?Math.min(3.5,tone[index]/v):0;
      out[i]=r*gain;out[i+1]=g*gain;out[i+2]=b*gain;out[i+3]=data[i+3];
    }
  }
  return {width,height,data:out};
}
