// Select the retained source-review page before an OCR processing derivative.
// Exact OCR pass images are handled separately; this is only the text fallback.
export function retainedReviewPageSources(analysis){
  const pageFiles=Array.isArray(analysis?.scanMeta?.pageFiles)?analysis.scanMeta.pageFiles:[];
  const assets=Array.isArray(analysis?.scanMeta?.captureAssets)?analysis.scanMeta.captureAssets:[];
  const indices=new Set(),corrected=new Map();
  for(let i=0;i<Math.min(pageFiles.length,200);i++)if(pageFiles[i] instanceof Blob)indices.add(i);
  for(const asset of assets){
    if(asset?.kind!=='perspective-corrected'||asset.pageIndex==null)continue;
    const raw=asset.pageIndex;
    const index=typeof raw==='number'?raw:typeof raw==='string'&&/^\d+$/.test(raw)?Number(raw):NaN;
    if(!Number.isInteger(index)||index<0||index>=200||!(asset.file instanceof Blob))continue;
    indices.add(index);
    if(!corrected.has(index))corrected.set(index,asset.file);
  }
  return [...indices].sort((a,b)=>a-b).map(index=>({pageNumber:index+1,file:corrected.get(index)||pageFiles[index]}));
}
