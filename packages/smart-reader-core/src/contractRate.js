// Some rate agreements put the price/contract on page one and the stop
// schedule on later pages. Keep every decision inside an observation, and
// require the printed reference and publication footer before joining pages.
import {totalRatePattern,loadNumberLabel} from './rateVocabulary.js';

const heading=/^\s*CONFIRMATION\s+OF\s+(?:(?:CONTRACT|COMMON)\s+)?CARRIER\s+(?:VERBAL\s+)?RATE\s+AGREEMENT\s*$/i;
const reference=/\bBROKER(?:S|['’]S)?\s+REFERENCE\s+(?:NUMBER|NO\.?|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]*)(?=\s|,|$)/id;
const schedule=/^\s*CARRIER\s+PICKUP\s*(?:&|AND)\s+DELIVERY\s+SCHEDULE\s*$/i;
const billingReference=/^\s*REFER\s+TO\s+THIS\s+NUMBER\s+FOR\s+BILLING\s+OR\s+INQUIRIES\s*[=<>-]*\s*$/i;
const identifier=/^\s*([A-Z0-9][A-Z0-9._/-]*\d[A-Z0-9._/-]*|\d[A-Z0-9._/-]*)\s*$/id;
const money=/^\s*[$€£]\s*\d[\d,.]*\s*$/;
const labeledReference=new RegExp(String.raw`^\s*${loadNumberLabel}`,'i');
const strong=line=>line&&(line.confidence==null||line.confidence>=.8);
const range=(line,match)=>({line,start:match?.indices[1][0]??line.text.search(/\S/),end:match?.indices[1][1]??line.text.trimEnd().length});
const early=(line,index)=>line.box?line.box.y<.35:index<20;

function totalMatches(lines){
  const matches=[];
  for(const label of lines){
    const direct=totalRatePattern.exec(label.text);
    if(direct&&/^\s*TOTAL\s*:/i.test(label.text))matches.push({...range(label,direct),labelLine:label});
    if(!/^\s*TOTAL\s*:\s*$/i.test(label.text)||!label.box)continue;
    const cells=lines.filter(line=>line!==label&&line.box&&money.test(line.text)
      &&line.box.x>=label.box.x+label.box.width
      &&Math.abs(line.box.y-label.box.y)<Math.min(line.box.height,label.box.height)*.5);
    if(cells.length===1)matches.push({...range(cells[0]),labelLine:label});
  }
  return matches;
}

export function contractRateEvidence(lines){
  const title=lines.find((line,index)=>early(line,index)&&heading.test(line.text));
  if(!title)return null;
  const total=totalMatches(lines)[0];
  const broker=lines.find(line=>/\bas\s+["“]?BROKER\b/i.test(line.text));
  const carrier=lines.find(line=>/\b(?:as\s+Common\s+Carrier|between\s+["“]?BROKER["”]?\s+and\s+["“]?Common\s+Carrier)\b/i.test(line.text));
  const agreement=lines.find(line=>/\bwill\s+move\s+at\s+the\s+following\s+rate\s*:/i.test(line.text));
  if(!total||!broker||!carrier||!agreement)return null;
  const evidence=[...new Set([title,total.labelLine,total.line,broker,carrier,agreement])];
  return {method:evidence.every(strong)?'heading':'noisy_heading',lines:evidence};
}

export function contractRateMatches(page,spec){
  const matches=[];
  if(!['loadNumber','totalRate'].includes(spec.rateVocabulary))return matches;
  for(const observation of page.observations){
    const lines=observation.lines,proof=contractRateEvidence(lines);
    if(proof){
      if(spec.rateVocabulary==='totalRate')for(const match of totalMatches(lines))matches.push({observation,...match,extraLabelLines:proof.lines});
      if(spec.rateVocabulary==='loadNumber')for(const line of lines){
        const match=reference.exec(line.text);
        if(match&&/\d/.test(match[1]))matches.push({observation,...range(line,match),labelLine:line,extraLabelLines:proof.lines});
      }
    }
    // A bare number is meaningful only beside the printed billing-reference
    // label on a pickup/delivery schedule. It cannot become a BOL or PO ID.
    if(spec.rateVocabulary!=='loadNumber'||!lines.some((line,index)=>early(line,index)&&schedule.test(line.text)))continue;
    for(let index=0;index<lines.length;index++){
      const label=lines[index];if(!billingReference.test(label.text))continue;
      const previous=lines[index-1],match=previous&&identifier.exec(previous.text);
      if(!match||match[1].length<3)continue;
      if(label.box&&previous.box&&(previous.box.y>label.box.y||label.box.y-previous.box.y>.06))continue;
      matches.push({observation,...range(previous,match),labelLine:label});
    }
  }
  return matches;
}

function footer(page){
  const found=[];
  for(const observation of page.observations){
    const lines=observation.lines;
    for(let index=0;index<lines.length;index++){
      const line=lines[index];if(!strong(line)||!(line.box?line.box.y>.85:index>=lines.length-4))continue;
      const match=/^(?:(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[AP]M\s+[A-Z]{2,8})\s+)?Page\s+(\d+)\s+of\s+(\d+)\s*$/i.exec(line.text.trim());
      if(!match)continue;
      const prior=lines[index-1],stamp=match[1]||(strong(prior)&&(!prior.box||prior.box.y>.85)
        &&/^\s*\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[AP]M\s+[A-Z]{2,8}\s*$/i.test(prior.text)?prior.text.trim():null);
      if(stamp)found.push({number:Number(match[2]),count:Number(match[3]),stamp:stamp.replace(/\s+/g,' ').toUpperCase()});
    }
  }
  const unique=[...new Map(found.map(value=>[JSON.stringify(value),value])).values()];
  return unique.length===1?unique[0]:null;
}

export function contractRateContinuation(previousPages,page,identity){
  if(identity.kind!=='unknown'||identity.status==='conflicting'||!previousPages.length)return false;
  const first=previousPages[0];
  if(!first.observations.some(o=>contractRateEvidence(o.lines)?.lines.every(strong)))return false;
  const pages=[...previousPages,page],footers=pages.map(footer),root=footers[0];
  if(!root||root.number!==1||footers.some((value,index)=>!value||value.number!==index+1||value.number>value.count||value.count!==root.count||value.stamp!==root.stamp))return false;
  const refs=previousPages.flatMap(p=>contractRateMatches(p,{rateVocabulary:'loadNumber'}));
  const values=[...new Set(refs.map(match=>match.line.text.slice(match.start,match.end)))];
  if(values.length!==1||refs.some(match=>![match.line,match.labelLine].every(strong)))return false;
  const current=contractRateMatches(page,{rateVocabulary:'loadNumber'});
  if(current.some(match=>match.line.text.slice(match.start,match.end)!==values[0]||![match.line,match.labelLine].every(strong)))return false;
  if(!current.length&&page.observations.some(o=>o.lines.some(line=>labeledReference.test(line.text))))return false;
  if(page.observations.some(o=>o.lines.some((line,index)=>early(line,index)
    &&(/^(?:(?:UNIFORM|STRAIGHT|ORIGINAL)\s+)*(?:BILL\s+OF\s+LADING|PROOF\s+OF\s+DELIVERY|DELIVERY\s+(?:RECEIPT|ORDER)|INVOICE|PACKING\s+(?:LIST|SLIP)|SIGNING\s+CERTIFICATE)\b/i.test(line.text.trim())||heading.test(line.text)))))return false;
  if(previousPages.length===1)return current.length>0&&page.observations.some(o=>o.lines.some(line=>strong(line)&&schedule.test(line.text)));
  // A reference-free last schedule page is linked by an exact consecutive
  // publication footer after the explicitly referenced schedule page.
  return previousPages[1].observations.some(o=>o.lines.some(line=>strong(line)&&schedule.test(line.text)))
    &&page.observations.some(o=>o.lines.some(line=>strong(line)&&/\b(?:BILL\s+TO\s+INFORMATION|DISPATCH\s+INFORMATION)\b/i.test(line.text)));
}
