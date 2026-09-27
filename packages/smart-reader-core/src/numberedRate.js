// Numbered stop tables and their page footers. Source text is never repaired.
export const numberedRateSignals=[/^\s*Pay Items\s*$/i,/^\s*Total\s+USD\s+\d[\d,.]*\s*$/i,
  /^\s*\d+\s+Pickup\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{2}:\d{2}\b/i,
  /^\s*\d+\s+Delivery\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{2}:\d{2}\b/i];
const title=/^\s*LOAD CONFIRMATION\s*$/i;
const footer=/^\s*Page\s+(\d+)\s+out\s+of\s+(\d+)\s*\|\s*Load\s*#\s*([A-Z0-9][A-Z0-9._/-]*)\s*$/id;
const strong=line=>line.confidence==null||line.confidence>=.8;
export const isNumberedRateTable=lines=>lines.slice(0,20).some(l=>title.test(l.text))&&numberedRateSignals.every(re=>lines.some(l=>re.test(l.text)));
export function numberedRateFooters(page){
  return page.observations.flatMap(observation=>observation.lines.flatMap(line=>{
    const m=footer.exec(line.text);return m?[{observation,line,match:m,page:Number(m[1]),total:Number(m[2]),load:m[3]}]:[];
  }));
}
export function numberedRateContinuation(previousPages,page,identity){
  if(identity.kind!=='unknown'||identity.status==='conflicting')return false;
  if(!previousPages[0]?.observations.some(o=>isNumberedRateTable(o.lines)))return false;
  const pages=[...previousPages,page],footers=pages.map(numberedRateFooters);
  if(footers.some(rows=>!rows.length||rows.some(row=>!strong(row.line))))return false;
  const first=footers[0][0];
  if(first.total<2||first.total>200||footers.some((rows,i)=>rows.some(r=>r.load!==first.load||r.total!==first.total||r.page!==i+1||r.page>r.total)))return false;
  // A fresh primary page cannot be swallowed just because a footer matches.
  if(page.observations.some(o=>o.lines.some(l=>/^\s*(?:(?:LOAD|RATE)\s+CONFIRMATION|(?:STRAIGHT\s+)?BILL\s+OF\s+LADING|INVOICE|PROOF\s+OF\s+DELIVERY|PAY\s+ITEMS)\b/i.test(l.text))))return false;
  return page.observations.some(o=>o.lines.some(l=>strong(l)&&/\b(?:detention|payment|freight bill|signed rate confirmation|carrier|dispatcher signature)\b/i.test(l.text)));
}
const stopRow=/^\s*\d+\s+(Pickup|Delivery)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([0-2]\d:[0-5]\d)\s+(.+?)\s*$/id;
export function numberedRateMatches(page,spec){
  const matches=[],key=spec.numberedRate;
  if(key==='loadNumber')for(const row of numberedRateFooters(page))matches.push({observation:row.observation,line:row.line,start:row.match.indices[3][0],end:row.match.indices[3][1]});
  for(const observation of page.observations){
    const lines=observation.lines;if(!isNumberedRateTable(lines))continue;
    const add=(line,start,end,labelLine,extra={})=>matches.push({observation,line,start,end,...(labelLine?{labelLine}:{}),...extra});
    const patterns={totalRate:/^\s*Total\s+(USD\s+\d[\d,.]*)\s*$/id,
      documentDate:/^\s*Document Date\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*$/id,
      equipment:/^\s*Equipment\s+([A-Za-z][A-Za-z -]+)\s*$/id,
      miles:/^\s*Distance\s+(\d[\d,.]*)\s*$/id,
      billingEmail:/^\s*Accounting Email:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*$/id};
    if(patterns[key])for(const line of lines){const m=patterns[key].exec(line.text);if(m)add(line,...m.indices[1]);}
    const role=key?.startsWith('pickup')||key==='shipper'?'pickup':key?.startsWith('delivery')||key==='consignee'?'delivery':'';
    if(role)for(let i=0;i<lines.length;i++){
      const label=lines[i],m=stopRow.exec(label.text);if(!m||m[1].toLowerCase()!==role)continue;
      if(key.endsWith('Date'))add(label,...m.indices[2]);
      if(key.endsWith('Appointment'))add(label,m.indices[2][0],m.indices[3][1]);
      const following=lines.slice(i+1,i+6),boundary=following.findIndex(l=>stopRow.test(l.text)||/^\s*(?:Pay Items|Notes)\b/i.test(l.text));
      const block=boundary<0?following:following.slice(0,boundary);
      const street=block.find(l=>/^\s*\d+[A-Z]?\s+\S/.test(l.text)),city=block.find(l=>/^\s*[A-Z][A-Z .'-]*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i.test(l.text));
      if(!street||!city)continue;
      if(key==='shipper'||key==='consignee'){
        const value=m[4].replace(/\s+Main Contact\s*$/i,'').trim();
        if(value)add(label,m.indices[4][0],m.indices[4][0]+value.length,label,{issue:'layout_needs_review',extraLabelLines:[street,city]});
      }
      if(key.endsWith('Address')){
        const value=street.text.replace(/\s+(?:Phone|Contact)\s*:.*$/i,'').trim(),start=street.text.indexOf(value),tail=city.text.trim(),a=city.text.indexOf(tail);
        add(street,start,start+value.length,label,{issue:'layout_needs_review',joinedValue:value+', '+tail,continuation:{line:city,start:a,end:a+tail.length},continuationKind:'address'});
      }
    }
  }
  return matches;
}
