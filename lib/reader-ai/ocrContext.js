// A matching view for provider context only; source observations and field
// evidence stay intact. Repeated phone-OCR views must not crowd out a footer.
export function boundedOcrContext(observations=[],limit=6000){
 const prior=new Set(),parts=[];
 for(const observation of observations){
  const lines=(observation.lines||[]).map(line=>String(line.text||''));
  const unique=lines.filter(line=>line.trim()&&!prior.has(line.trim()));
  if(unique.length)parts.push(unique.join('\n'));
  for(const line of lines)if(line.trim())prior.add(line.trim());
 }
 const text=parts.join('\n');
 if(text.length<=limit)return text;
 const gap='\n[OCR text omitted]\n',head=Math.floor((limit-gap.length)*.7),tail=limit-gap.length-head;
 return text.slice(0,head)+gap+text.slice(-tail);
}
