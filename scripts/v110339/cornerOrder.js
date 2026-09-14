// Walk the four distinct vertices around their center. Independent extrema
// can select the same vertex twice on a rotated page in a portrait frame.
export function orderDocumentCorners(points){
  if(!Array.isArray(points)||points.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  if(new Set(points.map(p=>`${p.x},${p.y}`)).size!==4)return null;
  const center=points.reduce((sum,p)=>({x:sum.x+p.x/4,y:sum.y+p.y/4}),{x:0,y:0});
  const ordered=points.map(p=>({...p})).sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
  if(ordered.some((p,i)=>cross(p,ordered[(i+1)%4],ordered[(i+2)%4])<=1e-8))return null;
  const first=ordered.reduce((best,p,i)=>p.x+p.y<ordered[best].x+ordered[best].y-1e-8||Math.abs(p.x+p.y-ordered[best].x-ordered[best].y)<=1e-8&&p.y<ordered[best].y?i:best,0);
  return [...ordered.slice(first),...ordered.slice(0,first)];
}
