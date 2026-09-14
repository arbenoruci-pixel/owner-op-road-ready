import fs from 'node:fs';
import assert from 'node:assert/strict';
export function installReaderLayoutV110337(){
  const root='source/src/modules/scan/';
  fs.copyFileSync('scripts/owned-reader/layoutGuard.js',root+'documentLayoutGuardV110337.js');
  const path=root+'engines/isolatedDocumentRouterV10959.js';
  let source=fs.readFileSync(path,'utf8');
  const before='return guardDocumentReading(applyDocumentIdentity(qualified,identity,truckDocumentTypeMetaV1040,(analysis,type,context)=>qualifyDocumentFieldsV11038(reanalyzeGenericTruckDocumentTypeV1040(analysis,type,context)),options));';
  const after='return guardOcrLayoutReading(guardDocumentReading(applyDocumentIdentity(qualified,identity,truckDocumentTypeMetaV1040,(analysis,type,context)=>qualifyDocumentFieldsV11038(reanalyzeGenericTruckDocumentTypeV1040(analysis,type,context)),options)));';
  if(!source.includes(after)){
    assert.equal(source.split(before).length-1,1,'Reader layout guard anchor');
    source="import {guardOcrLayoutReading} from '../documentLayoutGuardV110337.js';\n"+source.replace(before,after);
  }
  const manualBefore='return qualifyDocumentFieldsV11038(reanalyzeTruckDocumentTypeIsolatedBaseV11038(analysis,typeId,context));';
  const manualAfter='return guardOcrLayoutReading(guardDocumentReading(qualifyDocumentFieldsV11038(reanalyzeTruckDocumentTypeIsolatedBaseV11038(analysis,typeId,context))));';
  if(!source.includes(manualAfter)){
    assert.equal(source.split(manualBefore).length-1,1,'Reader manual type guard anchor');
    source=source.replace(manualBefore,manualAfter);
  }
  fs.writeFileSync(path,source);
  // The review screen qualifies fields again after routing. Guard the final
  // result here too, otherwise the old flattened parser restores its guesses.
  const reviewPath=root+'DocumentEvidenceV11036.js';
  let review=fs.readFileSync(reviewPath,'utf8');
  const reviewBefore='export function qualifyScanResultV11036(result={},state={}){';
  const reviewAfter='function qualifyScanResultBaseV110337(result={},state={}){';
  if(!review.includes(reviewAfter)){
    assert.equal(review.split(reviewBefore).length-1,1,'Reader final review guard anchor');
    review="import {guardOcrLayoutReading} from './documentLayoutGuardV110337.js';\nimport {guardDocumentReading} from './documentFieldGuardsV110336.js';\n"+review.replace(reviewBefore,reviewAfter);
    review+='\nexport function qualifyScanResultV11036(result={},state={}){return guardOcrLayoutReading(guardDocumentReading(qualifyScanResultBaseV110337(result,state)));}\n';
    fs.writeFileSync(reviewPath,review);
  }
}
