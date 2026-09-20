import {partyKey} from './partyEvidence.js';
// Only detached tildes in a wrapped consignee block can be cosmetic. Another
// labeled observation on the same page must corroborate the complete name.
export function reconcilePartyNoise(matches) {
  return matches.map(match=>{
    const raw=match.joinedValue??match.line.text.slice(match.start,match.end).trim();
    if(match.continuationKind!=='party_block'||!/^~{2,}\s+\p{L}/u.test(raw)||!match.line.box)return match;
    const clean=raw.replace(/^~{2,}\s+/, '');
    const corroborated=matches.some(other=>other.observation!==match.observation&&other.line.box
      &&other.line.confidence!==null&&other.line.confidence>=.8
      &&partyKey(other.joinedValue??other.line.text.slice(other.start,other.end).trim())===partyKey(clean));
    return corroborated?{...match,joinedValue:clean}:match;
  });
}
