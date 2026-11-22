// Folder and Today interpret the same historical role aliases. A numbered
// delivery in an old manifest may have a sequence in place of a role.
export function stopKind(stop = {}) {
  if (!stop) return '';
  for (const value of [stop.type, stop.role, stop.stopType, stop.stopRole]) {
    const label = String(value ?? '').trim().toLowerCase().replace(/[ _-]+/g, '');
    if (['pickup','shipper','origin'].includes(label)) return 'pickup';
    if (['delivery','drop','dropoff','receiver','consignee','destination'].includes(label)) return 'delivery';
  }
  return Number(stop.deliverySequence || stop.stopSequence || stop.sequence) > 0 ? 'delivery' : '';
}
