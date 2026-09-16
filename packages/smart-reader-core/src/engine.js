import {normalizeInput,evidenceFor} from './input.js';
import {PROFILES,normalizeValue} from './profiles.js';
import {validateInvoice,validateUnloadingReceipt} from './validation.js';
import {pageFieldMatches} from './identifierChecks.js';
import {profileEvidence} from './classification.js';
import {partyKey} from './partyEvidence.js';

// Fold cosmetic corporate commas, preserving word and identifier boundaries.
const semanticKey=(kind,value)=>kind==='party'?partyKey(value):String(value||'');

function candidatesFor(pages, spec) {
  const candidates=[];
  for (const page of pages) for (const match of pageFieldMatches(page,spec)) {
    const {observation,line,start,end}=match;
    const evidence=evidenceFor(page,observation,line,start,end);
    const normalized=normalizeValue(spec.kind,match.joinedValue??evidence.quote,match.labelLine?.text??line.text.slice(0,start));
    if(match.issue&&!normalized.issue)normalized.issue=match.issue;
    const key=JSON.stringify([normalized.value,normalized.issue==='layout_needs_review'?null:normalized.issue||null,evidence.quote.trim()]);
    let candidate=candidates.find(c=>c.key===key);
    if(!candidate){candidate={key,rawValue:evidence.quote,...normalized,evidence:[]};candidates.push(candidate);}
    if(normalized.issue&&!candidate.issue)candidate.issue=normalized.issue;
    candidate.evidence.push({...evidence,...(normalized.issue?{matchIssue:normalized.issue}:{})});
    if(match.continuation){const tail=match.continuation;candidate.continuationEvidence??=[];candidate.continuationEvidence.push(evidenceFor(page,observation,tail.line,tail.start,tail.end));}
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
  const supportedValues=new Set(valid.filter(c=>c.evidence.some(e=>!e.matchIssue&&(e.recognizerConfidence===null||e.recognizerConfidence>=.8))).map(c=>semanticKey(spec.kind,c.value)));
  const values=[...new Set(valid.map(c=>semanticKey(spec.kind,c.value)))];
  const issues=[...new Set(candidates.map(c=>c.issue==='layout_needs_review'&&supportedValues.has(semanticKey(spec.kind,c.value))?null:c.issue).filter(Boolean))];
  if(values.length>1)issues.push('conflicting_reads');
  if(candidates.some(c=>!supportedValues.has(semanticKey(spec.kind,c.value))&&[...c.evidence,...(c.labelEvidence||[])].some(e=>e.recognizerConfidence!==null&&e.recognizerConfidence<.8)))issues.push('weak_recognition');
  if(!candidates.length&&spec.required)issues.push('required_field_missing');
  const uniqueIssues=[...new Set(issues)];
  const supportedCandidates=valid.filter(c=>supportedValues.has(semanticKey(spec.kind,c.value)));
  const chosen=values.length===1&&supportedCandidates.length?supportedCandidates[0]:null;
  return {label:spec.label,kind:spec.kind,required:spec.required,status:!candidates.length?'missing':uniqueIssues.length?'needs_review':chosen?'supported':'needs_review',value:chosen&&!uniqueIssues.length?chosen.value:null,candidates,issues:uniqueIssues};
}

export function fieldsForProfile(pages,kind) {const profile=PROFILES.find(p=>p.id===kind);return profile?Object.fromEntries(Object.entries(profile.fields).map(([key,spec])=>[key,extractField(pages,spec)])):{};}

export function readDocument(input) {
  const {documentId,pages}=normalizeInput(input),identities=pages.map(classifyPage);
  const documents=makeGroups(pages,identities).map(group=>{const profile=PROFILES.find(p=>p.id===group.kind),groupPages=pages.filter(p=>group.pageIds.includes(p.id)),fields=fieldsForProfile(groupPages,group.kind),checks=group.kind==='invoice'?validateInvoice(fields):group.kind==='unloading_receipt'?validateUnloadingReceipt(fields):[];return {...group,label:profile?.label||'Uncategorized document',fields,checks,requiresReview:true,canAutoFile:false};});
  return {contractVersion:1,engine:'owned-smart-reader',engineVersion:'0.3.11',documentId,pages,pageIdentities:pages.map((p,i)=>({pageId:p.id,...identities[i]})),documents,pageCount:pages.length,unreadablePageIds:pages.filter(p=>!p.observations.some(o=>o.lines.some(l=>l.text.trim()))).map(p=>p.id),calibration:{status:'not_calibrated',automaticAcceptance:false},reviewRevision:0,corrections:[]};
}
