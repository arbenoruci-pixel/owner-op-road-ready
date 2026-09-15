import {normalizeInput,evidenceFor} from './input.js';
import {PROFILES,normalizeValue} from './profiles.js';
import {validateInvoice,validateUnloadingReceipt} from './validation.js';
import {pageFieldMatches} from './identifierChecks.js';
import {profileEvidence} from './classification.js';

const partyKey=value=>String(value||'').toUpperCase().replace(/[^\p{L}\p{N}]+/gu,'');
const semanticKey=(kind,value)=>kind==='party'?partyKey(value):String(value||'');
const strongEvidence=c=>c.evidence.some(e=>!e.matchIssue&&(e.recognizerConfidence===null||e.recognizerConfidence>=.8));
const evidenceScore=c=>c.evidence.reduce((score,e)=>score+(e.matchIssue?0:.35)+(e.recognizerConfidence??.5),0);
const streetParty=value=>/^\s*(?:P\.?\s*O\.?\s+BOX\s+\d|\d+[A-Z]?(?:[-/]\d+)?\s+(?:\S+\s+){0,8}(?:ROAD|STREET|AVENUE|BOULEVARD|DRIVE|LANE|COURT|CIRCLE|TERRACE|PLACE|PARKWAY|HIGHWAY|WAY|TRAIL|LOOP|PIKE|PLAZA|SQUARE|RD|ST|AVE|BLVD|DR|LN|CT|CIR|TER|PL|PKWY|HWY|TRL|PLZ|SQ)\b)/i.test(value||'');

function candidatesFor(pages, spec) {
  const candidates=[];
  for (const page of pages) for (const match of pageFieldMatches(page,spec)) {
    const {observation,line,start,end}=match;
    const evidence=evidenceFor(page,observation,line,start,end);
    const normalized=normalizeValue(spec.kind,evidence.quote);
    if(match.issue&&!normalized.issue)normalized.issue=match.issue;
    const key=JSON.stringify([normalized.value,normalized.issue==='layout_needs_review'?null:normalized.issue||null,evidence.quote.trim()]);
    let candidate=candidates.find(c=>c.key===key);
    if(!candidate){candidate={key,rawValue:evidence.quote,...normalized,evidence:[]};candidates.push(candidate);}
    if(normalized.issue&&!candidate.issue)candidate.issue=normalized.issue;
    candidate.evidence.push({...evidence,...(normalized.issue?{matchIssue:normalized.issue}:{})});
    if(match.labelLine){candidate.labelEvidence??=[];candidate.labelEvidence.push(evidenceFor(page,observation,match.labelLine,0,match.labelLine.text.length));}
  }
  return candidates.map(({key,...candidate})=>candidate);
}

function classifyPage(page) {
  const votes=[];
  for(const observation of page.observations){
    const lines=observation.lines.filter(l=>l.text.trim());
    for(const profile of PROFILES){
      const support=profileEvidence(lines,profile);
      if(support){const evidence=support.lines.map(line=>evidenceFor(page,observation,line,0,line.text.length));votes.push({kind:profile.id,method:support.method,evidence:evidence[0],supportingEvidence:evidence.slice(1)});}
    }
  }
  const origins=new Map(page.observations.flatMap(observation=>observation.lines.map(line=>[line,observation]))),pooled=[...origins.keys()];
  const lineIndices=new Map(page.observations.flatMap(observation=>observation.lines.map((line,index)=>[line,index])));
  for(const profile of PROFILES){
    if(votes.some(vote=>vote.kind===profile.id))continue;
    const support=profileEvidence(pooled,profile,{lineIndices});if(!support)continue;
    const evidence=support.lines.map(line=>evidenceFor(page,origins.get(line),line,0,line.text.length));
    votes.push({kind:profile.id,method:'combined_observations',evidence:evidence[0],supportingEvidence:evidence.slice(1)});
  }
  const kinds=[...new Set(votes.map(v=>v.kind))];
  const references=Object.fromEntries(PROFILES.map(profile=>{const field=extractField([page],profile.fields[profile.identity]);return [profile.id,field.status==='supported'&&field.value!==null?[field.value]:[]];}));
  return {kind:kinds.length===1?kinds[0]:'unknown',status:kinds.length>1?'conflicting':kinds.length?votes.some(v=>v.method==='heading')?'supported':'needs_review':'unknown',evidence:votes,references};
}

