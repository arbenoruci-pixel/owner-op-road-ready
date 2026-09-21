import {confirmDocumentKind} from '../../packages/smart-reader-core/src/recovery.js';

// The core treats selecting the current kind as a no-op. In the host, explicit
// confirmation must also record a weak/current kind so the filing selector can
// distinguish it from an unconfirmed AI/local suggestion. Reuse all of the
// core's document, revision, kind, human-action and source-page validation.
export function confirmReviewedKind(result,request){
  const changed=confirmDocumentKind(result,request);
  if(changed!==result)return changed;
  const group=result.documents.find(item=>item.id===request.groupId);
  if(group.typeCorrection?.confirmed)return result;
  const next=structuredClone(result),updated=next.documents.find(item=>item.id===request.groupId);
  const page=result.pages.find(item=>item.id===request.pageId);
  updated.identityStatus='confirmed';updated.requiresReview=true;updated.canAutoFile=false;
  updated.typeCorrection={kind:request.kind,sourcePage:{pageId:page.id,pageNumber:page.number,sourceImageId:request.sourceImageId,boxScope:'page'},origin:'human',confirmed:true,trainingEligible:false};
  next.reviewRevision++;
  return next;
}
