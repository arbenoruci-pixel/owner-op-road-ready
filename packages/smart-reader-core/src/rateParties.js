import {isDocumentParty} from './fieldGuards.js';

const company=/\b(?:LLC|L\.?L\.?C\.?|INC\.?|LTD\.?|CORP\.?|CORPORATION|LIMITED)\s*$/i;
const range=(line,text)=>({line,start:line.text.indexOf(text),end:line.text.indexOf(text)+text.length});
const carrierLetter=text=>/^\s*([CARIE])\s*$/.exec(text)?.[1]
  ||/\s([IER])\s+(?:MC\s*#|DOT\b|Driver\b)/i.exec(text)?.[1]?.toUpperCase();

// Require the complete vertical CARRIER label and its adjacent company.
// A flattened label or an unlabeled billing company remains a review proposal.
export function ratePartyMatches(page,spec){
  const matches=[];
  for(const observation of page.observations){
    const stop=observation.lines.findIndex(l=>/^\s*(?:SIZE\s*&\s*TYPE|EQUIPMENT|CHARGES|PICK\s*\d)\b/i.test(l.text));
    if(stop<0)continue;
    const lines=observation.lines.slice(0,stop);
    for(let i=0;i<lines.length;i++){
      if(lines[i].text.trim()!=='C')continue;
      const block=lines.slice(i,i+13);
      const vertical=lines[i].box?lines.filter(l=>l.box&&/^[CARIE]$/.test(l.text.trim())&&Math.abs(l.box.x-lines[i].box.x)<.015&&l.box.y>=lines[i].box.y&&l.box.y<lines[i].box.y+.15).slice(0,7):[];
      const letters=vertical.map(l=>l.text.trim()).join('')==='CARRIER'?vertical:block.filter(l=>carrierLetter(l.text));
      if(letters.map(l=>carrierLetter(l.text)).join('')!=='CARRIER')continue;
      const line=vertical.length===7&&letters===vertical?lines.find(l=>l.box&&l.box.x>lines[i].box.x+lines[i].box.width&&l.box.x-lines[i].box.x<.1&&Math.abs(l.box.y-lines[i].box.y)<.025&&company.test(l.text.trim())):lines[i+1],text=line?.text.trim();
      if(!text||!company.test(text)||!isDocumentParty(text))continue;
      const geometric=observation.source==='pdf-text-layer'&&letters.every(l=>l.confidence===null||l.confidence>=.8)
        &&letters.every(l=>l.box&&Math.abs(l.box.x-letters[0].box.x)<.015)
        &&letters.every((l,index)=>!index||l.box.y>letters[index-1].box.y)
        &&line.box&&line.box.x>letters[0].box.x+letters[0].box.width
        &&line.box.x-letters[0].box.x<.1&&Math.abs(line.box.y-letters[0].box.y)<.025;
      if(spec.rateParty==='carrier')matches.push({...range(line,text),observation,labelLine:letters[0],extraLabelLines:letters.slice(1),
        ...(geometric?{}:{issue:'layout_needs_review'})});
      if(spec.rateParty!=='broker')continue;
      const billing=observation.lines.find(l=>/^\s*Send Carrier Bills to the Address Above\b/i.test(l.text));
      if(!billing)continue;
      if(geometric)for(const candidate of lines){
        const name=candidate.text.trim(),box=candidate.box;
        if(!box||box.x+box.width>=letters[0].box.x-.01||!company.test(name)||!isDocumentParty(name))continue;
        const below=lines.filter(l=>l.box&&Math.abs(l.box.x-box.x)<.018&&l.box.y>box.y&&l.box.y<box.y+.10).sort((a,b)=>a.box.y-b.box.y);
        const address=below[0],city=below.slice(1,3).find(l=>/^\s*[A-Z][A-Z .'-]*\s+[A-Z]{2}\s+\d{5}\s*$/i.test(l.text));
        if(!address||!/^\s*\d+[A-Z]?\s+\S/.test(address.text)||!city)continue;
        matches.push({...range(candidate,name),observation,labelLine:billing,extraLabelLines:[address,city],issue:'layout_needs_review'});
      }
      const billingLines=lines.filter(l=>!/^\s*[CARIE]\s*$/.test(l.text));
      for(let n=0;n<billingLines.length-2;n++){
        const candidate=billingLines[n],name=candidate.text.replace(/\s+\(\d{3}\).*$/,'').trim();
        if(candidate===line||!company.test(name)||!isDocumentParty(name))continue;
        const address=billingLines[n+1],city=billingLines.slice(n+2,n+4).find(l=>/^\s*[A-Z][A-Z .'-]*\s+[A-Z]{2}\s+\d{5}\b/i.test(l.text));
        if(!/^\s*\d+[A-Z]?\s+\S/.test(address.text)||!city)continue;
        matches.push({...range(candidate,name),observation,labelLine:billing,extraLabelLines:[address,city],issue:'layout_needs_review'});
      }
    }
  }
  return matches;
}
