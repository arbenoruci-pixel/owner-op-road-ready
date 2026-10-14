// PDF.js 4.10.38 public operator numbers, pinned with pdfTextV102.js.
// https://github.com/mozilla/pdf.js/blob/v4.10.38/src/shared/util.js
// Inspection uses drawing geometry, not a claim that every image contains text.
const OPS={save:10,restore:11,transform:12,formBegin:74,formEnd:75,
  groupBegin:76,groupEnd:77,imageMask:83,image:85,inlineImage:86};
const IMAGE_OPS=new Set([82,83,84,85,86,87,88,89]);
const matrixOK=value=>value?.length===6&&Array.from(value).every(Number.isFinite);
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
  a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const unique=values=>[...new Set(values)];

export function nativePdfQualityV110363(text='') {
  const value=String(text),tokens=value.match(/[\p{L}\p{N}]+/gu)||[];
  const wordCount=tokens.filter(word=>word.length>1).length;
  const damaged=(value.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd\ue000-\uf8ff]/g)||[]).length;
  const singles=tokens.filter(word=>word.length===1).length;
  const reasons=[];
  if(wordCount<18)reasons.push('sparse-native-text');
  if(damaged>0&&damaged/Math.max(1,value.replace(/\s/g,'').length)>.01)reasons.push('damaged-native-text');
  if(tokens.length>=24&&singles/tokens.length>.5)reasons.push('fragmented-native-text');
  if(/([\p{L}\p{N}])\1{7,}/u.test(value))reasons.push('repeated-native-glyphs');
  return {wordCount,quality:!value.trim()?'empty':reasons.length?'weak':'usable',reasons};
}

function imageBounds(matrix,viewport) {
  if(!matrixOK(viewport?.transform)||!viewport.width||!viewport.height)return null;
  const t=multiply(viewport.transform,matrix);
  const points=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>({x:t[0]*x+t[2]*y+t[4],y:t[1]*x+t[3]*y+t[5]}));
  const x=Math.max(0,Math.min(...points.map(p=>p.x))/viewport.width);
  const y=Math.max(0,Math.min(...points.map(p=>p.y))/viewport.height);
  const right=Math.min(1,Math.max(...points.map(p=>p.x))/viewport.width);
  const bottom=Math.min(1,Math.max(...points.map(p=>p.y))/viewport.height);
  if(![x,y,right,bottom].every(Number.isFinite))return null;
  return {x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y)};
}

export function inspectPdfOperatorsV110363(operators,viewport) {
  const reasons=[],regions=[],fn=operators?.fnArray,args=operators?.argsArray;
  if(!fn||!args)return {status:'unavailable',rasterRegions:[],imageCount:0,reasons:['raster-inspection-unavailable']};
  let matrix=[1,0,0,1,0,0],stack=[],imageCount=0,complete=true;
  const limit=Math.min(fn.length,30000);
  if(fn.length>limit){complete=false;reasons.push('raster-inspection-capped');}
  for(let i=0;i<limit;i++) {
    const op=fn[i],value=args[i]||[];
    if(op===OPS.save||op===OPS.formBegin||op===OPS.groupBegin) {
      stack.push(matrix.slice());
      if(stack.length>256){complete=false;reasons.push('raster-inspection-capped');break;}
      const transform=op===OPS.formBegin?value[0]:op===OPS.groupBegin?value[0]?.matrix:null;
      if(transform){if(matrixOK(transform))matrix=multiply(matrix,transform);else{complete=false;reasons.push('raster-transform-unknown');}}
    } else if(op===OPS.restore||op===OPS.formEnd||op===OPS.groupEnd) {
      if(stack.length)matrix=stack.pop();else{complete=false;reasons.push('raster-transform-unknown');}
    } else if(op===OPS.transform) {
      if(matrixOK(value))matrix=multiply(matrix,value);else{complete=false;reasons.push('raster-transform-unknown');}
    } else if(IMAGE_OPS.has(op)) {
      imageCount++;
      // Repeated/grouped images carry their own transforms. Do not pretend
      // those regions were inspected when only the page matrix is available.
      if(![OPS.image,OPS.inlineImage,OPS.imageMask,82].includes(op)) {
        complete=false;reasons.push('grouped-raster-regions');continue;
      }
      const box=imageBounds(matrix,viewport);
      if(!box){complete=false;reasons.push('raster-transform-unknown');continue;}
      // A small logo is not a reason to OCR a complete native page. Wide
      // strips can hold amounts/identifiers even when their area is small.
      const possibleField=box.width*box.height>=.035||(box.width>=.22&&box.height>=.025);
      if(possibleField) {
        if(regions.length<64)regions.push({...box,reason:'possible-raster-fields'});
        else {complete=false;reasons.push('raster-regions-capped');}
      }
    }
  }
  return {status:complete?'inspected':'partial',rasterRegions:regions,imageCount,reasons:unique(reasons)};
}

export async function assessPdfCoverageV110363(page,text,viewport) {
  const native=nativePdfQualityV110363(text);
  let raster;
  try {raster=inspectPdfOperatorsV110363(await page.getOperatorList(),viewport);}
  catch {raster={status:'unavailable',rasterRegions:[],imageCount:0,reasons:['raster-inspection-unavailable']};}
  const reasons=unique([...native.reasons,...raster.reasons,...(raster.rasterRegions.length?['possible-raster-fields']:[])]);
  return {nativeWordCount:native.wordCount,nativeQuality:native.quality,
    rasterInspection:raster.status,imageCount:raster.imageCount,rasterRegions:raster.rasterRegions,
    reasons,ocrNeeded:reasons.length>0};
}
