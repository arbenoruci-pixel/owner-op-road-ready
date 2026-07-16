function text(value = '') {
  return String(value || '').trim();
}

function unique(values = []) {
  const seen = new Set();
  return values.filter(Boolean).filter(value => {
    const key = text(value.label || value).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function homeModeV1038(guide = null, activeLoad = null) {
  if (guide && String(guide.status || 'active').toLowerCase() !== 'completed') return 'active_load';
  if (activeLoad && text(activeLoad.loadNo || activeLoad.id)) return 'active_load';
  return 'no_load';
}

export function rateConInstructionRowsV1038(guide = {}) {
  const r = guide.requirements || {};
  const rows = [];
  if (r.trackingProvider || guide.trackingProvider) rows.push({
    id:'tracking',
    label:`${r.trackingProvider || guide.trackingProvider} tracking`,
    detail:r.trackingRequired ? 'Required for the full trip' : 'Keep tracking connected',
    tone:r.trackingRequired ? 'required' : 'normal',
  });
  if (r.preCoolTemperature) rows.push({ id:'precool', label:`Pre-cool ${r.preCoolTemperature}°F`, detail:'Confirm before loading', tone:'required' });
  if (r.temperaturePerBol) rows.push({ id:'temperature', label:'Temperature per BOL', detail:'Verify the reefer setting at every stop', tone:'required' });
  if (r.trailerCleanRequired) rows.push({ id:'clean', label:'Trailer clean', detail:'Clean and sanitary before loading', tone:'required' });
  if (r.trailerDamageFreeRequired) rows.push({ id:'damage', label:'Damage-free trailer', detail:'Document damage before pickup', tone:'required' });
  if (r.driverLicenseRequired) rows.push({ id:'license', label:'Driver license', detail:'Bring valid license to check-in', tone:'normal' });
  if (r.hiVisRequired) rows.push({ id:'hivis', label:'Class 2 hi-vis', detail:'Wear at the facility', tone:'normal' });
  if (r.detentionTimesRequired) rows.push({ id:'detention', label:'Signed in/out times', detail:'Needed for detention', tone:'required' });
  if (r.sealRecordRequired) rows.push({ id:'seal', label:'Continuous seal record', detail:'Verify and sign every reseal', tone:'required' });
  if (r.osdCallBeforeLeaving) rows.push({ id:'osd', label:'OS&D call before leaving', detail:'Do not leave receiver before reporting shortages or damage', tone:'required' });
  if (r.checkCallsRequired) rows.push({ id:'calls', label:'Broker check calls', detail:'Complete the required check-in schedule', tone:'required' });
  if (r.paperworkDeadlineHours) rows.push({ id:'paperwork', label:`Paperwork within ${r.paperworkDeadlineHours}h`, detail:'Send POD and receipts before the deadline', tone:'required' });
  if (guide.pickupNumber) rows.push({ id:'pickup', label:`Pickup # ${guide.pickupNumber}`, detail:'Use at shipper check-in', tone:'normal' });
  if (guide.legNo) rows.push({ id:'leg', label:`Leg # ${guide.legNo}`, detail:'Keep with the order reference', tone:'normal' });
  return unique(rows);
}

export function missionSnapshotV1038(progress = {}, activeLoad = null) {
  const guide = progress.guide || null;
  const steps = Array.isArray(progress.steps) ? progress.steps : [];
  const incomplete = steps.filter(step => !step.complete);
  const currentStep = progress.currentStep || incomplete[0] || null;
  const deliveryStops = (guide?.stops || []).filter(stop => stop.type === 'delivery');
  const currentSequence = Number(currentStep?.stopSequence || activeLoad?.currentStop || 0);
  const currentStop = currentSequence > 0 ? deliveryStops[currentSequence - 1] || null : null;
  const nextSteps = incomplete.filter(step => step.id !== currentStep?.id).slice(0, 3);
  const instructionRows = rateConInstructionRowsV1038(guide || {});
  const stepChecklist = (currentStep?.checklist || []).map((item, index) => ({ id:`step_${index}`, label:text(item), detail:'Current step', tone:'required' }));
  return {
    guide,
    currentStep,
    currentStop,
    nextSteps,
    instructions:unique([...stepChecklist, ...instructionRows]).slice(0, 6),
    percent:Number(progress.percent || 0),
    completed:Number(progress.completed || 0),
    total:Number(progress.total || steps.length || 0),
  };
}
