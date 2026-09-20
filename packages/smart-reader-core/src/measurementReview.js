import {reconcileBolMeasurements} from './measurementConsensus.js';
import {validateBolWeights} from './bolMeasurements.js';
import {clearestCandidate} from './reviewEvidence.js';
import {confirmField} from './review.js';

const keys=['netWeight','tareWeight','weight'];
export function measurementReviewProposal(group){
  if(group?.kind!=='bol')return null;
  // Saved 0.3.22 readings contain the same exact evidence and can use this
  // review without another OCR pass or loss of existing confirmations.
  const fields=reconcileBolMeasurements(group.fields);
  if(validateBolWeights(fields)[0].status!=='passed')return null;
  if(keys.some(key=>!fields[key]?.numberSupport||fields[key].correction
    ||fields[key].issues.length!==1||fields[key].issues[0]!=='weight_unit_required'
    ||fields[key].numberSupport.unit!==null))return null;
  const entries=keys.map(key=>{
    const field=fields[key],choice=clearestCandidate(field.candidates.filter(c=>c.numericValue!=null));
    return {key,label:field.label,numericValue:field.numberSupport.numericValue,evidence:choice.evidence,
      expectedRawValues:field.candidates.map(c=>c.rawValue)};
  });
  if(!entries.every(entry=>entry.evidence.pageId===entries[0].evidence.pageId))return null;
  return {entries,signature:JSON.stringify(entries)};
}

export function confirmMeasurementGroup(result,{documentId,groupId,unit,expectedRevision,expectedSignature,userConfirmed}){
  if(userConfirmed!==true||documentId!==result.documentId||expectedRevision!==result.reviewRevision)throw new Error('The reading changed. Open the weights again.');
  if(!['LB','KG'].includes(unit))throw new Error('Choose LB or KG for these three weights.');
  const group=result.documents.find(g=>g.id===groupId),proposal=measurementReviewProposal(group);
  if(!proposal||proposal.signature!==expectedSignature)throw new Error('The weights changed. Review their sources individually.');
  let next=result;
  for(const entry of proposal.entries){
    next=confirmField(next,{documentId,groupId,field:entry.key,rawValue:entry.numericValue+' '+unit,evidence:entry.evidence,
      expectedRawValues:entry.expectedRawValues,expectedRevision:next.reviewRevision,userConfirmed:true});
    const correction=next.documents.find(g=>g.id===groupId).fields[entry.key].correction;
    correction.confirmationMethod='measurement_group';correction.unitOrigin='human_selection';
  }
  return next;
}
