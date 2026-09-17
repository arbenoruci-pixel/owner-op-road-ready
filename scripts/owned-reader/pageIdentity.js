import {readDocument,textObservation} from '../../../../packages/smart-reader-core/src/index.js';
import {PROFILES} from '../../../../packages/smart-reader-core/src/profiles.js';

export function extraPageIdentity(text){
  const result=readDocument({documentId:'page-identity',pages:[{id:'page',observations:[textObservation(text)]}]});
  const page=result.pageIdentities[0];
  if(page.kind==='bol')return {typeId:'bol',confidence:page.status==='needs_review'?.49:.8,status:page.status,requiresTypeReview:page.status==='needs_review',reason:'Shipping origin, consigned destination, carrier, weight and BOL terms suggest this type; confirm against the page'};
  if(page.kind==='unloading_receipt')return {typeId:'lumper_receipt',confidence:page.status==='needs_review'?.49:.9,status:page.status,requiresTypeReview:page.status==='needs_review',reason:'Receipt heading, load details and unloading payment fields'};
  if(page.status==='conflicting')return {typeId:'other',confidence:0,status:'conflicting',requiresTypeReview:true,reason:'Conflicting document headings or source readings on this page'};
  const profile=PROFILES.find(p=>p.id===page.kind);
  if(!profile)return null;
  if(page.kind==='invoice')return {typeId:'other',confidence:.49,status:'needs_review',requiresTypeReview:true,reason:'Invoice found. Choose its filing category; freight or carrier evidence was not established.'};
  if(profile.role==='supporting')return {typeId:'other',role:'supporting',confidence:.8,status:page.status,requiresTypeReview:true,reason:profile.label+'; check its relationship to the main document'};
  return {typeId:profile.filingType||profile.id,confidence:page.status==='needs_review'?.49:.85,status:page.status,requiresTypeReview:page.status==='needs_review',reason:profile.label+' heading and document field structure'};
}

// Exact signing references can link attachments. Missing references, OCR
// disagreements and references from another envelope require page review.
export function attachmentRelationship(pages,pageTypes){
  const references=page=>[...new Set(page.reads.flatMap(text=>{
    const lines=String(text).split(/\r?\n/),refs=[];
    for(let i=0;i<lines.length;i++){
      const labeled=/^\s*(?:DOCUMENT REF(?:ERENCE)?|ENVELOPE ID)\s*:\s*([A-Z0-9][A-Z0-9-]{7,})\b/i.exec(lines[i]);
      if(labeled)refs.push(labeled[1].toUpperCase());
      if(/^\s*REF\. NUMBER\s+DOCUMENT COMPLETED BY ALL PARTIES ON\s*$/i.test(lines[i])){
        const value=/^\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)\s+\d/i.exec(lines[i+1]||'');
        if(value)refs.push(value[1].toUpperCase());
      }
    }
    return refs;
  }))];
  const primary=[...new Set(pages.flatMap((page,i)=>pageTypes[i].supporting?[]:references(page)))];
  const unverifiedPages=pages.filter((page,i)=>{
    if(!pageTypes[i].supporting)return false;
    const refs=references(page);return primary.length!==1||refs.length!==1||refs[0]!==primary[0];
  }).map(page=>page.page);
  return {required:unverifiedPages.length>0,unverifiedPages,
    reason:unverifiedPages.length?'Check that signature attachments on pages '+unverifiedPages.join(', ')+' belong to this document. Their signing references are missing or differ; choose a load folder only after checking the pages.':''};
}
