// Every classification vote retains the actual lines that established it.
export function profileEvidence(lines,profile){
  const title=lines.find((line,index)=>(line.box?line.box.y<.3:index<20)&&profile.heading.test(line.text));
  const signals=profile.signals.map(pattern=>lines.find(line=>pattern.test(line.text)));
  if(title&&signals.every(Boolean))return {method:'heading',lines:[...new Set([title,...signals])]};
  if(profile.structuralSignals){
    const structure=profile.structuralSignals.map(pattern=>lines.find(line=>pattern.test(line.text)));
    if(structure.every(Boolean))return {method:'shipping_structure',lines:[...new Set(structure)]};
  }
  return null;
}
