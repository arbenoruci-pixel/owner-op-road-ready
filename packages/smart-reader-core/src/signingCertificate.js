// The combined certificate header labels the next row. Keep this association
// inside one observation; signer timestamps elsewhere cannot supply this date.
const heading=/^\s*REF\. NUMBER\s+DOCUMENT COMPLETED BY ALL PARTIES ON\s*$/i;
const row=/^\s*([A-Z0-9][A-Z0-9-]*)\s+(\d{1,2} [A-Z]{3} \d{4})\s+(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\s*$/id;

export function certificateMatches(page,spec){
  const matches=[];
  for(const observation of page.observations){
    const lines=observation.lines.filter(line=>line.text.trim());
    for(let i=0;i<lines.length-1;i++){
      if(!heading.test(lines[i].text))continue;
      const line=lines[i+1],match=row.exec(line.text);
      if(!match)continue;
      const [start,end]=match.indices[spec.certificatePart==='reference'?1:2];
      matches.push({observation,line,start,end,labelLine:lines[i],issue:'layout_needs_review'});
    }
  }
  return matches;
}
