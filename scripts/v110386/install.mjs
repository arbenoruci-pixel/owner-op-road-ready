import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui='source/src/modules/scan/OwnedReaderPreview.jsx';
function patch(before,after){const source=fs.readFileSync(ui,'utf8');if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Measurement review anchor: '+before.slice(0,70));fs.writeFileSync(ui,source.replace(before,after));}
fs.copyFileSync('scripts/v110386/MeasurementReview.jsx','source/src/modules/scan/MeasurementReviewV110386.jsx');
patch("import {clearestEvidence,clearestCandidate} from '../../../../packages/smart-reader-core/src/reviewEvidence.js';",`import {clearestEvidence,clearestCandidate} from '../../../../packages/smart-reader-core/src/reviewEvidence.js';
import MeasurementReview,{WeightUnitChoices} from './MeasurementReviewV110386.jsx';
import {confirmMeasurementGroup} from '../../../../packages/smart-reader-core/src/measurementReview.js';
import {visibleMeasurementCandidates} from '../../../../packages/smart-reader-core/src/measurementConsensus.js';`);
patch('  function download() {',`  function confirmWeights(groupId,unit,expectedSignature){
    const next=confirmMeasurementGroup(result,{documentId:result.documentId,groupId,unit,expectedSignature,expectedRevision:result.reviewRevision,userConfirmed:true});
    update(next);setError('');
  }
  function download() {`);
patch("      {group.kind==='unknown'?",`      <MeasurementReview key={result.documentId+':'+result.reviewRevision+':'+group.id} group={group} sources={sources} disabled={busy||saving} onSource={key=>openItem({groupId:group.id,key})} onConfirm={(unit,signature)=>confirmWeights(group.id,unit,signature)}/>
      {group.kind==='unknown'?`);
patch("field.candidates.filter(candidate=>candidate.issue!=='form_instructions').map((candidate,ci)","visibleMeasurementCandidates(field).filter(candidate=>candidate.issue!=='form_instructions').map((candidate,ci)");
patch('        {field.correction?<p>{field.correction.value}</p>:null}',`        {field.correction?<p>{field.correction.value}</p>:null}
        {field.numberSupport?.resolvedRawValues.length?<details><summary>Other readings</summary>{field.candidates.filter(c=>field.numberSupport.resolvedRawValues.includes(c.rawValue)).map((candidate,ci)=><div key={ci}>{sourcePages(candidate).map(e=><button type="button" key={e.pageId} onClick={()=>select(group,key,field,candidate,e)}>{candidate.rawValue} · Page {e.pageNumber}</button>)}</div>)}</details>:null}`);
patch("{selection.field?.kind==='shipping_weight'?<p>Include the unit shown on the source, such as LB or KG. Leave this item for review if the unit is missing.</p>:null}","{selection.field?.kind==='shipping_weight'?<WeightUnitChoices value={draft} onChange={value=>{setDraft(value);setError('');}} disabled={busy||saving}/>:null}");
const css='source/src/command-center.css',marker='/* MEASUREMENT_REVIEW_V110386 */';
if(!fs.readFileSync(css,'utf8').includes(marker))fs.appendFileSync(css,'\n'+marker+'\n'+fs.readFileSync('scripts/v110386/measurementReview.css','utf8'));
console.log('PASS — grouped weight review, unit choices and retained source alternatives installed');
