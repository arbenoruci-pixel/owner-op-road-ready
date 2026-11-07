import {validBoundary,FULL_FRAME} from './documentBoundaryV110329.js';

export function bindCapture(file,reading,details={}){
  return {version:1,file:{name:file.name,size:file.size,type:file.type,lastModified:file.lastModified},width:reading.width,height:reading.height,
    detection:{found:reading.detection.found,confidence:reading.detection.confidence,corners:reading.detection.corners?.map(p=>({...p}))},...details};
}

// Geometry belongs to the exact selected still/frame. Never reuse live-video
// coordinates after a changed resolution, orientation or document boundary.
export function captureGeometry(file,image,capture,detection){
  const full=reason=>({corners:FULL_FRAME.map(p=>({...p})),reason,review:true});
  if(!capture)return {corners:detection?.found&&detection.confidence>=.80&&validBoundary(detection.corners)?detection.corners:FULL_FRAME.map(p=>({...p})),reason:'detected',review:!detection?.found};
  if(capture.version!==1||!capture.file||!['name','size','type','lastModified'].every(k=>capture.file[k]===file[k]))return full('capture-file-mismatch');
  if(!(capture.width>0&&capture.height>0)||Math.abs((capture.width/capture.height)/(image.width/image.height)-1)>.02)return full('capture-orientation-mismatch');
  const saved=capture.detection;
  if(!saved?.found||saved.confidence<.80||!validBoundary(saved.corners))return full('capture-edges-uncertain');
  if(!detection?.found||detection.confidence<.80||!validBoundary(detection.corners))return full('final-edges-uncertain');
  const movement=Math.max(...saved.corners.map((p,i)=>Math.hypot(p.x-detection.corners[i].x,p.y-detection.corners[i].y)));
  if(movement>.035)return full('capture-edges-disagree');
  return {corners:saved.corners.map(p=>({...p})),reason:'selected-capture',review:false};
}
