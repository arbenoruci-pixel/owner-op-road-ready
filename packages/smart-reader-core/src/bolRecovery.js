import {normalizeValue} from './profiles.js';
import {partyKey} from './partyEvidence.js';
const raw=m=>m.joinedValue??m.line.text.slice(m.start,m.end).trim();
const strong=m=>!m.issue&&m.line.confidence!==null&&m.line.confidence>=.8
  &&(!m.labelLine||m.labelLine.confidence!==null&&m.labelLine.confidence>=.8);

// The date is complete but OCR stopped after the seconds delimiter. Only a
// separate, strong reading of this very date can corroborate it. Invalid or
// ambiguous dates/times and disagreements remain visible to the reviewer.
export function recoverPartialBolDates(matches){
  return matches.map(match=>{
    const cut=/^(\S+)[ T]([01]\d|2[0-3]):([0-5]\d):$/.exec(raw(match));
    if(!cut)return match;
    const date=normalizeValue('date',cut[1]);if(!date.value)return match;
    const peers=matches.filter(other=>other.observation!==match.observation&&strong(other)
      &&normalizeValue('date',raw(other)).value===date.value);
    return peers.length?{...match,joinedValue:cut[1],supportMethod:'corroborated_date_only'}:match;
  });
}

// Do not erase general word/identifier boundaries. This handles only an
// initial followed by AND that sparse OCR joined, after two strong direct
// readings on this page agree on the complete, explicitly labeled name.
export function recoverCarrierInitialSpacing(matches){
  const direct=matches.filter(m=>strong(m)&&!m.labelLine&&/^[A-Z] AND [A-Z]\b /i.test(raw(m)));
  return matches.map(match=>{
    if(match.issue!=='layout_needs_review'||!match.labelLine)return match;
    const joined=/^([A-Z])AND ([A-Z]\b .+)$/i.exec(raw(match));if(!joined)return match;
    const value=joined[1]+' AND '+joined[2];
    const peers=direct.filter(other=>other.observation!==match.observation&&partyKey(raw(other))===partyKey(value));
    return new Set(peers.map(m=>m.observation)).size>=2
      ?{...match,joinedValue:raw(peers[0]),supportMethod:'corroborated_initial_spacing'}:match;
  });
}
