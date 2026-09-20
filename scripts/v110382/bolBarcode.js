// Lazy, bounded Code 128 decoding runs locally on original pixels.
export async function decodeBolBarcode(image,region) {
  const {width,height,data}=image||{};
  if(!data||!region||!Number.isInteger(width)||!Number.isInteger(height)||data.length!==width*height*4)return null;
  const {left,top,width:w,height:h}=region;
  if(![left,top,w,h].every(Number.isInteger)||left<0||top<0||w<16||h<8||left+w>width||top+h>height||w*h>1500000)return null;
  const {Code128Reader,DecodeHintType,RGBLuminanceSource,HybridBinarizer,BinaryBitmap}=await import('@zxing/library');
  const luminance=new Uint8ClampedArray(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=((top+y)*width+left+x)*4;
    luminance[y*w+x]=(data[i]+2*data[i+1]+data[i+2])/4;
  }
  const reader=new Code128Reader();
  try{
    const result=reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance,w,h))),
      new Map([[DecodeHintType.TRY_HARDER,true]]));
    const value=result.getText();if(!/^\d{6,20}$/.test(value))return null;
    return {value,format:'CODE_128',region:{...region}};
  }catch{return null;}finally{reader.reset();}
}
export function barcodeRegionForIdentifier(region,size) {
  if(!region||!size)return null;
  const pad=Math.max(12,region.height),left=Math.max(0,region.left-pad);
  const top=Math.max(0,region.top-region.height*5);
  const right=Math.min(size.width,region.left+region.width+pad);
  return {left,top,width:right-left,height:Math.max(1,region.top+region.height-top)};
}
