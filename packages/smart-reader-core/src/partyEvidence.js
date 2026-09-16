// Keep punctuation and word boundaries that can distinguish legal entities.
export const partyKey=value=>String(value||'').toUpperCase().replace(/,\s*(?=(?:LLC|INC(?:ORPORATED)?|CORP(?:ORATION)?|LTD)\b)/g,' ').replace(/\s+/g,' ').trim();

const suffix=/^(?:LLC|INC(?:ORPORATED)?\.?|CORP(?:ORATION)?\.?|LTD\.?)(?:\s+#\s*[A-Z0-9][A-Z0-9./-]*)?$/i;
const strong=line=>line.confidence!==null&&line.confidence>=.8;
const aligned=(a,b)=>Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>=Math.min(a.height,b.height)*.6;

// Sparse OCR can split "Shipper: ACME," and "LLC #218" on one row.
// Geometry identifies a possible continuation; a complete, direct reading in
// another observation of this page is required before changing its value.
export function recoverPartyContinuations(matches){
  return matches.map(match=>{
    const {observation,line,start,end}=match,raw=line.text.slice(start,end).trim(),box=line.box;
    if(match.issue||match.labelLine||!box||!strong(line)||!raw.endsWith(','))return match;
    const neighbors=observation.lines.filter(other=>other!==line&&other.box&&strong(other)&&suffix.test(other.text.trim())&&aligned(box,other.box)
      &&other.box.x>=box.x+box.width&&other.box.x-box.x-box.width<=Math.min(.035,Math.min(box.height,other.box.height)*3)
      &&(box.x<.5?other.box.x+other.box.width<=.5:other.box.x>=.5));
    if(neighbors.length!==1)return match;
    const continuation=neighbors[0],tail=continuation.text.trim(),joinedValue=raw+' '+tail;
    const intervening=observation.lines.some(other=>other!==line&&other!==continuation&&other.text.trim()&&other.box&&aligned(box,other.box)
      &&other.box.x<continuation.box.x&&other.box.x+other.box.width>box.x+box.width);
    if(intervening)return match;
    const corroborated=matches.some(other=>other.observation!==observation&&!other.issue&&!other.labelLine&&strong(other.line)
      &&partyKey(other.line.text.slice(other.start,other.end))===partyKey(joinedValue));
    return {...match,issue:'layout_needs_review',...(corroborated?{joinedValue}:{}),continuation:{line:continuation,start:continuation.text.indexOf(tail),end:continuation.text.indexOf(tail)+tail.length}};
  });
}
