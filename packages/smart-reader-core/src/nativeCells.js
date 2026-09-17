// PDF table cells retain their own text ranges and source boxes. Geometry
// supplies review proposals; it never verifies a previously uncertain field.
const edge=/[\s\x00-\x1f\x7f]/;
function range(line){
  let start=0,end=line.text.length;
  while(start<end&&edge.test(line.text[start]))start++;
  while(end>start&&edge.test(line.text[end-1]))end--;
  return {start,end,text:line.text.slice(start,end)};
}
const readable=line=>/[\p{L}\p{N}]/u.test(line.text);
const sameRow=(a,b)=>a.box&&b.box&&Math.min(a.box.y+a.box.height,b.box.y+b.box.height)-Math.max(a.box.y,b.box.y)>=Math.min(a.box.height,b.box.height)*.5;
const shapes={
  loadNumber:{label:/^(?:PRO|LOAD|ORDER)\s*(?:NUMBER|NO\.?|ID|#|:)\s*[:#]?$/i,value:/^[A-Z0-9][A-Z0-9._/-]*$/i,maxY:.4},
  totalRate:{label:/^(?:TOTAL\s+(?:RATE|CARRIER\s+(?:PAY|RATE))|CARRIER\s+PAY|ALL[ -]IN\s+RATE|RATE\s*\(\$\))\s*:?$/i,value:/^[$€£]?\s*\d[\d.,]*(?:\s+(?:USD|EUR|GBP|CAD|AUD|CHF))?$/i},
  equipment:{label:/^(?:SIZE\s*&\s*TYPE|EQUIPMENT(?:\s+TYPE)?)\s*:$/i,value:/^[A-Z][A-Z0-9 /&.'"-]{1,60}$/i},
  miles:{label:/^MILES\s*:$/i,value:/^\d[\d,.]*$/},
  weight:{label:/^WEIGHT\s*:$/i,value:/^\d[\d,.]*(?:\s+(?:LB|LBS|KG|KGS))?$/i},
};

export function nativeCellMatches(page,spec){
  const shape=shapes[spec.nativeCell],matches=[];if(!shape)return matches;
  for(const observation of page.observations){
    if(observation.source!=='pdf-text-layer'||!observation.sourceImageId)continue;
    const lines=observation.lines.filter(line=>line.box);
    for(const label of lines){
      if(!shape.label.test(range(label).text)||label.box.y>(shape.maxY??1))continue;
      const right=lines.filter(line=>line!==label&&readable(line)&&sameRow(label,line)
        &&line.box.x>=label.box.x+label.box.width-.002&&line.box.x-label.box.x-label.box.width<=.3).sort((a,b)=>a.box.x-b.box.x);
      const line=right[0];
      // An intervening label or ambiguous overlapping cells is a boundary.
      if(!line||right[1]&&right[1].box.x-line.box.x<.004)continue;
      const {start,end,text}=range(line);
      if(/[\x00-\x1f\x7f]/.test(text)||!shape.value.test(text))continue;
      matches.push({observation,line,start,end,labelLine:label,issue:'layout_needs_review'});
    }
  }
  return matches;
}

export function nativeCertificateMatches(observation,spec){
  if(observation.source!=='pdf-text-layer'||!observation.sourceImageId)return [];
  const lines=observation.lines.filter(line=>line.box),matches=[];
  const nearest=(label,accept)=>{
    const below=lines.filter(line=>line!==label&&readable(line)&&accept(line.box)
      &&line.box.y>=label.box.y+label.box.height*.6&&line.box.y<=label.box.y+label.box.height+.035).sort((a,b)=>a.box.y-b.box.y);
    return below[0]&&!(below[1]&&sameRow(below[0],below[1]))?below[0]:null;
  };
  for(const refLabel of lines.filter(line=>/^REF\. NUMBER$/i.test(range(line).text))){
    const headings=lines.filter(line=>/^DOCUMENT COMPLETED BY ALL PARTIES ON$/i.test(range(line).text)
      &&sameRow(refLabel,line)&&line.box.x>refLabel.box.x+refLabel.box.width);
    if(headings.length!==1)continue;
    const dateLabel=headings[0];
    const refLine=nearest(refLabel,box=>Math.abs(box.x-refLabel.box.x)<.025&&box.x+box.width<dateLabel.box.x);
    const dateLine=nearest(dateLabel,box=>box.x>=dateLabel.box.x-.015&&box.x+box.width<=dateLabel.box.x+dateLabel.box.width+.015);
    if(!refLine||!dateLine||!sameRow(refLine,dateLine))continue;
    const ref=range(refLine),date=range(dateLine);
    if(!/^[A-Z0-9][A-Z0-9-]*$/i.test(ref.text))continue;
    const completion=/^(\d{1,2} [A-Z]{3} \d{4})\s+(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/id.exec(date.text);
    if(!completion)continue;
    const reference=spec.certificatePart==='reference';
    matches.push({observation,line:reference?refLine:dateLine,
      start:reference?ref.start:date.start+completion.indices[1][0],end:reference?ref.end:date.start+completion.indices[1][1],
      labelLine:reference?refLabel:dateLabel,extraLabelLines:reference?[dateLabel,dateLine]:[refLabel,refLine],issue:'layout_needs_review'});
  }
  return matches;
}
