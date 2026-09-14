// Geometric proposals keep the exact source line. A shipping block is a
// bounded heuristic, so below-label proposals always require human review.
import {inlineFieldRange} from './inline.js';
const STREET_ADDRESS=/^(?:[|{}\s]*)(?:P\.?\s*O\.?\s+BOX\s+\d|\d+[A-Z]?(?:[-/]\d+)?\s+(?:\S+\s+){0,8}(?:ROAD|STREET|AVENUE|BOULEVARD|DRIVE|LANE|COURT|CIRCLE|TERRACE|PLACE|PARKWAY|HIGHWAY|WAY|TRAIL|LOOP|PIKE|PLAZA|SQUARE|RD|ST|AVE|BLVD|DR|LN|CT|CIR|TER|PL|PKWY|HWY|TRL|PLZ|SQ)\b)/i;
const isRule=(line,label)=>!/[\p{L}\p{N}]/u.test(line.text)||(line.box&&label.box&&line.box.height<label.box.height*.4&&line.confidence!==null&&line.confidence<.5);
const valueRange=line=>/^[\s|{}]*([^\r\n]*?)[\s|{}]*$/d.exec(line.text)?.indices[1];
export function fieldMatches(lines, spec) {
  const matches=[];
  const signatures=lines.filter(line=>line.box?.y>.4&&/^(?:(?:SHIPPER|CARRIER)\s+SIGNATURE\b|FREIGHT\s+COUNTED\b|TRAILER\s+LOADED\b)/i.test(line.text.trim()));
  for(const line of lines){
    if(line.box&&spec.maxY!=null&&line.box.y>spec.maxY)continue;
    if(spec.kind==='party'&&line.box&&signatures.some(anchor=>line.box.y>=anchor.box.y-.015&&line.box.y<=anchor.box.y+.09))continue;
    const blockLabel=spec.blockLabel?.test(line.text),rightLabel=spec.rightLabel?.test(line.text);
    const inline=blockLabel||rightLabel?null:inlineFieldRange(line,spec);
    if(inline){
      if(spec.kind!=='identifier'||! /^[\s.#:|]*$/.test(line.text.slice(inline.start,inline.end)))matches.push({line,...inline});
      continue;
    }
    if(rightLabel&&line.box){
      const label=line.box,side=label.x+label.width/2<.5?0:.5;
      const right=lines.filter(candidate=>{
        const box=candidate.box;
        return candidate!==line&&box&&!isRule(candidate,line)
          &&box.x>=label.x+label.width-.003&&box.x-(label.x+label.width)<=.3
          &&box.x>=side&&box.x+box.width<=side+.5
          &&Math.min(box.y+box.height,label.y+label.height)-Math.max(box.y,label.y)>=Math.min(box.height,label.height)*.5;
      }).sort((a,b)=>a.box.x-b.box.x);
      const first=right[0];
      if(first){
        const range=valueRange(first);
        if(range&&range[1]>range[0]&&!(spec.kind==='party'&&STREET_ADDRESS.test(first.text)))matches.push({line:first,start:range[0],end:range[1],labelLine:line,issue:'layout_needs_review'});
        continue;
      }
    }
    if(!blockLabel||!line.box)continue;
    const label=line.box,center=label.x+label.width/2;
    // These profiles cover compact labels in a left or right shipping block.
    // A spanning/central label has no reliable column assignment.
    if(label.width>.4||Math.abs(center-.5)<.06)continue;
    const left=center<.5?0:.5,right=center<.5?.5:1;
    const below=lines.filter(candidate=>{
      const box=candidate.box;
      return candidate!==line&&box&&candidate.text.trim()&&!isRule(candidate,line)
        &&box.x>=left&&box.x+box.width<=right
        &&box.y>=label.y+label.height*.6
        &&box.y<=label.y+label.height+.035;
    }).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
    const first=below[0];
    if(!first)continue;
    // Skip only punctuation/ruling fragments. Never skip an unreadable text row
    // to pick a convenient address farther down,
    // or choose between two side-by-side values in the first row.
    if(below.some(other=>other!==first&&Math.abs(other.box.y-first.box.y)<Math.min(other.box.height,first.box.height)*.5))continue;
    if(STREET_ADDRESS.test(first.text)||/^(?:[|{}\s]*)(?:SHIP\s*(?:FROM|TO)|SHIPPER|CONSIGNEE|CARRIER|TRAILER|SEAL)\b/i.test(first.text))continue;
    const value=/^[\s|{}]*([^\r\n]*?)[\s|{}]*$/d.exec(first.text);
    if(value?.[1])matches.push({line:first,start:value.indices[1][0],end:value.indices[1][1],labelLine:line,issue:'layout_needs_review'});
  }
  return matches;
}
