import {fieldMatches} from './layout.js';
import {recoverPartyContinuations} from './partyEvidence.js';
import {recoverConsigneeBlocks} from './partyBlocks.js';
import {certificateMatches} from './signingCertificate.js';
import {rateSectionMatches} from './rateConfirmation.js';

// A digit string is not interchangeable with another that lost end digits.
// Unlabelled alternatives can only make a BOL uncertain; never fill its value.
const numeric=value=>/^\d{6,20}$/.test(value);
const header=line=>line.box&&line.box.y<.35&&line.box.height<.04;
const overlaps=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)
  &&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>=Math.min(a.height,b.height)*.5;

export function pageFieldMatches(page,spec){
  const matches=spec.pattern?page.observations.flatMap(observation=>fieldMatches(observation.lines,spec).map(match=>({observation,...match}))):[];
  if(spec.rateSection)matches.push(...rateSectionMatches(page,spec));
  if(spec.certificatePart)matches.push(...certificateMatches(page,spec));
  if(spec.kind==='party')return recoverPartyContinuations(spec.wrappedConsigned?recoverConsigneeBlocks(matches):matches);
  if(!spec.checkIdentifierFragments)return matches;
  const proposals=[];
  for(const match of matches){
    const raw=match.line.text.slice(match.start,match.end).trim();
    if(!header(match.line)||!numeric(raw))continue;
    for(const observation of page.observations)for(const line of observation.lines){
      const value=line.text.trim();
      if(line===match.line||!header(line)||!numeric(value)||value===raw)continue;
      const longer=value.length>raw.length?value:raw,shorter=value.length>raw.length?raw:value;
      const extension=longer.length>shorter.length&&longer.length-shorter.length<=4
        &&(longer.startsWith(shorter)||longer.endsWith(shorter));
      const sameArea=observation===match.observation&&overlaps(line.box,match.line.box);
      if(!extension&&!sameArea)continue;
      // Source coordinates are only compared inside their own observation.
      // Cross-pass digit agreement is a warning, not a coordinate projection.
      match.issue||='identifier_fragments';
      if(proposals.some(p=>p.observation===observation&&p.line===line))continue;
      const start=line.text.indexOf(value);
      proposals.push({observation,line,start,end:start+value.length,issue:'identifier_fragments'});
    }
  }
  return [...matches,...proposals];
}
