const displacement=(a,b)=>Math.max(...a.map((p,i)=>Math.hypot(p.x-b[i].x,p.y-b[i].y)));

// Three agreeing, sharp observations span two live-analysis intervals. A single
// corner outlier does not discard every preceding stable observation.
export function updateCaptureWindow(previous,detection,quality,now) {
  if(!detection?.found||!quality?.ready||detection.confidence<.80)return {samples:[],ready:false,progress:0};
  const sample={corners:detection.corners.map(p=>({...p})),at:now};
  const samples=[...(previous?.samples||[]).filter(p=>now-p.at<=900),sample].slice(-5);
  const agreeing=samples.filter(p=>displacement(p.corners,sample.corners)<=.018);
  const span=now-(agreeing[0]?.at??now);
  const ready=agreeing.length>=3&&span>=420;
  return {samples,ready,progress:Math.min(1,agreeing.length/3,span/420)};
}
