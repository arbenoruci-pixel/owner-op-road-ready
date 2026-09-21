// Read a reference from its own labeled header row. Geometry never crosses
// OCR observations; agreement can support a value, never supply missing digits.
const token=/^[ \t]*([A-Z0-9][A-Z0-9._/-]{1,39})[ \t]*$/id;
const date=/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;
const header=line=>line.box&&line.box.y<.4&&line.box.height<.04;
const center=line=>line.box.y+line.box.height/2;
const rowLabel=/^\s*(?:(?:PACKING (?:SLIP|LIST)|ORDER)\s*(?:NUMBER\b|NO\b\.?|ID\b|#|:)|(?:(?:CUSTOMER )?P\.?\s*O\.?|PURCHASE ORDER)\s*(?:NUMBER\b|NO\b\.?|ID\b|#|:)?|CUSTOMER NUMBER|(?:INVOICE|ORDER|SHIP) DATE)\s*[:;#]?\s*$/i;

export function referenceRowMatches(page,spec){
  if(!spec.referenceRow)return [];
  const matches=[];
  for(const observation of page.observations){
    const lines=observation.lines.filter(header),labels=lines.filter(line=>rowLabel.test(line.text));
    for(const label of labels.filter(line=>spec.referenceRow.test(line.text))){
      const a=label.box;
      const candidates=lines.filter(line=>{
        const b=line.box,match=token.exec(line.text);
        if(line===label||!match||date.test(match[1])||!/[0-9]/.test(match[1]))return false;
        if(b.x<a.x+a.width-.003||b.x-a.x-a.width>.35||b.width>.3)return false;
        if(b.y<a.y-.004)return false;
        const distance=Math.abs(center(line)-center(label));
        if(distance>Math.min(.022,Math.max(a.height,b.height)*1.5))return false;
        // A number nearer a different field label belongs to that other row.
        return !labels.some(other=>other!==label&&Math.abs(other.box.x-a.x)<.035
          &&other.box.y<=b.y+.003&&other.box.y>a.y);
      });
      // Preserve competing numbers as unresolved evidence instead of choosing
      // the first one in reading order.
      for(const line of candidates){
        const match=token.exec(line.text),strong=[label,line].every(item=>item.confidence!==null&&item.confidence>=.8);
        matches.push({observation,line,start:match.indices[1][0],end:match.indices[1][1],labelLine:label,
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
