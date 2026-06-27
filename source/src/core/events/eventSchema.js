export const DUTY_STATUSES = ['OFF', 'SB', 'D', 'ON'];

export function createEvent(overrides = {}) {
  return {
    id: overrides.id || `ev_${Date.now()}`,
    dayKey: overrides.dayKey || null,
    status: overrides.status || 'OFF',
    startMin: Number(overrides.startMin ?? 0),
    endMin: Number(overrides.endMin ?? 1),
    city: overrides.city || 'GPS',
    state: overrides.state || 'UNK',
    note: overrides.note || '',
    description: overrides.description || '',
    source: overrides.source || 'manual',
    lat: overrides.lat ?? null,
    lng: overrides.lng ?? null,
    locationSource: overrides.locationSource || 'manual',
    createdAt: overrides.createdAt || Date.now(),
    updatedAt: overrides.updatedAt || Date.now(),
    ...overrides,
  };
}
