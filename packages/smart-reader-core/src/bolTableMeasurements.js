// A table's WEIGHT heading owns the numeric cells below it, not the next
// heading on the same row. Keep source coordinates local to each observation.
// This is a reviewable proposal: no unit or digit is invented from the table.
const heading=/^\s*WEIGHT[\s*"'”’]*$/i;
const numeric=/^\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,3})?(?:\s*(?:LB|LBS|KG|KGS|IBS))?\s*$/i;
const peer=/^\s*(?:CLASS|CHARGES|RATE|UNITS|QTY|QUANTITY)\s*$/i;
export function bolTableMeasurementMatches(page,spec){
  if(!spec.bolWeightColumn)return [];
  const matches=[];
  for(const observation of page.observations){
    const lines=observation.lines;
    if(!observation.sourceImageId||!lines.some(line=>line.box?.y<.3&&/\bBILL\s+OF\s+LADING\b/i.test(line.text))
      ||!lines.some(line=>line.box&&/\bDESCRIPTION\s+OF\s+ARTICLES\b|\bCOMMODITY\s+DESCRIPTION\b/i.test(line.text)))continue;
    for(const labelLine of lines){
      const box=labelLine.box;
      if(!box||box.y<.25||box.y>.7||box.width>.2||box.height>.04||!heading.test(labelLine.text))continue;
      const peers=lines.filter(line=>line!==labelLine&&line.box&&peer.test(line.text)&&Math.abs(line.box.y-box.y)<.04);
      const right=peers.filter(line=>line.box.x>box.x+box.width).sort((a,b)=>a.box.x-b.box.x)[0]?.box.x;
      if(right==null)continue;
      const left=Math.max(0,box.x-.025);
      const below=lines.filter(line=>line.box&&numeric.test(line.text)&&line.box.x>=left&&line.box.x<=box.x+box.width+.025&&line.box.x+line.box.width<=right+.003
        &&line.box.y>=box.y+box.height*.7&&line.box.y<=box.y+box.height+.08);
      for(const line of below){
        const raw=line.text.trim(),start=line.text.indexOf(raw);
        matches.push({observation,line,start,end:start+raw.length,labelLine,extraLabelLines:peers,
          supportMethod:'bol_weight_column',issue:'layout_needs_review'});
      }
    }
  }
  return matches;
}
