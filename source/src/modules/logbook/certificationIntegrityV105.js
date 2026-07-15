function realStoredEvents(events = []) {
  return (Array.isArray(events) ? events : []).filter(event => {
    if (!event || event.voided) return false;
    if (event.syntheticCoverage || event.displayOnly || event.carriedFromPreviousDay) return false;
    return Number(event.endMin || 0) > Number(event.startMin || 0);
  });
}

export function normalizeCompletedDayCertificationV105(certifyStatus = {}, signatureByDay = {}, eventsByDay = {}, today = '') {
  const next = { ...(certifyStatus || {}) };
  Object.keys(eventsByDay || {}).forEach(day => {
    if (!day || !today || day >= today) return;
    if (!realStoredEvents(eventsByDay?.[day]).length) return;
    const signed = !!signatureByDay?.[day]?.signed;
    const current = String(next[day] || '').trim();
    if (signed && (!current || /active\s+day|not\s+certified/i.test(current))) {
      next[day] = 'Certified';
      return;
    }
    if (!signed && (!current || /active\s+day|not\s+certified/i.test(current))) {
      next[day] = 'Needs signature';
    }
  });
  return next;
}
