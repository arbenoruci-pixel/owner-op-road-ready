import {scannerEngineV3} from './ScannerEngineV3.js';
import {validBoundary,FULL_FRAME} from './documentBoundaryV110329.js';
import {rotateCornersClockwiseV3} from './scannerTypesV3.js';

export async function processDocument(file,source='photo-intake') {
  const started=performance.now();
  const session=await scannerEngineV3.prepare(file,{source,fastProcess:true});
  let corners=session.detection?.found&&session.detection.confidence>=.80&&validBoundary(session.detection.corners)?session.detection.corners:FULL_FRAME.map(p=>({...p}));
  const edge=corners[1],first=corners[0];
  const degrees=Math.abs(Math.atan2((edge.y-first.y)*session.workingImage.height,(edge.x-first.x)*session.workingImage.width)*180/Math.PI);
  const tilt=Math.min(degrees%90,90-degrees%90);
  const result=await scannerEngineV3.finalize(session,corners,{preserveOrientation:tilt<12});
  const rotation=result.metadata.captureManifest.autoRotation||0;
  for(let i=0;i<rotation/90;i++)corners=rotateCornersClockwiseV3(corners);
  result.metadata.processingV110330={milliseconds:Math.round(performance.now()-started),singleDecode:true,singlePaperNormalization:true,thread:typeof document==='undefined'?'worker':'main'};
  return {result,corners,rotation};
}
