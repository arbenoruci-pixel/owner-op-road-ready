// Geometric proposals keep the exact source line. A shipping block is a
// bounded heuristic, so below-label proposals always require human review.
export function fieldMatches(lines, spec) {
  const matches=[];
  for(const line of lines){
    const inline=spec.pattern.exec(line.text);
    if(inline){
      if(spec.kind!=='identifier'||! /^[\s.#:|]*$/.test(inline[1]))matches.push({line,start:inline.indices[1][0],end:inline.indices[1][1]});
      continue;
    }
    if(!spec.blockLabel?.test(line.text)||!line.box)continue;
    const label=line.box,center=label.x+label.width/2;
    // These profiles cover compact labels in a left or right shipping block.
    // A spanning/central label has no reliable column assignment.
    if(label.width>.4||Math.abs(center-.5)<.06)continue;
    const left=center<.5?0:.5,right=center<.5?.5:1;
    const below=lines.filter(candidate=>{
      const box=candidate.box;
      return candidate!==line&&box&&candidate.text.trim()
        &&box.x>=left&&box.x+box.width<=right
        &&box.y>=label.y+label.height*.6
        &&box.y<=label.y+label.height+.035;
    }).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
    const first=below[0];
    if(!first)continue;
    // Do not skip unreadable lines to pick a convenient address farther down,
    // or choose between two side-by-side values in the first row.
    if(below.some(other=>other!==first&&Math.abs(other.box.y-first.box.y)<Math.min(other.box.height,first.box.height)*.5))continue;
    if(/^(?:[|{}\s]*)(?:SHIP\s*(?:FROM|TO)|SHIPPER|CONSIGNEE|CARRIER|TRAILER|SEAL|\d+\s+\S+\s+(?:ROAD|STREET|AVENUE|RD|ST|AVE)\b)/i.test(first.text))continue;
    const value=/^[\s|{}]*([^\r\n]*?)[\s|{}]*$/d.exec(first.text);
    if(value?.[1])matches.push({line:first,start:value.indices[1][0],end:value.indices[1][1],labelLine:line,issue:'layout_needs_review'});
  }
  return matches;
}
