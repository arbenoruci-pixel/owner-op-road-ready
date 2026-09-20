import {documentReferences} from './documentReference.js';

// A repeated complete RateCon stays separate even if its PRO matches. Only a
// terms-only continuation with the same explicit envelope can join its parent.
export function rateContinuation(previousPages,page,identity,profile) {
  if(identity.kind!=='unknown'||identity.status==='conflicting')return false;
  const before=documentReferences(previousPages),after=documentReferences([page]);
  const all=[...before,...after];
  if(!before.length||!after.length||new Set(all.map(r=>r.value)).size!==1
    ||all.some(r=>r.line.confidence!==null&&r.line.confidence<.8))return false;
  return page.observations.some(observation=>{
    const lines=observation.lines;
    const strong=line=>line.confidence===null||line.confidence>=.8;
    return lines.slice(0,20).some(line=>strong(line)&&profile.heading.test(line.text))
      &&lines.some(line=>strong(line)&&/^\s*(?:The confirmation governs the movement|\(?Rate confirmation (?:details|terms) continued)\b/i.test(line.text))
      &&!page.observations.some(o=>o.lines.some(line=>/^\s*(?:TOTAL\s+(?:RATE|CARRIER)|CARRIER\s+PAY|ALL[ -]IN\s+RATE|RATE\s*\(\$\)|PICK(?:\s*UP)?\s*\d|STOP\s*\d|DELIVERY\s*:?\s*$)/i.test(line.text.replace(/^[\s\x00-\x1f]+/,''))));
  });
}
