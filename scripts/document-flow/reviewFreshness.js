// Document filing can continue while unrelated working records are updated.
// Every selected document/reference must still equal the exact reviewed version.
import {same} from '../../lib/owner-op-cloud/accountCoreV110455.js';
const documentReviewKeys=new Set([
  JSON.stringify(['business-array','documents']),
  JSON.stringify(['state','freightReferencesV110445']),
  JSON.stringify(['state','workspaceReturnViews']),
]);
export function documentReviewStillCurrent(review,local,remote,conflicts,choices){
  if(!review||!conflicts?.length)return false;
  return conflicts.every(c=>documentReviewKeys.has(c.key)&&
    ['local','remote'].includes(choices?.[c.key])&&
    same(review.local?.[c.key],local?.[c.key])&&
    same(review.remote?.[c.key],remote?.[c.key]));
}
