import fs from 'node:fs';
import assert from 'node:assert/strict';
const scan='source/src/modules/scan/';
function patch(path,before,after){
  const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,'BOL row recovery anchor: '+path+' '+before.slice(0,70));
  fs.writeFileSync(path,source.replace(before,after));
}
for(const [from,to]of [['detailPixels','detailPixelsV110384'],['identifierDetail','identifierDetailV110342'],['measurementDetail','measurementDetailV110384']])fs.copyFileSync('scripts/v110384/'+from+'.js',scan+to+'.js');
const reader=scan+'imageReaderV110323.js';
patch(reader,"import {prepareIdentifierDetail}","import {prepareMeasurementDetails} from './measurementDetailV110384.js';\nimport {prepareIdentifierDetail}");
patch(reader,'    if(shippingPage){','    const detailImages=new Map();\n    if(shippingPage){');
patch(reader,'checkCancelled(options.signal),original);','checkCancelled(options.signal),original,detailImages);');
patch(reader,'    // PARTY_DETAIL_V110357:',`    if(shippingPage)try{
      const details=await prepareMeasurementDetails(completed,()=>checkCancelled(options.signal),original,detailImages);
      for(const [index,detail]of details.entries())await read(detail.file,'measurement-detail-'+(index+1),'7',{scope:'region',thresholdingMethod:'0',sourcePassId:detail.sourcePassId,region:detail.region,fieldLabel:detail.field});
    }catch(error){checkCancelled(options.signal);failures.push({page:page+1,pass:'measurement-detail',code:'detail_unavailable'});}
    detailImages.clear();
    // PARTY_DETAIL_V110357:`);
for(const browser of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs'])fs.writeFileSync(browser,fs.readFileSync(browser,'utf8').replaceAll("'0.3.20'","'0.3.21'"));
console.log('PASS — BOL row recovery, PNG detail proof and bounded barcode fallback installed');
