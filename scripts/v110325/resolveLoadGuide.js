import { resolveChecklistEvidenceV110321 } from './checklistEvidenceV110321.js';

// Mission uses driver confirmations and current load documents. Pass only guide
// identity to the shared document resolver so duty events and logbook summaries
// cannot mark requirements complete or reappear as completion evidence.
export function resolveLoadGuideV110325(state = {}, guide = null, store = {}) {
  return resolveChecklistEvidenceV110321(
    { loadGuidesById:state.loadGuidesById },
    guide,
    { ...store, documents:Array.isArray(store.documents) ? store.documents : [] },
  );
}
