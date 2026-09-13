import {scannerEngineV3} from './ScannerEngineV3.js';
import {validBoundary,FULL_FRAME} from './documentBoundaryV110329.js';

export async function processDocument(file,source='photo-intake') {
  const started=performance.now();
  const session=await scannerEngineV3.prepare(file,{source,fastProcess:true});
  const corners=session.detection?.found&&session.detection.confidence>=.80&&validBoundary(session.detection.corners)?session.detection.corners:FULL_FRAME.map(p=>({...p}));
  const result=await scannerEngineV3.finalize(session,corners,{preserveOrientation:true});
  result.metadata.processingV110330={milliseconds:Math.round(performance.now()-started),singleDecode:true,singlePaperNormalization:true,thread:typeof document==='undefined'?'worker':'main'};
  return {result,corners};
}
