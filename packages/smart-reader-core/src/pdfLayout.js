// PDF.js item coordinates are mapped through the very viewport used to render
// the review image. Split wide column gaps without manufacturing text or boxes.
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const bounds=items=>{
  const left=Math.min(...items.map(i=>i.left)),top=Math.min(...items.map(i=>i.top));
  return {text:items.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim(),left,top,
    width:Math.max(...items.map(i=>i.left+i.width))-left,
    height:Math.max(...items.map(i=>i.top+i.height))-top,confidence:100};
};

export function nativePdfLayout(content,viewport){
  if(!Array.isArray(viewport?.transform)||!viewport.transform.every(Number.isFinite))return [];
  const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height),scale=Math.hypot(viewport.transform[0],viewport.transform[1]);
  if(!width||!height||!scale)return [];
  const items=[];
  for(const item of content?.items||[]){
    if(typeof item.str!=='string'||!item.str.trim())continue;
    if(!Array.isArray(item.transform)||item.transform.length!==6||!item.transform.every(Number.isFinite))return [];
    const t=multiply(viewport.transform,item.transform),fontHeight=Math.hypot(t[2],t[3]),angle=Math.atan2(t[1],t[0]);
    // Preserve the ordinary text observation for unsupported writing directions.
    if(Math.abs(angle)>.01||content.styles?.[item.fontName]?.vertical)return [];
    const ascent=content.styles?.[item.fontName]?.ascent;
    const left=t[4],top=t[5]-fontHeight*(Number.isFinite(ascent)?ascent:.85);
    const right=left+item.width*scale,bottom=top+fontHeight;
    if(![left,top,right,bottom].every(Number.isFinite)||right<=left||bottom<=top)return [];
    if(left<-.5||top<-.5||right>width+.5||bottom>height+.5)return [];
    items.push({text:item.str.trim(),left:Math.max(0,left),top:Math.max(0,top),
      width:Math.min(width,right)-Math.max(0,left),height:Math.min(height,bottom)-Math.max(0,top),baseline:t[5]});
  }
  if(items.length>10000)return [];
  const rows=[];
  for(const item of items.sort((a,b)=>a.baseline-b.baseline||a.left-b.left)){
    const row=rows.at(-1);
    if(row&&Math.abs(row[0].baseline-item.baseline)<=Math.min(row[0].height,item.height)*.35)row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap(row=>{
    row.sort((a,b)=>a.left-b.left);
    const segments=[[]];
    for(const item of row){
      const segment=segments.at(-1),previous=segment.at(-1),gap=previous?item.left-previous.left-previous.width:0;
      const prefix=segment.map(i=>i.text).join(' '),marker=/^(?:PICK(?:\s*UP)?|STOP|DROP|DELIVERY)\s*$/i.test(prefix)&&/^\d+$/.test(item.text);
      if(previous&&gap>Math.max(4,Math.min(item.height,previous.height)*(marker?3:.85)))segments.push([]);
      segments.at(-1).push(item);
    }
    return segments.map(bounds);
  });
}
