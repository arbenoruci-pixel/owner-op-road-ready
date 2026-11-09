// Camera lifecycle guards for iOS standalone PWAs and regular browsers.
export const CAMERA_REQUEST_TIMEOUT_MS=10000;
export const CAMERA_PLAY_TIMEOUT_MS=6000;
export function preferredCameraConstraints(){
 return {audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:24,max:30}}};
}
export function preferNativeCamera(options={}){
 const nav=options.navigator??(typeof navigator==='undefined'?{}:navigator);
 const win=options.window??(typeof window==='undefined'?{}:window);
 const apple=/iPhone|iPod|iPad/i.test(nav.userAgent||'')||(nav.platform==='MacIntel'&&Number(nav.maxTouchPoints)>=2);
 const standalone=nav.standalone===true||Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);
 return apple&&standalone;
}
export function stopCameraStream(stream){try{stream?.getTracks?.().forEach(track=>{try{track.stop()}catch{}})}catch{}}
function cameraDeadline(ms,message){let id;const promise=new Promise((_,reject)=>{id=setTimeout(()=>reject(new Error(message)),ms)});return{promise,clear:()=>clearTimeout(id)}}
export async function acquireCameraStream(mediaDevices,{timeoutMs=CAMERA_REQUEST_TIMEOUT_MS,isCancelled=()=>false,constraints=preferredCameraConstraints()}={}){
 if(!mediaDevices?.getUserMedia)throw new Error('Camera unavailable. Use phone camera.');
 let timedOut=false;
 // The permission prompt may remain unanswered forever. Late grants must never
 // leave the camera running after timeout, cancellation or navigation.
 const pending=Promise.resolve().then(()=>mediaDevices.getUserMedia(constraints));
 const controlled=pending.then(stream=>{if(timedOut||isCancelled())stopCameraStream(stream);return stream});
 const deadline=cameraDeadline(timeoutMs,'Live camera did not start. Use phone camera or retry.');
 try{
  const stream=await Promise.race([controlled,deadline.promise]);
  if(isCancelled())throw new Error('Camera closed');
  return stream;
 }catch(error){
  timedOut=true;
  throw error;
 }finally{deadline.clear()}
}
export async function attachCameraPreview(video,stream,{timeoutMs=CAMERA_PLAY_TIMEOUT_MS,isCancelled=()=>false}={}){
 if(!video||!stream)throw new Error('Camera unavailable. Use phone camera.');
 video.muted=true;video.playsInline=true;video.autoplay=true;video.srcObject=stream;
 const deadline=cameraDeadline(timeoutMs,'Camera preview timed out. Use phone camera or retry.');
 let cleanup=()=>{};
 const ready=new Promise((resolve,reject)=>{
  if(video.readyState>=2&&video.videoWidth>0){resolve();return}
  const handler=()=>{if(video.readyState>=2&&video.videoWidth>0){cleanup();resolve()}};
  cleanup=()=>['loadeddata','canplay','playing','resize'].forEach(e=>video.removeEventListener?.(e,handler));
  for(const name of ['loadeddata','canplay','playing','resize'])video.addEventListener?.(name,handler);
 });
 try{
  await Promise.race([(async()=>{await Promise.resolve(video.play());await ready})(),deadline.promise]);
  if(isCancelled())throw new Error('Camera closed');
 }finally{deadline.clear();cleanup()}
}
export async function refreshCameraPreview(video,stream,options={}){
 if(!video||!stream)throw new Error('Camera unavailable');
 try{video.pause?.()}catch{}
 video.srcObject=null;
 await new Promise(resolve=>setTimeout(resolve,90));
 if(options.isCancelled?.())return;
 return attachCameraPreview(video,stream,options);
}
export function cameraMessage(error){
 const name=error?.name||'';
 if(name==='NotAllowedError'||name==='PermissionDeniedError')return 'Camera permission denied. Use phone camera or allow access in iPhone Settings.';
 if(name==='NotReadableError'||name==='AbortError')return 'Camera is busy or interrupted. Close other camera apps, then retry.';
 return error?.message||'Camera could not open. Use phone camera.';
}

