// The combined certificate header labels the next row. Keep this association
// inside one observation; signer timestamps elsewhere cannot supply this date.
import {nativeCertificateMatches} from './nativeCells.js';
import {documentReferences} from './documentReference.js';
const heading=/^\s*REF\. NUMBER\s+DOCUMENT COMPLETED BY ALL PARTIES ON\s*$/i;
const row=/^\s*([A-Z0-9][A-Z0-9-]*)\s+(\d{1,2} [A-Z]{3} \d{4})\s+(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\s*$/id;

export function certificateMatches(page,spec){
  const matches=[];
  for(const observation of page.observations){
    matches.push(...nativeCertificateMatches(observation,spec));
    const lines=observation.lines.filter(line=>line.text.trim());
    const provider=lines.find(line=>/^\s*Sertifi Electronic Signature\s*$/i.test(line.text));
    const signed=lines.find(line=>/^\s*E-Signed\s*:/i.test(line.text));
    const refs=documentReferences([{...page,observations:[observation]}]);
    if(provider&&signed&&refs.length){
      if(spec.certificatePart==='reference')for(const ref of refs)matches.push({...ref,labelLine:signed,extraLabelLines:[provider]});
      if(spec.certificatePart==='date'){
        const next=lines[lines.indexOf(signed)+1];
        const inline=/^\s*E-Signed\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/id.exec(signed.text);
        const beside=!inline&&observation.source==='pdf-text-layer'&&signed.box&&next?.box
          &&next.box.x>signed.box.x+signed.box.width&&Math.abs(next.box.y-signed.box.y)<.01
          ?/^\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/d.exec(next.text):null;
        const date=inline||beside;
        if(date)matches.push({observation,line:inline?signed:next,start:date.indices[1][0],end:date.indices[1][1],
          labelLine:signed,extraLabelLines:[provider,...refs.map(r=>r.line)],certificateDateFormat:'numeric'});
      }
    }
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
