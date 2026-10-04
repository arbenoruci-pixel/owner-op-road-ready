// Repair only the legacy self-linked pickup created from a delivery-only event.
// Retain the original metadata and leave certified days and all events untouched.
export function repairUnloadingPickups(routes = {}, state = {}) {
  const index = new Map();
  for (const [day, events] of Object.entries(state.eventsByDay || {}))
    for (const event of events || []) if (event.id) index.set(event.id, {day,event});
  const protectedDay = day => state.signatureByDay?.[day]?.signed || state.certifyStatus?.[day] === 'Certified';
  return Object.fromEntries(Object.entries(routes).map(([day, rows]) => [day, rows.map(leg => {
    if (!leg.pickupEventId || leg.pickupEventId !== leg.deliveryEventId || leg.source !== 'pickup_event') return leg;
    const entry = index.get(leg.deliveryEventId);
    if (!entry || entry.event.status !== 'ON' || [day,entry.day,leg.pickupDay,leg.deliveryDay].some(protectedDay)) return leg;
    const activity = [entry.event.note, ...(entry.event.reasons || [])].filter(Boolean).join(' ');
    if (!/\b(?:delivery|unloading|delivered)\b/i.test(activity) || /\b(?:pickup|pick\s+up|loading)\b/i.test(activity)) return leg;
    if (String(leg.fromCity||'').trim().toLowerCase() !== String(leg.toCity||'').trim().toLowerCase() || leg.fromState !== leg.toState) return leg;
    return {...leg, pickupEventId:'',pickupDay:'',pickupMin:null,pickedUpLoadNo:'',fromCity:'',fromState:'',fromFacility:'',source:'delivery_event',
      unloadingPickupRepairV110444:{pickupEventId:leg.pickupEventId,pickupDay:leg.pickupDay,pickupMin:leg.pickupMin,pickedUpLoadNo:leg.pickedUpLoadNo,fromCity:leg.fromCity,fromState:leg.fromState,fromFacility:leg.fromFacility,source:leg.source}};
  })]));
}
