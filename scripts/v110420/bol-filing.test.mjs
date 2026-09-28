import assert from 'node:assert/strict';
import {reviewedBolFilingMatch,buildEvidence} from '../../source/src/modules/owneros/evidenceCoreV110413.js';
import {projectReviewedCopies} from '../../source/src/modules/owneros/sourceCopiesV110419.js';
const fields={loadNo:'LOAD300',reference:'BOL55',date:'2026-09-25',origin:'Alpha, NJ',destination:'Beta, IL'};
const scan={local_id:'new-local',client_document_id:'new-client',type:'bol',load_no:'LOAD100',sha256:'a'.repeat(64),document_date:fields.date,extracted:{bolNo:'bol55',origin:'to be not'}};
const source={local_id:'old-local',client_document_id:'old-client',type:'bol',load_no:'LOAD300',sha256:'b'.repeat(64),extracted:{evidenceFactsV1:{version:1,source:'source_recovery',reviewedAt:'2026-09-27T10:00:00Z',sourceSha256:'b'.repeat(64),fields}}};
const before=JSON.stringify([scan,source]);
assert.deepEqual(reviewedBolFilingMatch(scan,[scan,source]).fields,fields);
assert.equal(projectReviewedCopies([scan,source])[0],scan,'different captures remain separate originals until review');
const model=buildEvidence({documents:[scan,source],loads:[{loadNo:'LOAD100'}],loadNo:'LOAD100',today:'2026-09-27'});
const issue=model.issues.find(r=>r.id.endsWith(':filing'));
assert.equal(issue.filingMatch.fields.loadNo,'LOAD300');
assert.match(issue.label,/BOL55/);assert.match(issue.detail,/LOAD300/);
assert.equal(model.issues.some(r=>r.label==='Source details need review'),false,'specific filing action replaces the vague source issue');
for(const edit of [
 d=>d.type='pod',d=>d.document_date='2026-09-26',d=>d.extracted.bolNo='BOL56',
  d=>d.sha256='',d=>d.content_hash='c'.repeat(64),d=>d.owner_user_id='different-owner',
 d=>d.extracted.evidenceFactsV1={version:1,source:'driver_review'},d=>d.load_no='LOAD300',
 d=>d.extracted.origin='Gamma, TX',d=>d.extracted.destination='Delta, CA',
 d=>Object.assign(d.extracted,{origin:'Gamma, TX',destination:'Delta, CA'})
]){const d=structuredClone(scan);edit(d);assert.equal(reviewedBolFilingMatch(d,[d,source]),null);}
for(const route of [{origin:'alpha NJ',destination:'  BETA, IL '},{origin:'to be not exceeding:',destination:'N/A'},{origin:'NA'}]){
 const d=structuredClone(scan);Object.assign(d.extracted,route);
 assert.equal(reviewedBolFilingMatch(d,[d,source])?.fields.loadNo,'LOAD300','compatible formatting and empty form labels do not contradict a reviewed route');
}
for(const edit of [
 d=>d.extracted.evidenceFactsV1.sourceSha256='c'.repeat(64),
 d=>d.extracted.evidenceFactsV1.source='ocr',d=>d.extracted.evidenceFactsV1.reviewedAt=null,
 d=>d.extracted.evidenceFactsV1.components=[{kind:'bol',fields}],d=>d.load_no='LOAD900',
 d=>d.type='supporting_packet',d=>d.sourceCopyConflictV110419=true,
 d=>d.extracted.evidenceFactsV1.fields.origin=''
]){const d=structuredClone(source);edit(d);assert.equal(reviewedBolFilingMatch(scan,[scan,d]),null);}
const ambiguous=structuredClone(source);ambiguous.client_document_id='third';ambiguous.load_no='LOAD900';ambiguous.extracted.evidenceFactsV1.fields.loadNo='LOAD900';
assert.equal(reviewedBolFilingMatch(scan,[scan,source,ambiguous]),null,'reused references never select one of several reviewed loads');
const routeConflict=structuredClone(source);routeConflict.client_document_id='third';routeConflict.extracted.evidenceFactsV1.fields.origin='Different, NJ';
assert.equal(reviewedBolFilingMatch(scan,[scan,source,routeConflict]),null,'different confirmed routes need their own review');
assert.equal(JSON.stringify([scan,source]),before);
console.log('PASS — re-scanned BOL suggestions, distinct originals, specific action, ambiguous reference/date/owner/source guards');
