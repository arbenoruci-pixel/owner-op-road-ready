import { resolveChecklistEvidenceV110321 } from './checklistEvidenceV110321.js';

// Mission uses driver confirmations and current load documents. Pass only guide
// identity to the shared document resolver so duty events and logbook summaries
// cannot mark requirements complete or reappear as completion evidence.
export function resolveLoadGuideV110325(state = {}, guide = null, store = {}) {
  const progress = resolveChecklistEvidenceV110321(
    { loadGuidesById:state.loadGuidesById },
    guide,
    { ...store, documents:Array.isArray(store.documents) ? store.documents : [] },
  );
  const navigationSteps = progress.steps.filter(step => step.kind === 'route');
  const steps = progress.steps.filter(step => step.kind !== 'route');
  const completed = steps.filter(step => step.complete).length;
  const total = steps.length;
  const currentStep = steps.find(step => !step.complete) || null;
  return {
    ...progress,
    guide:progress.guide ? {...progress.guide, steps} : null,
    navigationSteps, steps, completed, total, currentStep,
    percent:total ? Math.round(completed / total * 100) : 0,
    complete:total > 0 && completed === total,
    currentStopSequence:Number(currentStep?.stopSequence || 0),
  };
}
