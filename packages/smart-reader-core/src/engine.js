import {normalizeInput,evidenceFor} from './input.js';
import {PROFILES,normalizeValue} from './profiles.js';

function candidatesFor(pages, spec) {
  const candidates=[];
  for (const page of pages) for (const observation of page.observations) for (const line of observation.lines) {
    const match=spec.pattern.exec(line.text);
    if (!match) continue;
    const [start,end]=match.indices[1];
    const evidence=evidenceFor(page,observation,line,start,end);
    const normalized=normalizeValue(spec.kind,evidence.quote);
    const key=JSON.stringify([normalized.value,normalized.issue,evidence.quote.trim()]);
    let candidate=candidates.find(c=>c.key===key);
    if(!candidate){candidate={key,rawValue:evidence.quote,...normalized,evidence:[]};candidates.push(candidate);}
    candidate.evidence.push(evidence);
  }
  return candidates.map(({key,...candidate})=>candidate);
}

function classifyPage(page) {
  const votes=[];
  for(const observation of page.observations){
    const lines=observation.lines.filter(l=>l.text.trim());
    const text=lines.map(l=>l.text).join('\n');
    for(const profile of PROFILES){
      // A mention inside instructions cannot establish a document heading.
      const title=lines.slice(0,20).find(l=>profile.heading.test(l.text));
      if(title && profile.signals.every(pattern=>pattern.test(text))){
        votes.push({kind:profile.id,evidence:evidenceFor(page,observation,title,0,title.text.length)});
      }
    }
  }
  const kinds=[...new Set(votes.map(v=>v.kind))];
  const references=Object.fromEntries(PROFILES.map(profile=>[profile.id,candidatesFor([page],profile.fields[profile.identity]).filter(c=>c.value!==null).map(c=>c.value)]));
  return {kind:kinds.length===1?kinds[0]:'unknown',status:kinds.length>1?'conflicting':kinds.length?'supported':'unknown',evidence:votes,references};
}

function makeGroups(pages, identities) {
  const groups=[];
  for(let i=0;i<pages.length;i++){
    const page=pages[i],identity=identities[i],previous=groups.at(-1);
    const refs=[...new Set(identity.references[identity.kind]||[])];
    const previousIdentity=previous&&PROFILES.find(p=>p.id===previous.kind);
    const continuationRefs=previousIdentity?[...new Set(identity.references[previousIdentity.id]||[])]:[];
    const partyKeys=previousIdentity?.id==='invoice'?['vendor']:['shipper','consignee'];
    const previousPages=previous?pages.filter(p=>previous.pageIds.includes(p.id)):[];
    const conflictingParties=previousIdentity&&partyKeys.some(key=>{
      const spec=previousIdentity.fields[key];
      const before=candidatesFor(previousPages,spec).map(c=>c.value?.toUpperCase()).filter(Boolean);
      const after=candidatesFor([page],spec).map(c=>c.value?.toUpperCase()).filter(Boolean);
      return before.length&&after.length&&new Set([...before,...after]).size>1;
    });
    // Only an explicit shared ID can join pages. Retries never add pages.
    const canJoin=previous && previous.kind!=='unknown' && identity.status!=='conflicting' && !conflictingParties
      && previous.reference && continuationRefs.length===1 && continuationRefs[0]===previous.reference
      && (identity.kind===previous.kind || identity.kind==='unknown');
    if(canJoin){previous.pageIds.push(page.id);continue;}
    groups.push({id:`document-${groups.length+1}`,kind:identity.kind,pageIds:[page.id],
      reference:refs.length===1?refs[0]:null,
      boundaryReview:i>0 && (identity.kind==='unknown'||!refs.length||identity.kind===previous.kind&&previous.reference===null),
      identityStatus:refs.length>1?'conflicting':identity.status});
  }
  return groups;
}

function extractField(pages, spec) {
  const candidates=candidatesFor(pages,spec);
  const valid=candidates.filter(c=>c.value!==null);
  const values=[...new Set(valid.map(c=>c.value))];
  const issues=[...new Set(candidates.map(c=>c.issue).filter(Boolean))];
  if(values.length>1)issues.push('conflicting_reads');
  if(candidates.some(c=>c.evidence.some(e=>e.recognizerConfidence!==null&&e.recognizerConfidence<.8)))issues.push('weak_recognition');
  if(!candidates.length&&spec.required)issues.push('required_field_missing');
  return {label:spec.label,kind:spec.kind,required:spec.required,
    status:!candidates.length?'missing':issues.length?'needs_review':'supported',
    value:values.length===1&&!issues.length?values[0]:null,candidates,issues};
}

function validateInvoice(fields) {
  const checks=[];
  const amounts=['subtotal','tax','total'].map(k=>fields[k]);
  if(amounts.every(f=>f.value!==null)){
    const [subtotal,tax,total]=amounts.map(f=>normalizeValue('amount',f.value).minorUnits);
    const passed=subtotal+tax===total;
    checks.push({id:'invoice_arithmetic',status:passed?'passed':'needs_review',fields:['subtotal','tax','total']});
    if(!passed) for(const key of ['subtotal','tax','total']){
      fields[key].status='needs_review';fields[key].issues.push('invoice_arithmetic_mismatch');fields[key].value=null;
    }
  }else checks.push({id:'invoice_arithmetic',status:'not_checked',fields:['subtotal','tax','total']});
  return checks;
}

export function readDocument(input) {
  const {documentId,pages}=normalizeInput(input);
  const identities=pages.map(classifyPage);
  const documents=makeGroups(pages,identities).map(group=>{
    const profile=PROFILES.find(p=>p.id===group.kind);
    const groupPages=pages.filter(p=>group.pageIds.includes(p.id));
    const fields=profile?Object.fromEntries(Object.entries(profile.fields).map(([key,spec])=>[key,extractField(groupPages,spec)])):{};
    const checks=group.kind==='invoice'?validateInvoice(fields):[];
    return {...group,label:profile?.label||'Uncategorized document',fields,checks,
      requiresReview:true,canAutoFile:false};
  });
  const result={contractVersion:1,engine:'owned-smart-reader',engineVersion:'0.1.0',documentId,pages,
    pageIdentities:pages.map((p,i)=>({pageId:p.id,...identities[i]})),documents,
    pageCount:pages.length,unreadablePageIds:pages.filter(p=>!p.observations.some(o=>o.lines.some(l=>l.text.trim()))).map(p=>p.id),
    calibration:{status:'not_calibrated',automaticAcceptance:false},reviewRevision:0,corrections:[]};
  return result;
}
