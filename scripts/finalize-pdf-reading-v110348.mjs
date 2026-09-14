import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.48',BUILD='v110348-pdf-reading';
{
const path='source/src/modules/scan/pdfPageReaderV110328.js';
let source=fs.readFileSync(path,'utf8');
const before="const result=await recognizeDocumentText(input,{signal:options.signal,pageSegMode:'3',returnLayout:true,preserveSpaces:true,dpi:300,onProgress:value=>{if(!options.signal?.aborted)progress(.08+((number-1+value*.9)/pdf.numPages)*.78,`Reading PDF page ${number} of ${pdf.numPages}…`);}});";
const after="const result=await readPdfImageV110348(input,{signal:options.signal,onProgress:value=>{if(!options.signal?.aborted)progress(.08+((number-1+value*.9)/pdf.numPages)*.78,`Reading PDF page ${number} of ${pdf.numPages}…`);}},number);";
if(!source.includes(after)) {
  assert.equal(source.split(before).length-1,1,'PDF OCR call anchor');
  source=source.replace(before,after).replace("import {recognizeDocumentText} from './webOcr.js';","import {readPdfImageV110348} from './pdfImageReaderV110348.js';");
  const evidence="ocrEvidenceV110323.push({...result,id:`${number}-pdf-ocr`,page:number,sourceImageFile:input})";
  assert.equal(source.split(evidence).length-1,1,'PDF evidence anchor');
  source=source.replace(evidence,"ocrEvidenceV110323.push(...result.passes)");
  fs.writeFileSync(path,source);
}
fs.copyFileSync('scripts/v110348/pdfImageReader.js','source/src/modules/scan/pdfImageReaderV110348.js');
}
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.48 Stronger reading for scanned PDFs',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Read scanned PDF pages with paper cleanup and targeted OCR retries.','Retain separate source evidence for every page and reading pass.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=fs.readFileSync(path,'utf8');
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
const test='scripts/test-duty-graph-continuity.mjs';
const before="assert.equal(meta.version,'110.3.47');assert.equal(meta.build,'v110347-saved-reread');";
const after=`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
const source=fs.readFileSync(test,'utf8');
if(!source.includes(after)){assert.equal(source.split(before).length-1,1,'Reader release test anchor');fs.writeFileSync(test,source.replace(before,after));}
console.log('PASS — v110.3.48 PDF reading parity installed');
