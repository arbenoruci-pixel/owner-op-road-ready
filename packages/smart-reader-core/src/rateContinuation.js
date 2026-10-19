import {documentReferences} from './documentReference.js';
import {rateHeaderContinuation} from './rateRouteTable.js';
import {numberedRateContinuation} from './numberedRate.js';
import {hasRateTitle,hasRateStructure} from './rateVocabulary.js';

// A repeated complete RateCon stays separate even if its PRO matches. Only a
// terms-only continuation with the same explicit envelope can join its parent.
export function rateContinuation(previousPages,page,identity,profile) {
  if(identity.kind!=='unknown'||identity.status==='conflicting')return false;
  if(rateHeaderContinuation(previousPages,page,identity))return true;
  if(numberedRateContinuation(previousPages,page,identity))return true;
  const before=documentReferences(previousPages),after=documentReferences([page]);
  const all=[...before,...after];
  if(!before.length||!after.length||new Set(all.map(r=>r.value)).size!==1
    ||all.some(r=>r.line.confidence!==null&&r.line.confidence<.8))return false;
  return page.observations.some(observation=>{
    const lines=observation.lines;
    const strong=line=>line.confidence===null||line.confidence>=.8;
    return hasRateTitle(lines.filter(strong))
      &&lines.some(line=>strong(line)&&/^\s*(?:The confirmation governs the movement|\(?Rate confirmation (?:details|terms) continued|Terms and Conditions)\b/i.test(line.text))
      &&!page.observations.some(o=>hasRateStructure(o.lines)||o.lines.some(line=>/^\s*(?:TOTAL\s+(?:RATE|CARRIER)\b|CARRIER\s+PAY\b|ALL[ -]IN\s+RATE\b|RATE\s*\(\$\)|PICK(?:\s*UP)?\s*\d|STOP\s*\d|DELIVERY\s*:?\s*$)/i.test(line.text.replace(/^[\s\x00-\x1f]+/,''))));
  });
}
