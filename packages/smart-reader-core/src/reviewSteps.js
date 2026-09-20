import {reviewQueue} from './recovery.js';
import {measurementReviewProposal} from './measurementReview.js';

// Keep the field-level queue for storage/audit; combine only the navigation
// steps whose complete, same-page numbers are ready for one human unit choice.
export function reviewSteps(result,{visited=new Set(),canGroup=()=>true}={}){
  const queue=reviewQueue(result).filter(item=>!visited.has(item.groupId+':'+item.key));
  const emitted=new Set();
  return queue.flatMap(item=>{
    if(emitted.has(item.groupId+':'+item.key))return [];
    const group=result.documents.find(group=>group.id===item.groupId);
    const proposal=measurementReviewProposal(group);
    if(proposal?.entries.some(entry=>entry.key===item.key)
      &&proposal.entries.every(entry=>queue.some(q=>q.groupId===item.groupId&&q.key===entry.key))
      &&canGroup(proposal)){
      const keys=proposal.entries.map(entry=>entry.key);
      keys.forEach(key=>emitted.add(item.groupId+':'+key));
      return [{kind:'weights',groupId:item.groupId,keys}];
    }
    return [{...item,kind:'field'}];
  });
}
