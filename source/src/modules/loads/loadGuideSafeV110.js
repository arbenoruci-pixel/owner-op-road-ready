function text(value = '') {
  return String(value ?? '').trim();
}

export function safeTextListV110(value = []) {
  if (Array.isArray(value)) return value.map(item => text(item)).filter(Boolean);
  if (typeof value === 'string' || typeof value === 'number') {
    const one = text(value);
    return one ? [one] : [];
  }
  if (value && typeof value === 'object') {
    return Object.values(value).map(item => text(item)).filter(Boolean);
  }
  return [];
}

export function safeObjectListV110(value = []) {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
  if (value && typeof value === 'object') return Object.values(value).filter(item => item && typeof item === 'object');
  return [];
}

export function normalizeDriverGuideV110(guide = null) {
  if (!guide || typeof guide !== 'object') return null;
  const steps = safeObjectListV110(guide.steps).map((step, index) => ({
    ...step,
    id:text(step.id) || `guide_step_${index + 1}`,
    kind:text(step.kind) || 'manual',
    title:text(step.title) || 'Driver step',
    detail:text(step.detail),
    checklist:safeTextListV110(step.checklist),
  }));
  const stops = safeObjectListV110(guide.stops).map((stop, index) => ({
    ...stop,
    id:text(stop.id) || `guide_stop_${index + 1}`,
    type:stop.type === 'pickup' ? 'pickup' : 'delivery',
    sequence:Number.isFinite(Number(stop.sequence)) ? Number(stop.sequence) : index,
  }));
  return {
    ...guide,
    id:text(guide.id) || `load_guide_${text(guide.loadNo || guide.orderNo || Date.now())}`,
    loadNo:text(guide.loadNo),
    orderNo:text(guide.orderNo),
    origin:text(guide.origin),
    destination:text(guide.destination),
    steps,
    stops,
    manualDone:guide.manualDone && typeof guide.manualDone === 'object' && !Array.isArray(guide.manualDone) ? guide.manualDone : {},
    completedStopIds:safeTextListV110(guide.completedStopIds),
    documents:guide.documents && typeof guide.documents === 'object' && !Array.isArray(guide.documents) ? guide.documents : {},
  };
}
