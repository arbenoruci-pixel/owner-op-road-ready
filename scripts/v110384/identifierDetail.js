import {planBolIdentifierRegion} from '../../../../packages/smart-reader-core/src/ocrRetry.js';
import {barcodeRegionForIdentifier,decodeBolBarcode} from './bolBarcodeV110382.js';
import {detailPixels,mapDetailRegion,detailFile} from './detailPixelsV110384.js';

export function expandedBarcodeRegion(region,size){
  const pad=Math.max(12,region.height*2,Math.round(size.width*.065));
  const left=Math.max(0,region.left-pad),top=Math.max(0,region.top-Math.max(region.height*5,Math.round(size.height*.08)));
  const right=Math.min(size.width,region.left+region.width+pad),bottom=Math.min(size.height,region.top+region.height);
  return {left,top,width:right-left,height:bottom-top};
}
export async function prepareIdentifierDetail(passes,checkCancelled,original,cache){
  let first=null;
  const searched=new Set();
  for(const pass of passes.filter(p=>p.scope!=='region').slice(0,3)){
    if(!pass.words?.length||!pass.sourceImageFile||!pass.imageSize)continue;
    const planned=planBolIdentifierRegion(pass.words,pass.imageSize);if(!planned)continue;
    checkCancelled();const source=await detailPixels(original||pass.sourceImageFile,cache);checkCancelled();
    const region=mapDetailRegion(planned,pass.imageSize,source);if(!region)continue;
    if(!first){
      const file=await detailFile(source,region,'road-ready-identifier-detail.png',{scale:Math.min(3,48/region.height),padding:16});checkCancelled();
      first={file,sourcePassId:pass.id,region,barcode:null,barcodeFile:null};
    }
    // The narrow text label can be shorter than its barcode. A single wider
    // adjacent window recovers quiet zones without scanning the entire page.
    for(const search of [barcodeRegionForIdentifier(region,source),expandedBarcodeRegion(region,source)]){
      const key=JSON.stringify(search);if(searched.has(key))continue;searched.add(key);
      const barcode=await decodeBolBarcode(source,search);checkCancelled();
      if(!barcode)continue;
      const barcodeFile=await detailFile(source,barcode.region,'road-ready-bol-barcode.png');checkCancelled();
      return {...first,barcode,barcodeFile};
    }
  }
  return first;
}
