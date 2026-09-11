// Local paper illumination correction. Never synthesizes text or changes the source.
const clamp=(n,a=0,b=255)=>Math.max(a,Math.min(b,n));
export function normalizePaperV110323(image) {
  const {width:w,height:h,data}=image;
  const cell=Math.max(24,Math.round(Math.min(w,h)/30)),cols=Math.ceil(w/cell),rows=Math.ceil(h/cell);
  const paper=new Float32Array(cols*rows*3);
  for(let cy=0;cy<rows;cy++)for(let cx=0;cx<cols;cx++){
    const hist=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];let count=0;
    for(let y=cy*cell;y<Math.min(h,(cy+1)*cell);y+=2)for(let x=cx*cell;x<Math.min(w,(cx+1)*cell);x+=2){const i=(y*w+x)*4;for(let c=0;c<3;c++)hist[c][data[i+c]]++;count++;}
    for(let c=0;c<3;c++){let sum=0,p=255;for(let v=0;v<256;v++){sum+=hist[c][v];if(sum>=count*.90){p=v;break;}}paper[(cy*cols+cx)*3+c]=Math.max(38,p);}
  }
  const out=new Uint8ClampedArray(data.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const gx=clamp(x/cell-.5,0,cols-1),gy=clamp(y/cell-.5,0,rows-1),x0=Math.floor(gx),y0=Math.floor(gy),x1=Math.min(cols-1,x0+1),y1=Math.min(rows-1,y0+1),fx=gx-x0,fy=gy-y0,i=(y*w+x)*4;
    for(let c=0;c<3;c++){
      const bg=(paper[(y0*cols+x0)*3+c]*(1-fx)+paper[(y0*cols+x1)*3+c]*fx)*(1-fy)+(paper[(y1*cols+x0)*3+c]*(1-fx)+paper[(y1*cols+x1)*3+c]*fx)*fy;
      out[i+c]=248*Math.pow(clamp(data[i+c]/bg,0,1.025),1.08);
    }
    out[i+3]=data[i+3];
  }
  return {width:w,height:h,data:out};
}
export function grayscalePaperV110323(image) {
  const out=new Uint8ClampedArray(image.data.length);
  for(let i=0;i<out.length;i+=4){const v=image.data[i]*.2126+image.data[i+1]*.7152+image.data[i+2]*.0722;out[i]=out[i+1]=out[i+2]=v;out[i+3]=255;}
  return {width:image.width,height:image.height,data:out};
}
