// Ranking is a capture heuristic, never a claim about OCR accuracy.
export function captureRank(quality) {
  const m=quality?.metrics||{},focus=m.textTileCount>=3?m.textSharpness:m.sharpness;
  return (quality?.ready?10:0)+Math.log1p(Math.max(0,Number(focus)||0))*.55
    +Math.min(1,(Number(m.shortEdge)||0)/1800)*.25+(Number(quality?.score)||0)*.2;
}
export function sameCapturePage(a,b) {
  if(!Array.isArray(a)||a.length!==b?.length||!a.length)return false;
  let delta=0,ink=0;
  for(let i=0;i<a.length;i++){delta+=Math.abs(a[i]-b[i]);ink+=Math.max(a[i],b[i]);}
  return delta/a.length<=.035 || delta/Math.max(ink,1)<=.5;
}
export function canAutoDeliver(candidate,reference) {
  return candidate?.quality?.ready===true && candidate.detection?.found===true
    && candidate.detection.confidence>=.8 && sameCapturePage(candidate.signature,reference);
}
