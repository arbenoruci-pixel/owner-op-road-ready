import {evidenceFor} from './input.js';
import {certificateMatches} from './signingCertificate.js';
import {normalizeValue} from './profiles.js';
import {documentReferences} from './documentReference.js';
import {rateSectionMatches} from './rateConfirmation.js';

const strong=line=>line.confidence===null||line.confidence>=.8;
const refs=documentReferences;

function certificateYear(date,format){
  const normalized=normalizeValue('date',date);
  if(normalized.value)return Number(normalized.value.slice(0,4));
  // A date such as 07/11/2025 has an explicit year even when month/day order
  // is unknown. Validate both calendar interpretations; use only its year.
  const numeric=format==='numeric'&&/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);
  if(!numeric)return null;
  const [,a,b,year]=numeric;
  return [[a,b],[b,a]].some(([month,day])=>normalizeValue('date',`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`).value)?Number(year):null;
}

function nativeDateOrder(pages,year){
  const anchors=[];
  for(const page of pages)for(const role of ['pickup','delivery'])for(const match of rateSectionMatches(page,{rateSection:role,ratePart:'date'})){
    if(match.supportMethod!=='native_stop_block')continue;
    const raw=match.line.text.slice(match.start,match.end),parts=/^(\d{1,2})([/.])(\d{1,2})\2(\d{2}|\d{4})$/.exec(raw);
    if(!parts)continue;
    const a=Number(parts[1]),b=Number(parts[3]),order=a>=1&&a<=12&&b>12&&b<=31?'mdy':b>=1&&b<=12&&a>12&&a<=31?'dmy':null;
    const expanded=parts[4].length===2?`${parts[1]}${parts[2]}${parts[3]}${parts[2]}${year}`:raw;
    if(order&&normalizeValue('date',expanded).value)anchors.push({order,evidence:evidenceFor(page,match.observation,match.line,match.start,match.end)});
  }
  return anchors.length&&new Set(anchors.map(a=>a.order)).size===1?{order:anchors[0].order,evidence:anchors.map(a=>a.evidence)}:null;
}

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
      const date=match.line.text.slice(match.start,match.end),year=certificateYear(date,match.certificateDateFormat);
      if(!year||!strong(match.line)||!strong(match.labelLine)||(match.extraLabelLines||[]).some(line=>!strong(line)))continue;
      anchors.push({year,evidence:evidenceFor(page,match.observation,match.line,match.start,match.end),
        labels:[evidenceFor(page,match.observation,match.labelLine,0,match.labelLine.text.length),
          ...matches.filter(m=>m.observation===match.observation).map(m=>evidenceFor(page,m.observation,m.line,m.start,m.end))]});
    }
  }
  if(!anchors.length||new Set(anchors.map(a=>a.year)).size!==1)return null;
  const order=nativeDateOrder(groupPages,anchors[0].year);
  return {year:anchors[0].year,...(order?{order:order.order}:{}),evidence:[...(order?.evidence||[]),...references.map(r=>evidenceFor(r.page,r.observation,r.line,r.start,r.end)),
    ...anchors.flatMap(a=>[a.evidence,...a.labels])]};
}

export function expandShortYear(raw,context){
  const match=/^(\d{1,2})([/.])(\d{1,2})\2(\d{2}|\d{4})$/.exec(raw.trim());
  if(!match||!context||(match[4].length===2?context.year%100:context.year)!==Number(match[4]))return null;
  if(context.order){
    const [month,day]=context.order==='mdy'?[match[1],match[3]]:[match[3],match[1]];
    return `${context.year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
  }
  return `${match[1]}${match[2]}${match[3]}${match[2]}${context.year}`;
}

export function linkedCertificateContext(pages,rateContexts){
  const references=refs(pages),values=new Set(references.map(r=>r.value));
  if(values.size!==1||references.some(r=>!strong(r.line)))return null;
  const matching=rateContexts.filter(({pages,context})=>context?.order&&refs(pages).some(r=>r.value===references[0].value));
  return matching.length===1?matching[0].context:null;
}
