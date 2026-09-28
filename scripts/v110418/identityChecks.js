// Installed in evidenceCoreV110413: a source-bound human review owns the broker
// assignment. Earlier extraction fields remain source history, not new edits.
export function documentLoadIdentityIssue(doc,resolve=value=>text(value).toUpperCase()) {
  const raw=[doc.load_no,doc.loadNo,doc.canonicalLoadNo,doc.extracted?.loadNo,doc.extracted?.canonicalLoadNo];
  const refs=[...new Set(raw.map(resolve).filter(Boolean))];
  const review=doc.extracted?.evidenceFactsV1;
  const reviewed=isReviewed(doc)&&['driver_review','source_recovery'].includes(review.source);
  const confirmed=reviewed?resolve(review.fields?.loadNo):'';
  const filed=resolve(loadOf(doc));
  if(confirmed) {
    if(filed!==confirmed)return {label:'Check broker load number',detail:`Filed under ${filed||'no load'}; reviewed source says ${confirmed}. Confirm which load owns this file.`};
    // A packet with another reviewed load cannot be treated as a single-load file.
    const componentRefs=[...new Set(list(review.components).filter(c=>c.reviewed===true).map(c=>resolve(c.fields?.loadNo||confirmed)).filter(Boolean))];
    if(componentRefs.some(ref=>ref!==confirmed))return {label:'Document covers more than one load',detail:'Review the packet pages and their broker load numbers.'};
    return null;
  }
  if(refs.length>1&&!doc.repairOverlayApplied)return {label:'Check broker load number',detail:`Saved load numbers: ${refs.join(', ')}. Confirm the broker load number on this document.`};
  return null;
}

export function evidenceFieldLabel(kind,name) {
  if(name==='reference') {
    if(kind==='bol')return 'BOL reference';
    if(kind==='pod')return 'BOL / delivery reference';
    if(kind==='invoice')return 'Invoice number';
  }
  return FIELD_LABELS[name];
}
