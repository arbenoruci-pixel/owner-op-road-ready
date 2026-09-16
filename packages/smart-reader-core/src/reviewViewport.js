const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const validBox=box=>box&&[box.x,box.y,box.width,box.height].every(Number.isFinite)
  &&box.x>=0&&box.y>=0&&box.width>0&&box.height>0&&box.x+box.width<=1.000001&&box.y+box.height<=1.000001;

// Coordinates belong only to the named image and observation. Related company
// rows may share a focus area, but another OCR pass must never lend its boxes.
export function reviewSourceBoxes(evidence,continuations=[]){
  if(!evidence?.sourceImageId||!validBox(evidence.box))return [];
  const boxes=[],seen=new Set();
  for(const item of [evidence,...continuations]){
    if(item.pageId!==evidence.pageId||item.observationId!==evidence.observationId||item.sourceImageId!==evidence.sourceImageId||!validBox(item.box))continue;
    const a=evidence.box,b=item.box;
    const horizontalGap=Math.max(0,a.x-b.x-b.width,b.x-a.x-a.width);
    if(Math.abs(a.y-b.y)>Math.max(a.height,b.height)*3||horizontalGap>.05)continue;
    const {x,y,width,height}=item.box,box={x,y,width:Math.min(width,1-x),height:Math.min(height,1-y)},key=JSON.stringify(box);
    if(!seen.has(key)){seen.add(key);boxes.push(box);}
  }
  return boxes;
}

export function reviewViewport({image,viewport,boxes=[],whole=false,zoom=null}){
  if(!image||!viewport||![image.width,image.height,viewport.width,viewport.height].every(n=>Number.isFinite(n)&&n>0))return null;
  const fit=Math.min(viewport.width/image.width,viewport.height/image.height),maximum=Math.max(1,Math.min(24,2/fit));
  const known=boxes.filter(validBox);
  let center={x:.5,y:.5},automatic=1;
  if(!whole&&known.length){
    const left=Math.min(...known.map(b=>b.x)),top=Math.min(...known.map(b=>b.y));
    const right=Math.max(...known.map(b=>b.x+b.width)),bottom=Math.max(...known.map(b=>b.y+b.height));
    center={x:(left+right)/2,y:(top+bottom)/2};
    const width=Math.min(1,Math.max(.18,right-left+.05)),height=Math.min(1,Math.max(.1,bottom-top+.05));
    const areaFit=Math.min(viewport.width/(width*image.width),viewport.height/(height*image.height));
    const readable=18/(Math.min(...known.map(box=>box.height))*image.height);
    automatic=Math.max(areaFit,readable)/fit;
  }
  const factor=clamp(Number.isFinite(zoom)?zoom:automatic,1,maximum),scale=fit*factor;
  const width=image.width*scale,height=image.height*scale;
  return {width,height,zoom:factor,maximum,
    left:clamp(center.x*width-viewport.width/2,0,Math.max(0,width-viewport.width)),
    top:clamp(center.y*height-viewport.height/2,0,Math.max(0,height-viewport.height))};
}
