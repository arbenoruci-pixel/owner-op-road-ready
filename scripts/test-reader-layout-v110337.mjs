import assert from 'node:assert/strict';
import {guardOcrLayoutReading} from '../source/src/modules/scan/documentLayoutGuardV110337.js';
import {finalizeSmartScanAnalysisV11039,reanalyzeTruckDocumentTypeIsolatedV10959} from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
import {shippingLayoutInput} from '../packages/smart-reader-core/test/shipping-layout-fixture.mjs';
import {qualifyScanResultV11036} from '../source/src/modules/scan/DocumentEvidenceV11036.js';
const observations=shippingLayoutInput().pages[0].observations;
const passes=observations.map(o=>({id:o.id,page:1,text:o.lines.map(l=>l.text).join('\n'),lines:o.lines.map(l=>({text:l.text,left:l.box.x*1000,top:l.box.y*1000,width:l.box.width*1000,height:l.box.height*1000,confidence:l.confidence*100}))}));
const fields={shipper:'garbled barcode',consignee:'bad carrier fragment',trailerNo:'1200',carrierName:'Ngme',destination:'Example City, IL'};
const input={type:{id:'bol'},text:passes[0].text,ocrEvidenceV110323:passes,fields,
  fieldEvidence:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{value}])),
  evidenceReviewV11036:{evidence:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{value}]))}};
const snapshot=JSON.stringify(input),result=guardOcrLayoutReading(input);
for(const key of ['shipper','consignee','trailerNo','carrierName']){
  assert.equal(result.fields[key],'');assert.equal(result.fieldEvidence[key],undefined);assert.equal(result.evidenceReviewV11036.evidence[key],undefined);
}
assert.equal(result.fields.destination,fields.destination);assert.equal(JSON.stringify(input),snapshot);
const routed=finalizeSmartScanAnalysisV11039(input);
for(const key of ['shipper','consignee','trailerNo','carrierName'])assert.ok(!routed.fields[key],key+' must stay unverified in the actual router');
const manual=reanalyzeTruckDocumentTypeIsolatedV10959(input,'bol',{});
for(const key of ['shipper','consignee','trailerNo','carrierName'])assert.ok(!manual.fields[key],key+' must stay unverified after a manual type change');
for(const routedResult of [routed,manual]){
  const shown=qualifyScanResultV11036(routedResult,{});
  for(const key of ['shipper','consignee','trailerNo','carrierName']){
    assert.ok(!shown.fields[key],key+' must stay unverified in final screen qualification');
    assert.equal(shown.evidenceReviewV11036.evidence[key],undefined);
  }
  assert.ok(shown.layoutGuardV110337.removedFields.includes('trailerNo'));
}
const inline={type:{id:'bol'},fields:{shipper:'3M',trailerNo:'T-5678'},ocrEvidenceV110323:[{lines:[{text:'Ship From: 3M',confidence:95},{text:'Trailer #: T-5678',confidence:95}]}]};
assert.equal(guardOcrLayoutReading(inline),inline,'clear inline labeled readings survive');
const weak=structuredClone(inline);weak.ocrEvidenceV110323[0].lines[1].confidence=35;
assert.equal(guardOcrLayoutReading(weak).fields.trailerNo,'');
const conflict=structuredClone(inline);conflict.ocrEvidenceV110323.push({lines:[{text:'Trailer #: T-5679',confidence:95}]});
assert.equal(guardOcrLayoutReading(conflict).fields.trailerNo,'');
assert.equal(guardOcrLayoutReading({fields:{shipper:'3M'}}).fields.shipper,'3M');
console.log('PASS — real router rejects cross-column parties and address-as-trailer readings');