function makeGroups(pages, identities) {
  const groups=[];
  for(let i=0;i<pages.length;i++){
    const page=pages[i],identity=identities[i],previous=groups.at(-1),refs=[...new Set(identity.references[identity.kind]||[])];
    const previousIdentity=previous&&PROFILES.find(p=>p.id===previous.kind),continuationRefs=previousIdentity?[...new Set(identity.references[previousIdentity.id]||[])]:[];
    const partyKeys=previousIdentity?.partyKeys||[],previousPages=previous?pages.filter(p=>previous.pageIds.includes(p.id)):[];
    const conflictingParties=previousIdentity&&partyKeys.some(key=>{const spec=previousIdentity.fields[key];const before=candidatesFor(previousPages,spec).map(c=>semanticKey(spec.kind,c.value)).filter(Boolean),after=candidatesFor([page],spec).map(c=>semanticKey(spec.kind,c.value)).filter(Boolean);return before.length&&after.length&&new Set([...before,...after]).size>1;});
    const canJoin=previous&&previousIdentity?.joinPages!==false&&previous.kind!=='unknown'&&identity.status!=='conflicting'&&!conflictingParties&&previous.reference&&continuationRefs.length===1&&continuationRefs[0]===previous.reference&&(identity.kind===previous.kind||identity.kind==='unknown');
    if(canJoin){previous.pageIds.push(page.id);continue;}
    groups.push({id:`document-${groups.length+1}`,kind:identity.kind,pageIds:[page.id],reference:refs.length===1?refs[0]:null,boundaryReview:i>0&&(identity.kind==='unknown'||!refs.length||identity.kind===previous.kind&&previous.reference===null),identityStatus:refs.length>1?'conflicting':identity.status});
  }
  return groups;
}

function extractField(pages, spec) {
  const candidates=candidatesFor(pages,spec),valid=candidates.filter(c=>c.value!==null);
  const groups=new Map();
  for(const candidate of valid){const key=semanticKey(spec.kind,candidate.value);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(candidate);}
  const strongGroups=[...groups.entries()].filter(([,items])=>items.some(strongEvidence));
  const issues=[...new Set(candidates.map(c=>c.issue==='layout_needs_review'&&strongGroups.some(([,items])=>items.includes(c))?null:c.issue).filter(Boolean))];
  let chosen=null;
  if(strongGroups.length===1){
    const [key,items]=strongGroups[0];
    chosen=[...items].sort((a,b)=>evidenceScore(b)-evidenceScore(a)||String(b.value).length-String(a.value).length)[0];
    const competing=valid.filter(c=>semanticKey(spec.kind,c.value)!==key);
    const meaningful=competing.filter(c=>strongEvidence(c)||!(spec.kind==='party'&&streetParty(c.value)));
    if(meaningful.length)issues.push('conflicting_reads');
  } else if(strongGroups.length>1)issues.push('conflicting_reads');
  if(!chosen&&valid.length===1&&strongEvidence(valid[0]))chosen=valid[0];
  if(candidates.some(c=>!strongEvidence(c)&&[...c.evidence,...(c.labelEvidence||[])].some(e=>e.recognizerConfidence!==null&&e.recognizerConfidence<.8)&&(!chosen||semanticKey(spec.kind,c.value)===semanticKey(spec.kind,chosen.value))))issues.push('weak_recognition');
  if(!candidates.length&&spec.required)issues.push('required_field_missing');
  const uniqueIssues=[...new Set(issues)];
  return {label:spec.label,kind:spec.kind,required:spec.required,status:!candidates.length?'missing':chosen&&!uniqueIssues.length?'supported':'needs_review',value:chosen&&!uniqueIssues.length?chosen.value:null,candidates,issues:uniqueIssues};
}

export function fieldsForProfile(pages,kind) {const profile=PROFILES.find(p=>p.id===kind);return profile?Object.fromEntries(Object.entries(profile.fields).map(([key,spec])=>[key,extractField(pages,spec)])):{};}

export function readDocument(input) {
  const {documentId,pages}=normalizeInput(input),identities=pages.map(classifyPage);
  const documents=makeGroups(pages,identities).map(group=>{const profile=PROFILES.find(p=>p.id===group.kind),groupPages=pages.filter(p=>group.pageIds.includes(p.id)),fields=fieldsForProfile(groupPages,group.kind),checks=group.kind==='invoice'?validateInvoice(fields):group.kind==='unloading_receipt'?validateUnloadingReceipt(fields):[];return {...group,label:profile?.label||'Uncategorized document',fields,checks,requiresReview:true,canAutoFile:false};});
  return {contractVersion:1,engine:'owned-smart-reader',engineVersion:'0.3.10',documentId,pages,pageIdentities:pages.map((p,i)=>({pageId:p.id,...identities[i]})),documents,pageCount:pages.length,unreadablePageIds:pages.filter(p=>!p.observations.some(o=>o.lines.some(l=>l.text.trim()))).map(p=>p.id),calibration:{status:'not_calibrated',automaticAcceptance:false},reviewRevision:0,corrections:[]};
}
