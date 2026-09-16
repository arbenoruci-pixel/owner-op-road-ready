// Presentation only: choosing the clearest source never changes field status.
export function clearestEvidence(evidence,isAvailable=()=>true){
  return [...evidence].sort((a,b)=>Number(isAvailable(b))-Number(isAvailable(a))
    ||Number(Boolean(b.box))-Number(Boolean(a.box))
    ||Number(Boolean(a.matchIssue))-Number(Boolean(b.matchIssue))
    ||(b.recognizerConfidence??-1)-(a.recognizerConfidence??-1))[0];
}

export function clearestCandidate(candidates,isAvailable){
  const choices=candidates.filter(candidate=>candidate.issue!=='form_instructions').map(candidate=>({candidate,evidence:clearestEvidence(candidate.evidence,isAvailable)})).filter(choice=>choice.evidence);
  const best=clearestEvidence(choices.map(choice=>choice.evidence),isAvailable);
  return choices.find(choice=>choice.evidence===best);
}
