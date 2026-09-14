// Recover column boundaries that were flattened into a TSV line. Every output
// segment contains only existing words, with bounds from the same source image.
const textOf=words=>words.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim();
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]||0;};
function bounds(words){
  const left=Math.min(...words.map(w=>w.left)),top=Math.min(...words.map(w=>w.top));
  const right=Math.max(...words.map(w=>w.left+w.width)),bottom=Math.max(...words.map(w=>w.top+w.height));
  const confidence=words.map(w=>w.confidence).filter(n=>Number.isFinite(n)&&n>=0&&n<=100);
  return {text:textOf(words),left,top,width:right-left,height:bottom-top,right,bottom,
    confidence:confidence.length?confidence.reduce((a,b)=>a+b,0)/confidence.length:null};
}
const key=line=>JSON.stringify([line.left,line.top,line.width,line.height,String(line.text||'').replace(/\s+/g,' ').trim()]);
export function separateWordColumns(lines,words,size){
  if(!Array.isArray(words)||!words.length||words.length>100000||!size?.width||!size?.height)return lines;
  const groups=new Map();
  for(const word of words){
    if(!word.text?.trim()||![word.left,word.top,word.width,word.height].every(Number.isFinite)||word.left<0||word.top<0||word.width<=0||word.height<=0||word.left+word.width>size.width||word.top+word.height>size.height)continue;
    if(![word.page,word.block,word.paragraph,word.line].every(Number.isInteger))continue;
    const id=[word.page,word.block,word.paragraph,word.line].join(':');
    if(!groups.has(id))groups.set(id,[]);groups.get(id).push(word);
  }
  const byLine=new Map();
  for(const group of groups.values()){
    if(group.length>1000)continue;
    group.sort((a,b)=>a.left-b.left);byLine.set(key(bounds(group)),group);
  }
  return lines.flatMap(line=>{
    const group=byLine.get(key(line));
    // Partial/mismatched word data cannot replace or discard an original line.
    if(!group||group.length<2)return [line];
    const rowHeight=median(group.map(w=>w.height));
    const gapLimit=Math.max(12,rowHeight*2.5,median(group.map(w=>w.width/Math.max(1,w.text.length)))*8);
    const segments=[[]];
    for(let i=0;i<group.length;i++){
      const prefix=textOf(segments.at(-1));
      // A gap does not erase "Previous BOL", "Printed Date", or instructions.
      const qualified=/\b(?:previous|prior|old|revision|revised|printed|delivery|arrival|pickup|signature|due|attach|send|submit|provide|return|include|quote|required)\b|\bcopy\s+of\b/i.test(prefix);
      const previous=group[i-1],current=group[i];
      const gap=i?current.left-previous.left-previous.width:0;
      const differentRow=i&&Math.min(current.top+current.height,previous.top+previous.height)-Math.max(current.top,previous.top)<Math.min(current.height,previous.height)*.25&&gap>rowHeight;
      if(i&&!qualified&&(gap>gapLimit||differentRow))segments.push([]);
      segments.at(-1).push(group[i]);
    }
    return segments.length===1?[line]:segments.map(bounds);
  }).sort((a,b)=>a.top-b.top||a.left-b.left);
}
