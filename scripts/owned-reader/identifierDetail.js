import {decodeImageFileV3,imageDataToFileV3} from './v3/imageUtilsV3.js';
import {planBolIdentifierRegion} from '../../../../packages/smart-reader-core/src/ocrRetry.js';

export async function prepareIdentifierDetail(passes,checkCancelled){
  for(const pass of passes){
    if(!pass.words?.some(w=>/^(?:BOL|B\/?L|BAL)(?:[.:;]|NO\b|$)/i.test(w.text||''))||!pass.sourceImageFile||!pass.imageSize||Math.max(pass.imageSize.width,pass.imageSize.height)>4000)continue;
    checkCancelled();
    const source=await decodeImageFileV3(pass.sourceImageFile,{maxDimension:4000});checkCancelled();
    if(source.width!==pass.imageSize.width||source.height!==pass.imageSize.height)continue;
    const box=planBolIdentifierRegion(pass.words,source);
    if(!box)continue;
    const data=new Uint8ClampedArray(box.width*box.height*4);
    for(let row=0;row<box.height;row++){
      const start=((box.top+row)*source.width+box.left)*4;
      data.set(source.data.subarray(start,start+box.width*4),row*box.width*4);
    }
    const file=await imageDataToFileV3({width:box.width,height:box.height,data},'road-ready-identifier-detail.png');checkCancelled();
    return {file,sourcePassId:pass.id,region:box};
  }
  return null;
}
