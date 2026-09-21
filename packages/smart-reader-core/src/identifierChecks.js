import {fieldMatches} from './layout.js';
import {recoverPartyContinuations} from './partyEvidence.js';
import {recoverConsigneeBlocks} from './partyBlocks.js';
import {certificateMatches} from './signingCertificate.js';
import {rateSectionMatches} from './rateConfirmation.js';
import {ratePartyMatches} from './rateParties.js';
import {nativeCellMatches} from './nativeCells.js';
import {reconcilePartyNoise} from './partyNoise.js';
import {recoverPartialBolDates,recoverCarrierInitialSpacing} from './bolRecovery.js';
import {bolHeaderMatches,bolEquipmentMatches} from './bolHeader.js';

// A digit string is not interchangeable with another that lost end digits.
// Unlabelled alternatives can only make a BOL uncertain; never fill its value.
const numeric=value=>/^\d{6,20}$/.test(value);
const header=line=>line.box&&line.box.y<.35&&line.box.height<.04;
const overlaps=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)
  &&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>=Math.min(a.height,b.height)*.5;
const confusablePair=(a,b)=>a.length===b.length&&a.length>=5&&a.length<=20&&/\d/.test(a)&&/\d/.test(b)
  &&[...a].filter((letter,index)=>letter!==b[index]).length===1
  &&[...a].every((letter,index)=>letter===b[index]||['8B','0O','1I','1L','5S','2Z','6G'].some(pair=>pair.includes(letter)&&pair.includes(b[index])));

export function pageFieldMatches(page,spec){
  const matches=spec.pattern?page.observations.flatMap(observation=>fieldMatches(observation.lines,spec).map(match=>({observation,...match}))):[];
  if(spec.bolHeaderContext)matches.push(...bolHeaderMatches(page,spec.bolHeaderContext));
  if(spec.bolEquipmentContext)matches.push(...bolEquipmentMatches(page,spec.bolEquipmentContext));
  if(spec.noisyLabel)for(const match of matches)if(spec.noisyLabel.test(match.labelLine?.text||match.line.text))match.issue||='damaged_label';
  if(spec.receiptRow){
    // A single geometric proposal stays reviewable. Two clear same-row reads
    // of the exact value on this page can support it, keeping both sources.
    const rows=matches.filter(match=>match.supportMethod==='aligned_receipt_row'&&match.issue==='layout_needs_review');
    const value=match=>match.line.text.slice(match.start,match.end).trim().replace(/[ \t]+/g,' ');
    for(const match of rows){
      const observations=new Set(rows.filter(other=>value(other)===value(match)).map(other=>other.observation.id));
      if(observations.size>=2)delete match.issue;
    }
  }
  if(spec.rateSection)matches.push(...rateSectionMatches(page,spec));
  if(spec.rateParty)matches.push(...ratePartyMatches(page,spec));
  if(spec.nativeCell)matches.push(...nativeCellMatches(page,spec));
  if(spec.certificatePart)matches.push(...certificateMatches(page,spec));
  if(spec.kind==='party')return reconcilePartyNoise(recoverPartyContinuations(spec.wrappedConsigned?recoverConsigneeBlocks(matches):spec.recoverInitialSpacing?recoverCarrierInitialSpacing(matches):matches));
  if(spec.recoverPartialTime)return recoverPartialBolDates(matches);
  if(!spec.checkIdentifierFragments)return matches;
  const proposals=[];
  // A numbered header with one OCR-confusable letter/digit is an alternative
  // to review, never another accepted reference. Preserve both source quotes.
  for(const match of matches){
    const raw=match.line.text.slice(match.start,match.end).trim().toUpperCase();
    if(!header(match.line)||!/^[A-Z0-9]{5,20}$/.test(raw)||!/[A-Z]/.test(raw))continue;
    for(const observation of page.observations){
      // A generic header number is an OCR alternative only when that other
      // observation has no labeled BOL reading of its own. Its other form
      // numbers cannot invalidate an already identified BOL in the same read.
      if(observation===match.observation||matches.some(other=>other.observation===observation))continue;
      for(const line of observation.lines){
      if(line===match.line||!header(line))continue;
      const other=/^\s*(?:NUMBER|NO\.?)\s*[:#]\s*([A-Z0-9]{5,20})\s*$/id.exec(line.text);
      if(!other||!confusablePair(raw,other[1].toUpperCase()))continue;
      match.issue||='identifier_fragments';
      if(!proposals.some(proposal=>proposal.observation===observation&&proposal.line===line))proposals.push({observation,line,start:other.indices[1][0],end:other.indices[1][1],issue:'identifier_fragments'});
      }
    }
  }
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
