import assert from 'node:assert/strict';
import fs from 'node:fs';
import {shortFormInput,damagedUnitInput} from '../packages/smart-reader-core/test/bol-form-fixture.mjs';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {resolveEvidence} from '../packages/smart-reader-core/src/index.js';
import {scanWithSourceFields} from '../packages/smart-reader-core/src/scanFields.js';
import {compactRateConSaveFieldsV10964} from '../source/src/modules/scan/rateConSaveStabilityV10964.js';
import {documentFieldRowsV11038} from '../source/src/modules/scan/documentFieldSemanticsV11038.js';

for(const input of [shortFormInput(),damagedUnitInput()]){
  const dimensions={},passes=input.pages[0].observations.map(o=>{
    const imageSize={width:1500,height:2000};dimensions[`page-1:${o.id}`]=imageSize;
    return {id:o.id,page:1,imageSize,confidence:.96,text:o.lines.map(l=>l.text).join('\n'),
      lines:o.lines.map(l=>({text:l.text,confidence:l.confidence*100,left:l.box.x*1500,top:l.box.y*2000,width:l.box.width*1500,height:l.box.height*2000}))};
  });
  const analysis={type:{id:'bol'},pageCount:1,text:passes[0].text,ocrEvidenceV110323:passes,fields:{carrierName:'Ngme:',weight:'WRONG'},routing:{autoFile:false}};
  const before=JSON.stringify(analysis),result=reviewScanAnalysis(analysis,{documentId:input.documentId,dimensions}),doc=result.documents[0];
  assert.equal(result.engineVersion,'0.3.28');assert.equal(doc.kind,'bol');assert.equal(doc.canAutoFile,false);
  const shown=scanWithSourceFields(analysis,{analysis,result},'bol'),saved=compactRateConSaveFieldsV10964(shown.fields),rows=documentFieldRowsV11038(shown);
  assert.equal(saved.weight,input.documentId==='short-form-fixture'?'20188 LB':'2377.44 LB');
  assert.equal(rows.find(row=>row.key==='weight').value,saved.weight);
  if(input.documentId==='damaged-unit-fixture'){
    assert.equal(saved.carrierName,undefined);assert.equal(saved.bolNo,undefined);assert.equal(saved.totalUnits,'4');
    assert.equal(saved.totalPieces,undefined);assert.equal(rows.find(row=>row.key==='totalUnits').label,'Total units');
    assert.ok(doc.fields.bolNumber.issues.includes('identifier_fragments'));
  }else assert.equal(saved.carrierName,'SUPPLY CHAIN SOLUTIO');
  for(const field of Object.values(doc.fields))for(const c of field.candidates)for(const e of [...c.evidence,...(c.labelEvidence||[]),...(c.continuationEvidence||[])])resolveEvidence(result,e);
  assert.equal(JSON.stringify(analysis),before);
}
const preview=fs.readFileSync('source/src/modules/scan/OwnedReaderPreview.jsx','utf8');
assert.ok(preview.includes("continuationKind==='weight_unit'?'Weight unit:'"));
const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
assert.equal(meta.version,'110.3.94');assert.equal(meta.build,'v110394-bol-form-reading');
console.log('PASS — short-form and damaged-unit adapter, displayed/saved weights and units, reference conflict and exact sources');
