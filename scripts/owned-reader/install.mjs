import fs from 'node:fs';
import assert from 'node:assert/strict';
export function installOwnedReader(){
  const root='source/src/modules/scan/';
  function patch(file,before,after){
    const source=fs.readFileSync(file,'utf8');
    if(source.includes(after))return;
    assert.equal(source.split(before).length-1,1,'Owned reader installation anchor: '+file);
    fs.writeFileSync(file,source.replace(before,after));
  }
  for(const [from,to] of [['analysisAdapter.js','ownedReaderAdapter.js'],['ReaderPreview.jsx','OwnedReaderPreview.jsx']])fs.copyFileSync('scripts/owned-reader/'+from,root+to);
  patch(root+'SmartScanSheetV105.jsx',"import ScanEvidenceReviewV11036 from './ScanEvidenceReviewV11036.jsx';", "import ScanEvidenceReviewV11036 from './ScanEvidenceReviewV11036.jsx';\nimport OwnedReaderPreview from './OwnedReaderPreview.jsx';");
  patch(root+'SmartScanSheetV105.jsx','          <ScanEvidenceReviewV11036 analysis={analysis} />','          <ScanEvidenceReviewV11036 analysis={analysis} />\n          <OwnedReaderPreview analysis={analysis} />');
  patch(root+'imageReaderV110323.js','passes.push({...result,id:`${page+1}-${id}`,page:page+1});','passes.push({...result,id:`${page+1}-${id}`,page:page+1,sourceImageFile:input});');
  const css=fs.readFileSync('scripts/owned-reader/review.css','utf8');
  if(!fs.readFileSync('source/src/command-center.css','utf8').includes(css))fs.appendFileSync('source/src/command-center.css','\n'+css);
}
