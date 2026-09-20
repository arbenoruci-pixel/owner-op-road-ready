import {decodeImageFileV3,imageDataToFileV3} from './v3/imageUtilsV3.js';
import {planBolIdentifierRegion} from '../../../../packages/smart-reader-core/src/ocrRetry.js';
import {barcodeRegionForIdentifier,decodeBolBarcode} from './bolBarcodeV110382.js';
function crop(source,box) {
  const data=new Uint8ClampedArray(box.width*box.height*4);
  for(let row=0;row<box.height;row++){
    const start=((box.top+row)*source.width+box.left)*4;
    data.set(source.data.subarray(start,start+box.width*4),row*box.width*4);
  }
  return {width:box.width,height:box.height,data};
}
export async function prepareIdentifierDetail(passes,checkCancelled,original){
  // Caller supplies the same unenhanced corrected page used for clean OCR.
  // Map only its resize; independent photos and crops cannot share coordinates.
  for(const pass of passes.filter(p=>p.scope!=='region')){
    if(!pass.words?.length||!pass.sourceImageFile||!pass.imageSize)continue;
    const planned=planBolIdentifierRegion(pass.words,pass.imageSize);if(!planned)continue;
    checkCancelled();
    const file=original||pass.sourceImageFile;
    const source=await decodeImageFileV3(file,{maxDimension:4000});checkCancelled();
    const sx=source.width/pass.imageSize.width,sy=source.height/pass.imageSize.height;
    if(Math.abs(sx/sy-1)>.005)continue;
    const left=Math.max(0,Math.floor(planned.left*sx)),top=Math.max(0,Math.floor(planned.top*sy));
    const box={left,top,width:Math.min(source.width-left,Math.ceil(planned.width*sx)),height:Math.min(source.height-top,Math.ceil(planned.height*sy))};
    const detail=await imageDataToFileV3(crop(source,box),'road-ready-identifier-detail.png');checkCancelled();
    const barcode=await decodeBolBarcode(source,barcodeRegionForIdentifier(box,source));checkCancelled();
    // This proof image contains exactly the decoder's pixels, even after resize.
    const barcodeFile=barcode?await imageDataToFileV3(crop(source,barcode.region),'road-ready-bol-barcode.png'):null;checkCancelled();
    return {file:detail,sourcePassId:pass.id,region:box,barcode,barcodeFile};
  }
  return null;
}
