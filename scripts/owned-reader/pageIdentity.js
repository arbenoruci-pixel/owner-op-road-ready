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
  if(profile.role==='supporting')return {typeId:'other',role:'supporting',confidence:.8,status:page.status,requiresTypeReview:true,reason:profile.label+'; check its relationship to the main document'};
  return {typeId:profile.filingType||profile.id,confidence:page.status==='needs_review'?.49:.85,status:page.status,requiresTypeReview:page.status==='needs_review',reason:profile.label+' heading and document field structure'};
}
