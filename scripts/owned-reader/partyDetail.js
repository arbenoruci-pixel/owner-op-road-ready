import {decodeImageFileV3,imageDataToFileV3} from './v3/imageUtilsV3.js';
import {planPartyRegions} from '../../../../packages/smart-reader-core/src/partyRetry.js';

export async function preparePartyDetails(passes,checkCancelled){
  const details=[];
  for(const plan of planPartyRegions(passes)){
    const pass=passes.find(pass=>pass.id===plan.sourcePassId);
    if(!pass?.sourceImageFile)continue;
    checkCancelled();
    const source=await decodeImageFileV3(pass.sourceImageFile,{maxDimension:4000});checkCancelled();
    if(source.width!==pass.imageSize.width||source.height!==pass.imageSize.height)continue;
    const box=plan.region,data=new Uint8ClampedArray(box.width*box.height*4);
    for(let row=0;row<box.height;row++){
      const start=((box.top+row)*source.width+box.left)*4;
      data.set(source.data.subarray(start,start+box.width*4),row*box.width*4);
    }
    const file=await imageDataToFileV3({width:box.width,height:box.height,data},'road-ready-party-detail.png');checkCancelled();
    details.push({...plan,file});
  }
  return details;
}
