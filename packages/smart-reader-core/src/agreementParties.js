const title=/^\s*(?:BROKER[ -]CARRIER AGREEMENT|CARRIER AGREEMENT)\s*$/i;
const roleLabel=/^\s*(BROKER|CARRIER)(?:\s+(?:SIGNATURE|INFORMATION))?\s*:?\s*$/i;
const companyLabel=/^\s*(?:COMPANY(?:\s+NAME)?|LEGAL(?:\s+BUSINESS)?\s+NAME|BUSINESS\s+NAME)\s*:\s*(.+?)\s*$/id;

// Explicit role and company labels in the same agreement observation retain
// their own evidence. A signer, logo or unlabeled company is not a broker.
// Do not infer legal identity or verify signatures from OCR text.
export function agreementPartyMatches(page,spec){
  const matches=[];
  for(const observation of page.observations){
    const heading=observation.lines.find((line,index)=>(line.box?line.box.y<.3:index<20)&&title.test(line.text));
    if(!heading)continue;
    let section=null;
    for(const line of observation.lines){
      const role=roleLabel.exec(line.text);
      if(role){section={role:role[1].toLowerCase(),line};continue;}
      if(!section)continue;
      if(!line.text.trim())continue;
      // Only the next nonempty row belongs to this role. Signature text,
      // legal prose and another inline party field end that ownership.
      const company=companyLabel.exec(line.text);
      const a=section.line.box,b=line.box;
      const adjacent=!a&&!b||a&&b&&Math.abs(a.x-b.x)<.05&&b.y>=a.y&&b.y-a.y<=.08;
      if(company&&adjacent&&section.role===spec.agreementParty)matches.push({observation,line,
        start:company.indices[1][0],end:company.indices[1][1],labelLine:section.line,
        extraLabelLines:[heading],supportMethod:'explicit_agreement_role',
        ...([heading,section.line].some(item=>item.confidence!=null&&item.confidence<.8)?{issue:'label_needs_review'}:{})});
      section=null;
    }
  }
  return matches;
}
