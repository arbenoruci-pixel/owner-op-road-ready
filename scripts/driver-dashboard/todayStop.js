import { stopKind } from './stopKind.js';

const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

function stopAddress(stop) {
  const locality = text(stop.cityState) || [stop.city, stop.state].map(text).filter(Boolean).join(', ');
  let address = text(stop.address) || text(stop.street);
  if (!address) return { display: locality, routable: false };
  // Older imports can put a city in the address slot. Route only when both
  // a numbered street and an independently recognizable locality are present.
  const hasStreet = /^\d+[A-Z]?(?:[-/]\d+)?\s+[A-Za-z0-9][^,]*[A-Za-z]/i.test(address);
  const cityState = /[A-Za-z][A-Za-z .'’-]+,?\s+[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/;
  const addressParts = address.split(/,|\n/).map(text).filter(Boolean);
  const hasLocality = addressParts.length >= 2 && cityState.test(addressParts.slice(1).join(', '));
  const separateLocality = cityState.test(locality) && !/^\d/.test(locality);
  if (hasStreet && separateLocality && !hasLocality && !address.toLowerCase().includes(locality.toLowerCase())) {
    address += ', ' + locality;
  }
  if (hasStreet && stop.zip && !address.includes(String(stop.zip))) address += ' ' + stop.zip;
  return { display: address, routable: hasStreet && (hasLocality || separateLocality) };
}

export function todayStop(current, record, snapshot) {
  if (!current) return null;
  const step = snapshot?.currentStep;
  if (current.guide && (!step || step.phase === 'closeout' || step.id === 'final_pod')) return null;
  const isDelivery = record?.operationalStatus === 'in_transit' || record?.status === 'in_transit' || current.recorded;
  const kind = isDelivery ? 'delivery' : 'pickup';
  const savedStops = Array.isArray(record?.stops) ? record.stops : [];
  const candidates = savedStops.filter(stop => stopKind(stop) === kind);
  // Without a guide or a recorded sequence, several delivery locations have no reliable next stop.
  if (!current.guide && (candidates.length > 1 || isDelivery && (
    Number(record?.deliveryCount) > 1 || savedStops.some(stop => !stopKind(stop))
  ))) return null;
  const fallbackPlace = text(isDelivery ? current.destination : current.origin);
  const fallback = {
    type: kind, address: text(isDelivery ? record?.deliveryAddress : record?.pickupAddress) || fallbackPlace,
    cityState: /^\d/.test(fallbackPlace) ? '' : fallbackPlace,
    pickupNumber: record?.pickupNumber || record?.pickupReference,
    deliveryReference: record?.deliveryReference || record?.deliveryNumber,
    date: isDelivery ? record?.deliveryDate : record?.pickupDate,
    time: isDelivery ? record?.deliveryTime : record?.pickupTime,
  };
  const stop = current.guide ? snapshot?.currentStop : candidates[0] || fallback;
  if (!stop) return null;
  const address = stopAddress(stop);
  const company = text(stop.company || stop.facility || stop.name);
  const appointment = text(stop.appointment) || [stop.appointmentDate || stop.date, stop.appointmentTime || stop.time].map(text).filter(Boolean).join(' ');
  const scheduledDayOnly = !text(stop.appointmentTime || stop.time) && /^\d{4}-\d{2}-\d{2}$/.test(appointment);
  const zone = text(stop.timeZone || stop.timezone || stop.timeZoneLabel);
  const deliveries = (current.guide?.stops || savedStops).filter(s => stopKind(s) === 'delivery');
  const index = stopKind(stop) === 'delivery' ? deliveries.findIndex(s => s === stop || (s.id && s.id === stop.id)) : -1;
  const pickup = (stopKind(stop) || kind) === 'pickup';
  const ref = pickup ? text(stop.pickupNumber || stop.pickupReference || stop.pickupNo || current.guide?.pickupNumber)
    : text(stop.poNumber || stop.deliveryReference || stop.deliveryNumber || stop.reference);
  const refLabel = pickup ? 'Pickup # ' : stop.poNumber ? 'PO # ' : 'Delivery # ';
  return {
    label: !pickup ? (index >= 0 && deliveries.length > 1 ? 'Delivery ' + (index + 1) + ' of ' + deliveries.length : 'Delivery') : 'Pickup',
    company: /^(pickup|delivery)$/i.test(company) ? '' : company, address,
    appointment, scheduledDayOnly, zone, reference: ref ? refLabel + ref : '',
  };
}
