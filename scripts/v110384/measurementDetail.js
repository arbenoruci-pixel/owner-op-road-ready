import {planBolMeasurementRegions} from '../../../../packages/smart-reader-core/src/measurementRetry.js';
import {detailPixels,mapDetailRegion,detailFile} from './detailPixelsV110384.js';

export async function prepareMeasurementDetails(passes,checkCancelled,original,cache){
  const details=[];
  for(const plan of planBolMeasurementRegions(passes)){
    const pass=passes.find(p=>p.id===plan.sourcePassId);if(!pass?.sourceImageFile)continue;
    checkCancelled();const source=await detailPixels(original||pass.sourceImageFile,cache);checkCancelled();
    const region=mapDetailRegion(plan.region,pass.imageSize,source);if(!region)continue;
    const charHeight=plan.characterHeight*source.height/pass.imageSize.height;
    const file=await detailFile(source,region,'road-ready-measurement-detail.png',{scale:36/charHeight,padding:16});checkCancelled();
    details.push({...plan,region,file});
  }
  return details;
}
