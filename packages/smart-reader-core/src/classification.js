// Matching views never replace source text or its evidence offsets.
const leadingMarks=/^[\s|~'"‘’“”*_\[\]{}<>•=.,:;–—-]+/;
const view=line=>line.text.replace(leadingMarks,'');
const matches=(line,pattern)=>pattern.test(line.text)||pattern.test(view(line));
function noisyTitle(line,profile){
  if(profile.id!=='bol'||!line.box||line.box.y>=.2||line.box.height<.015||line.confidence===null||line.confidence>=.8)return false;
  const text=view(line),prefix=/^([A-Za-z0-9]{1,2})[ \t]+/.exec(text);
  // Tiny low-confidence fragments beside a large header may be scan noise.
  // Grammatical/negative prefixes still carry meaning and cannot be discarded.
  return !!prefix&&!/^(?:no|do|to|of|by|in|on|an|as|at|if|is|or|be|we|my)$/i.test(prefix[1])&&profile.heading.test(text.slice(prefix[0].length));
}

// Every vote retains the original lines, including OCR noise and punctuation.
export function profileEvidence(lines,profile,{lineIndices}={}){
  for(const variant of profile.variants||[]){
    const support=profileEvidence(lines,{...profile,...variant,variants:null,structuralSignals:null},{lineIndices});
    if(support)return {...support,method:variant.method||support.method};
  }
  const title=lines.find((line,index)=>(line.box?line.box.y<(profile.headingMaxY??.3):(lineIndices?.get(line)??index)<20)&&(matches(line,profile.heading)||noisyTitle(line,profile)));
  const signals=profile.signals.map(pattern=>lines.find(line=>matches(line,pattern)));
  if(title&&signals.every(Boolean)){
    const exact=profile.heading.test(title.text)&&signals.every((line,i)=>profile.signals[i].test(line.text));
    return {method:exact?'heading':'noisy_heading',lines:[...new Set([title,...signals])]};
  }
  if(profile.structuralSignals){
    const structure=profile.structuralSignals.map(pattern=>lines.find(line=>matches(line,pattern)));
    if(structure.every(Boolean))return {method:profile.id==='bol'?'shipping_structure':'field_structure',lines:[...new Set(structure)]};
  }
  return null;
}
