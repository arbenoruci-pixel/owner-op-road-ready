// Read a reference from its own labeled header row. Geometry never crosses
// OCR observations; agreement can support a value, never supply missing digits.
const token=/^[ \t]*([A-Z0-9][A-Z0-9._/-]{1,39})[ \t]*$/id;
const date=/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;
const header=line=>line.box&&line.box.y<.4&&line.box.height<.04;
const center=line=>line.box.y+line.box.height/2;
const rowLabel=/^\s*(?:(?:PACKING (?:SLIP|LIST)|ORDER)\s*(?:NUMBER\b|NO\b\.?|ID\b|#|:)|(?:(?:CUSTOMER )?P\.?\s*O\.?|PURCHASE ORDER)\s*(?:NUMBER\b|NO\b\.?|ID\b|#|:)?|CUSTOMER NUMBER|APPLY TO INVOICE|(?:INVOICE|ORDER|SHIP) DATE)\s*[:;#]?\s*$/i;
const dateLabel=/^\s*(INVOICE|ORDER|SHIP) DATE\s*[:;#]?\s*$/i;
const beside=(a,b)=>b.x>=a.x+a.width-.003&&b.x-a.x-a.width<=.35&&b.width<=.3;
function rowAlignment(lines,labels,label,value){
  // Two independently labeled dates in this same pair of columns establish
  // the row offset. Their digits supply geometry only, never reference values.
  const anchors=[];
  for(const other of labels.filter(l=>dateLabel.test(l.text)&&Math.abs(l.box.x-label.box.x)<.035&&l.confidence>=.7)){
    const dates=lines.filter(l=>date.test(l.text.trim())&&l.confidence>=.7&&beside(other.box,l.box)
      &&Math.abs(l.box.x-value.box.x)<.035&&Math.abs(center(l)-center(other))<=.022);
    if(dates.length===1)anchors.push({label:other,value:dates[0],offset:center(dates[0])-center(other)});
  }
  if(new Set(anchors.map(a=>dateLabel.exec(a.label.text)[1].toUpperCase())).size<2
    ||new Set(anchors.map(a=>a.value)).size<2)return null;
  const offsets=anchors.map(a=>a.offset).sort((a,b)=>a-b);
  if(offsets.at(-1)-offsets[0]>.006)return null;
  return {offset:offsets[Math.floor(offsets.length/2)],lines:anchors.flatMap(a=>[a.label,a.value])};
}

export function referenceRowMatches(page,spec){
  if(!spec.referenceRow)return [];
  const matches=[];
  for(const observation of page.observations){
    const lines=observation.lines.filter(header),labels=lines.filter(line=>rowLabel.test(line.text));
    for(const label of labels.filter(line=>spec.referenceRow.test(line.text))){
      const a=label.box;
      const candidates=[];
      for(const line of lines){
        const b=line.box,match=token.exec(line.text);
        if(line===label||!match||date.test(match[1])||!/[0-9]/.test(match[1])||!beside(a,b))continue;
        const alignment=rowAlignment(lines,labels,label,line),offset=alignment?.offset||0;
        if(!alignment&&b.y<a.y-.004)continue;
        const distance=Math.abs(center(line)-offset-center(label));
        if(distance>Math.min(.022,Math.max(a.height,b.height)*1.5))continue;
        // Competing labels own their rows after alignment, in either direction.
        if(labels.some(other=>other!==label&&Math.abs(other.box.x-a.x)<.035&&(alignment
          ?Math.abs(center(line)-offset-center(other))<distance+.003
          :other.box.y<=b.y+.003&&other.box.y>a.y)))continue;
        candidates.push({line,alignment});
      }
      // Preserve competing numbers as unresolved evidence instead of choosing
      // the first one in reading order.
      for(const {line,alignment} of candidates){
        const match=token.exec(line.text),strong=[label,line].every(item=>item.confidence!==null&&item.confidence>=.8);
        matches.push({observation,line,start:match.indices[1][0],end:match.indices[1][1],labelLine:label,extraLabelLines:alignment?.lines,
          supportMethod:'labeled_reference_row',issue:candidates.length===1&&strong?'layout_needs_review':'ambiguous_reference_row'});
      }
    }
  }
  const value=match=>match.line.text.slice(match.start,match.end);
  const clear=matches.filter(match=>match.issue==='layout_needs_review');
  for(const match of clear){
    const agreeing=new Set(clear.filter(other=>value(other)===value(match)).map(other=>other.observation.id));
    if(agreeing.size>=2)delete match.issue;
  }
  return matches;
}
