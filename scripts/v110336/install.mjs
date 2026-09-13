import fs from 'node:fs';
import assert from 'node:assert/strict';
export function installPhoneReaderV110336(){
  const scan='source/src/modules/scan/';
  for(const [from,to] of [
    ['scripts/v110334/CameraAdapterV3.jsx','v3/CameraAdapterV3.jsx'],
    ['scripts/v110333/pageTransition.js','v3/pageTransitionV110333.js'],
    ['packages/smart-reader-core/src/fieldGuards.js','documentFieldGuardsV110336.js'],
    ['scripts/owned-reader/ReaderPreview.jsx','OwnedReaderPreview.jsx'],
  ])fs.copyFileSync(from,scan+to);
  const path=scan+'engines/isolatedDocumentRouterV10959.js';
  let source=fs.readFileSync(path,'utf8');
  if(source.includes('guardDocumentReading(applyDocumentIdentity('))return;
  const before='return applyDocumentIdentity(qualified,identity,truckDocumentTypeMetaV1040,(analysis,type,context)=>qualifyDocumentFieldsV11038(reanalyzeGenericTruckDocumentTypeV1040(analysis,type,context)),options);';
  const after='return guardDocumentReading(applyDocumentIdentity(qualified,identity,truckDocumentTypeMetaV1040,(analysis,type,context)=>qualifyDocumentFieldsV11038(reanalyzeGenericTruckDocumentTypeV1040(analysis,type,context)),options));';
  assert.equal(source.split(before).length-1,1,'Phone reader guard anchor');
  source="import {guardDocumentReading} from '../documentFieldGuardsV110336.js';\n"+source.replace(before,after);
  fs.writeFileSync(path,source);
}
