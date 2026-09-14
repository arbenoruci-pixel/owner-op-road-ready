import fs from 'node:fs';
import assert from 'node:assert/strict';
export function installAngledReaderV110339(){
  const root='source/src/modules/scan/v3/';
  fs.copyFileSync('scripts/v110339/cornerOrder.js',root+'cornerOrderV110339.js');
  fs.copyFileSync('scripts/v110339/processDocument.js',root+'processDocumentV110330.js');
  const path=root+'scannerTypesV3.js';let source=fs.readFileSync(path,'utf8');
  const replacement=`export function orderCornersV3(corners = DEFAULT_CORNERS_V3) {
  const ordered = orderDocumentCorners(normalizeCornersV3(corners));
  return ordered && polygonAreaV3(ordered) >= 0.02 ? ordered : DEFAULT_CORNERS_V3.map(point => ({ ...point }));
}`;
  if(!source.includes(replacement)){
    const pattern=/export function orderCornersV3\(corners = DEFAULT_CORNERS_V3\) \{[\s\S]*?\n\}/g;
    assert.equal([...source.matchAll(pattern)].length,1,'Four-corner ordering anchor');
    source="import {orderDocumentCorners} from './cornerOrderV110339.js';\n"+source.replace(pattern,replacement);
  }
  const preserve=`export function preserveCornerOrderV3(corners = DEFAULT_CORNERS_V3) {
  const points = normalizeCornersV3(corners);
  const clockwise = points.every((a, i) => {
    const b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x) > 1e-8;
  });
  return clockwise && polygonAreaV3(points) >= .02 ? points : orderCornersV3(points);
}`;
  if(!source.includes(preserve))source+='\n'+preserve+'\n';
  source=source.replace('const [tl, tr, br, bl] = orderCornersV3(corners);','const [tl, tr, br, bl] = preserveCornerOrderV3(corners);').replace('return orderCornersV3([','return preserveCornerOrderV3([');
  fs.writeFileSync(path,source);
  function patch(path,before,after){const s=fs.readFileSync(path,'utf8');if(s.includes(after))return;assert.equal(s.split(before).length-1,1,'Angled page rotation anchor: '+path);fs.writeFileSync(path,s.replace(before,after));}
  patch(root+'ReviewScreenV3.jsx',"import { clampV3, orderCornersV3 }","import { clampV3, preserveCornerOrderV3 as orderCornersV3 }");
  patch(root+'PerspectiveEngineV10934.js','distanceV3, orderCornersV3, scannerErrorV3','distanceV3, preserveCornerOrderV3 as orderCornersV3, scannerErrorV3');
  patch(root+'ScannerEngineV3.js','  orderCornersV3,','  orderCornersV3,\n  preserveCornerOrderV3,');
  patch(root+'ScannerEngineV3.js','return orderCornersV3(Array.isArray(candidate) && candidate.length >= 4 ? candidate : fallbackCorners);','return preserveCornerOrderV3(Array.isArray(candidate) && candidate.length >= 4 ? candidate : fallbackCorners);');
  patch(root+'ScannerEngineV3.js','const corners = orderCornersV3(rotateCornersClockwiseV3(session.corners));','const corners = preserveCornerOrderV3(rotateCornersClockwiseV3(session.corners));');
  patch(root+'DocumentOrientationV10943.js','const deskew = estimateDeskew(oriented);','const deskew = options.deskew === false ? {angle:0,confidence:0} : estimateDeskew(oriented);');
  patch(root+'ScannerEngineV3.js','const straightened = options.preserveOrientation ? {image:corrected} : autoOrientDocumentV10943(corrected, {','const straightened = options.preserveOrientation ? {image:corrected} : autoOrientDocumentV10943(corrected, {\n      deskew:false,');
  const intake='source/src/modules/scan/ScanIntakeV110328.jsx';
  patch(intake,'let preview=null,result=null,corners=FULL_PAGE;','let preview=null,result=null,corners=FULL_PAGE,rotation=0;');
  patch(intake,'result=processed.result;corners=processed.corners;','result=processed.result;corners=processed.corners;rotation=processed.rotation||0;');
  patch(intake,'added.push({id:crypto.randomUUID(),file,preview,result,corners,rotation:0});','added.push({id:crypto.randomUUID(),file,preview,result,corners,rotation});');
}
