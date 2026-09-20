import {decodeImageFileV3} from './v3/imageUtilsV3.js';

export async function detailPixels(file,cache){
  if(!cache)return decodeImageFileV3(file,{maxDimension:4000});
  if(!cache.has(file))cache.set(file,decodeImageFileV3(file,{maxDimension:4000}));
  return cache.get(file);
}
export function mapDetailRegion(region,from,to){
  const sx=to.width/from.width,sy=to.height/from.height;
  if(Math.abs(sx/sy-1)>.005)return null;
  const left=Math.max(0,Math.floor(region.left*sx)),top=Math.max(0,Math.floor(region.top*sy));
  return {left,top,width:Math.min(to.width-left,Math.ceil(region.width*sx)),height:Math.min(to.height-top,Math.ceil(region.height*sy))};
}
// PNG avoids another JPEG compression of small digits. Upscaling and a white
// margin change only presentation; evidence names this exact derivative image.
export async function detailFile(source,box,name,{scale=1,padding=0}={}){
  scale=Math.max(1,Math.min(3,scale,3200/box.width));
  const pixels=new Uint8ClampedArray(box.width*box.height*4);
  for(let y=0;y<box.height;y++){
    const start=((box.top+y)*source.width+box.left)*4;
    pixels.set(source.data.subarray(start,start+box.width*4),y*box.width*4);
  }
  const input=document.createElement('canvas');input.width=box.width;input.height=box.height;
  input.getContext('2d').putImageData(new ImageData(pixels,box.width,box.height),0,0);
  const canvas=document.createElement('canvas');canvas.width=Math.round(box.width*scale)+padding*2;canvas.height=Math.round(box.height*scale)+padding*2;
  const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(input,padding,padding,canvas.width-padding*2,canvas.height-padding*2);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Detail image unavailable');
  return new File([blob],name,{type:'image/png',lastModified:Date.now()});
}
