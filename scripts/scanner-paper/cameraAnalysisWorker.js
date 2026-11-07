import {analyzeCameraFrame} from './cameraAnalysisV1104110.js';
self.onmessage=({data})=>{
  try{self.postMessage({ok:true,value:analyzeCameraFrame(data.pixels,data.width,data.height)});}
  catch(error){self.postMessage({ok:false,error:error?.message||'Camera analysis failed'});}
};
