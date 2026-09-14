// End a field at another explicit form label. Keep source offsets intact;
// splitting a flattened OCR row must never rewrite the recognized value.
const NEXT_FIELD=/(?:^|[\s|])(?:SALES\s+ORDER|DELIVERY|LOAD\s+DESCRIPTION|RESTACKS|BAD\s+PALLETS|DOOR\s+NO\.?|DEPARTMENT|TRUCK\s+NO\.?|TRAILER\s+NO\.?|STARTED\s+AT|COMPLETED\s+AT|ARRIVAL|PRINTED|DATE|PHONE|NET\s+TOTAL|CHECKOUT\s+FEE)\s*[:#]/i;
const FOOTNOTE=/\s+\*\s+(?:IF|WHEN|THE|SHIPPER|CARRIER)\b/i;
export function inlineFieldRange(line,spec){
  if(spec.kind==='party'&&/^\s*(?:CARRIER|SHIPPER|CONSIGNEE)\s+(?:and|or|shall|acknowledges?|agrees?|without|certifies|(?:has|have)\s+been)\b/i.test(line.text))return null;
  const explicit=spec.inlineLabel?.exec(line.text),match=explicit?null:spec.pattern.exec(line.text);
  if(!explicit&&!match)return null;
  if(explicit&&explicit.index>0){
    const prefix=line.text.slice(0,explicit.index);
    if(/\b(?:attach|send|submit|provide|return|include|required|quote)\b|\bcopy\s+of\b/i.test(prefix))return null;
    if(spec.kind==='date'&&/\b(?:delivery|arrival|pickup|signature|printed|due)\s*$/i.test(prefix))return null;
  }
  let start=explicit?explicit.index+explicit[0].length:match.indices[1][0];
  let end=explicit?line.text.length:match.indices[1][1];
  const value=line.text.slice(start,end),stop=NEXT_FIELD.exec(value),footnote=FOOTNOTE.exec(value);
  if(stop)end=Math.min(end,start+stop.index);
  if(footnote)end=Math.min(end,start+footnote.index);
  const token=spec.valuePattern?.exec(line.text.slice(start,end));
  if(token)end=start+token[0].length;
  while(start<end&&/[\s|]/.test(line.text[start]))start++;
  while(end>start&&/[\s|]/.test(line.text[end-1]))end--;
  return end>start?{start,end}:null;
}
