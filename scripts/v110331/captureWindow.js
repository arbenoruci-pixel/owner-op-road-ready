const displacement=(a,b)=>Math.max(...a.map((p,i)=>Math.hypot(p.x-b[i].x,p.y-b[i].y)));

// Keep 900 ms of slack beyond two 450 ms live-analysis intervals for worker
// latency and browser timer jitter. Older evidence still expires after a pause.
export const LIVE_ANALYSIS_INTERVAL_MS=450;
export const CAPTURE_WINDOW_MS=1800;
// Three agreeing, sharp observations span two live-analysis intervals. A single
// corner outlier does not discard every preceding stable observation.
export function updateCaptureWindow(previous,detection,quality,now) {
  if(!detection?.found||!quality?.ready||detection.confidence<.80)return {samples:[],ready:false,progress:0};
  const sample={corners:detection.corners.map(p=>({...p})),at:now};
  const samples=[...(previous?.samples||[]).filter(p=>now-p.at<=CAPTURE_WINDOW_MS),sample].slice(-5);
  const agreeing=samples.filter(p=>displacement(p.corners,sample.corners)<=.018);
  const span=now-(agreeing[0]?.at??now);
  const ready=agreeing.length>=3&&span>=420;
  return {samples,ready,progress:Math.min(1,agreeing.length/3,span/420)};
}
