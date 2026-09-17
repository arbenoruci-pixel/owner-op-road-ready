import {evidenceFor} from './input.js';
import {certificateMatches} from './signingCertificate.js';
import {normalizeValue} from './profiles.js';

const reference=/^\s*DOCUMENT REF(?:ERENCE)?\s*:\s*([A-Z0-9][A-Z0-9-]{7,})(?=\s|$)/id;
const strong=line=>line.confidence===null||line.confidence>=.8;
const refs=pages=>pages.flatMap(page=>page.observations.flatMap(observation=>observation.lines.flatMap(line=>{
  const match=reference.exec(line.text);
  return match?[{value:match[1],page,observation,line,start:match.indices[1][0],end:match.indices[1][1]}]:[];
})));

// A short year can use the full year on a certificate for the exact same
// envelope. Never use today's year or an unrelated packet page.
export function rateDateContext(groupPages,allPages,identities){
  const references=refs(groupPages),values=new Set(references.map(r=>r.value));
  if(values.size!==1||references.some(r=>!strong(r.line)))return null;
  const value=references[0].value;
  const others=allPages.filter((page,i)=>!groupPages.includes(page)&&!['signature_page','signing_certificate'].includes(identities[i].kind));
  if(refs(others).some(r=>r.value===value))return null;
  const anchors=[];
  for(let i=0;i<allPages.length;i++){
    if(identities[i].kind!=='signing_certificate'||identities[i].status==='conflicting')continue;
    const page=allPages[i],matches=certificateMatches(page,{certificatePart:'reference'});
    if(!matches.length||matches.some(m=>m.line.text.slice(m.start,m.end)!==value||!strong(m.line)||!strong(m.labelLine)||(m.extraLabelLines||[]).some(line=>!strong(line))))continue;
    for(const match of certificateMatches(page,{certificatePart:'date'})){
      const date=match.line.text.slice(match.start,match.end),year=Number(date.slice(-4));
      if(!normalizeValue('date',date).value)continue;
      anchors.push({year,evidence:evidenceFor(page,match.observation,match.line,match.start,match.end),
        labels:[evidenceFor(page,match.observation,match.labelLine,0,match.labelLine.text.length),
          ...matches.filter(m=>m.observation===match.observation).map(m=>evidenceFor(page,m.observation,m.line,m.start,m.end))]});
    }
  }
  if(!anchors.length||new Set(anchors.map(a=>a.year)).size!==1)return null;
  return {year:anchors[0].year,evidence:[...references.map(r=>evidenceFor(r.page,r.observation,r.line,r.start,r.end)),
    ...anchors.flatMap(a=>[a.evidence,...a.labels])]};
}

export function expandShortYear(raw,context){
  const match=/^(\d{1,2}[/.]\d{1,2}[/.])(\d{2})$/.exec(raw.trim());
  return match&&context&&context.year%100===Number(match[2])?match[1]+context.year:null;
}
