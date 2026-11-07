import {scannerEngineV3} from './ScannerEngineV3.js';
import {rotateCornersClockwiseV3} from './scannerTypesV3.js';
import {captureGeometry} from './captureGeometryV1104110.js';

export async function processDocument(file,source='photo-intake',capture=null) {
  const started=performance.now();
  const session=await scannerEngineV3.prepare(file,{source,fastProcess:true});
  const geometry=captureGeometry(file,session.workingImage,capture,session.detection);
  let corners=geometry.corners;
  const edge=corners[1],first=corners[0];
  const degrees=Math.abs(Math.atan2((edge.y-first.y)*session.workingImage.height,(edge.x-first.x)*session.workingImage.width)*180/Math.PI);
  const tilt=Math.min(degrees%90,90-degrees%90);
  const result=await scannerEngineV3.finalize(session,corners,{preserveOrientation:tilt<12});
  const rotation=result.metadata.captureManifest.autoRotation||0;
  for(let i=0;i<rotation/90;i++)corners=rotateCornersClockwiseV3(corners);
  result.metadata.processingV110330={milliseconds:Math.round(performance.now()-started),singleDecode:true,singlePaperNormalization:true,thread:typeof document==='undefined'?'worker':'main'};
  result.metadata.captureManifest.cameraCapture=capture?{method:capture.method,width:capture.width,height:capture.height,stillMilliseconds:capture.stillMilliseconds,fallbackReason:capture.fallbackReason}:null;
  result.metadata.captureManifest.boundary.captureGeometry=geometry.reason;
  result.metadata.captureManifest.boundary.needsReview=geometry.review;
  return {result,corners,rotation};
}
