import fs from 'node:fs';
import assert from 'node:assert/strict';
export function installWordReaderV110342(){
  const root='source/src/modules/scan/';
  for(const [from,to] of [['scripts/v11036/webOcr.js','webOcr.js'],['scripts/owned-reader/analysisAdapter.js','ownedReaderAdapter.js'],['scripts/owned-reader/identifierDetail.js','identifierDetailV110342.js']])fs.copyFileSync(from,root+to);
  const path=root+'imageReaderV110323.js';let source=fs.readFileSync(path,'utf8');
  if(source.includes('prepareIdentifierDetail'))return;
  function replace(before,after){assert.equal(source.split(before).length-1,1,'Word reader anchor: '+before);source=source.replace(before,after);}
  source="import {needsReadingRetry,hasReadableBolReference} from '../../../../packages/smart-reader-core/src/ocrRetry.js';\nimport {prepareIdentifierDetail} from './identifierDetailV110342.js';\n"+source;
  replace('async function read(input,id,mode){','async function read(input,id,mode,extra={}){');
  replace('returnLayout:true,preserveSpaces:true,dpi:300,onProgress:', 'returnLayout:true,preserveSpaces:true,dpi:300,thresholdingMethod:extra.thresholdingMethod,onProgress:');
  replace('(page+(pass+Math.min(1,p))/3)','(page+(pass+Math.min(1,p))/4)');
  replace('sourceImageFile:input});return result;',"sourceImageFile:input,...extra});return result;");
  replace("if(shipping||!first||first.confidence<.88)await read(clean,'table-labels','11');", "if(shipping||!first||first.confidence<.88||needsReadingRetry(first?[first]:[]))await read(clean,'table-labels','11',{thresholdingMethod:'2'});");
  replace("if(!first||first.confidence<.78||disputed||shipping&&!pagePasses.some", "if(!first||first.confidence<.78||disputed||needsReadingRetry(pagePasses)||shipping&&!pagePasses.some");
  const end="await read(original,'source-page','11');";
  replace(end,end+`\n    const completed=passes.filter(p=>p.page===page+1);
    const shippingPage=shipping||completed.some(p=>/bill\\s+of\\s+lading|ship\\s*(?:from|to)|consignee|consigned|\\bBOL\\b/i.test(p.text));
    if(shippingPage&&!hasReadableBolReference(completed)){
      try{
        const detail=await prepareIdentifierDetail(completed,()=>checkCancelled(options.signal));
        if(detail)await read(detail.file,'identifier-detail','7',{scope:'region',thresholdingMethod:'2',sourcePassId:detail.sourcePassId,region:detail.region});
      }catch(error){checkCancelled(options.signal);failures.push({page:page+1,pass:'identifier-detail',code:'detail_unavailable'});}
    }`);
  replace("passes.filter(p=>p.page===i+1).sort", "passes.filter(p=>p.page===i+1&&p.scope!=='region').sort");
  replace('(a,b)=>b.confidence-a.confidence||b.text.length-a.text.length','(a,b)=>Number(needsReadingRetry([a]))-Number(needsReadingRetry([b]))||b.confidence-a.confidence||b.text.length-a.text.length');
  fs.writeFileSync(path,source);
}
