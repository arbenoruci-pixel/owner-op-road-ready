import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.63',BUILD='v110363-native-pdf-evidence';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Release anchor '+path);fs.writeFileSync(path,source.replace(before,after));}
const pdfPath='source/src/modules/scan/pdfPageReaderV110328.js';
patch(pdfPath,"import {readPdfImageV110348} from './pdfImageReaderV110348.js';","import {readPdfImageV110348} from './pdfImageReaderV110348.js';\nimport {nativePdfLayout} from '../../../../packages/smart-reader-core/src/pdfLayout.js';");
patch(pdfPath,"let page,canvas,text='',method='native',confidence=1;","let page,canvas,nativeContent,nativeViewport,text='',method='native',confidence=1;");
patch(pdfPath,"text=readText(content?.items||[]);","text=readText(content?.items||[]);nativeContent=content;");
{
  let value=read(pdfPath);
  const marker="canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);";
  if(!value.includes('nativeViewport=viewport;')){
    assert.equal(value.split(marker).length-1,2,'Native viewport render anchors');
    value=value.replaceAll(marker,'nativeViewport=viewport;'+marker);fs.writeFileSync(pdfPath,value);
  }
}
patch(pdfPath,"ocrEvidenceV110323.push({id:`${number}-pdf-native`,page:number,text,confidence:1,source:'pdf-text-layer',sourceImageFile:pageFiles[number-1]});", "ocrEvidenceV110323.push({id:`${number}-pdf-native`,page:number,text,confidence:1,source:'pdf-text-layer',sourceImageFile:pageFiles[number-1]});\n        const lines=nativePdfLayout(nativeContent,nativeViewport);\n        if(lines.length)ocrEvidenceV110323.push({id:`${number}-pdf-native-layout`,page:number,text:lines.map(line=>line.text).join('\\n'),lines,confidence:1,source:'pdf-text-layer',sourceImageFile:pageFiles[number-1]});");

for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.63 Native PDF evidence',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Keep native PDF coordinates for accurate field highlighting.','Recover vertical carrier labels and billing company candidates.','Resolve short years only from the matching signing certificate.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=read(path);
  for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){
    const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');
    assert.equal([...value.matchAll(pattern)].length,1,'Unique release marker '+path+' '+key);
    value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.62');assert.equal(meta.build,'v110362-rate-stop-fields');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
patch('scripts/test-editor-grips-v110355.mjs',"assert.equal(meta.version,'110.3.62'); assert.equal(meta.build,'v110362-rate-stop-fields');",`assert.equal(meta.version,'${VERSION}'); assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — 110.3.63 native PDF evidence installed');
