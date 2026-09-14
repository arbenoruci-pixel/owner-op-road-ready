import {readDocument,textObservation} from '../../../../packages/smart-reader-core/src/index.js';

export function extraPageIdentity(text){
  const result=readDocument({documentId:'page-identity',pages:[{id:'page',observations:[textObservation(text)]}]});
  const page=result.pageIdentities[0];
  if(page.kind==='bol')return {typeId:'bol',confidence:page.status==='needs_review'?.49:.8,status:page.status,requiresTypeReview:page.status==='needs_review',reason:'Shipping origin, consigned destination, carrier, weight and BOL terms suggest this type; confirm against the page'};
  if(page.kind==='unloading_receipt')return {typeId:'lumper_receipt',confidence:.9,reason:'Receipt heading, load details and unloading payment fields'};
  return null;
}
