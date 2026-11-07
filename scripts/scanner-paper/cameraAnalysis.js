import {detectDocumentEdgesV3} from './EdgeDetectorV3.js';
import {assessDocumentQuality} from './DocumentQualityV11036.js';
import {paperSignature} from './pageTransitionV110333.js';

export function analyzeCameraFrame(pixels,width,height){
  const detection=detectDocumentEdgesV3(pixels,{maxSide:640});
  const quality=assessDocumentQuality(pixels,{corners:detection.corners,live:true,detectionFound:detection.found,detectionConfidence:detection.confidence,nativeWidth:width,nativeHeight:height});
  return {detection,quality,signature:detection.found&&detection.confidence>=.8?paperSignature(pixels,detection.corners):null,width,height};
}
