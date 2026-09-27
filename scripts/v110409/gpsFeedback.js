export const gpsHasPlace = fix => !!fix && !!String(fix.city || '').trim() && !/^(GPS|unknown)$/i.test(fix.city) && /^[A-Z]{2}$/.test(fix.state || '') && !['UN','NA'].includes(fix.state);
export function gpsFixMessage(fix) {
  if (!gpsHasPlace(fix)) return 'Position found, but the city is unavailable. Enter City, ST or retry GPS.';
  const nearby = String(fix.source || '').includes('nearest-city');
  const distance = nearby && Number.isFinite(fix.distanceMiles) ? ` · ${fix.distanceMiles.toFixed(1)} mi from city center` : '';
  const precision = Number.isFinite(fix.accuracy) ? ` · ±${Math.round(fix.accuracy)} m` : '';
  return `${nearby ? 'Nearby city — confirm location' : 'GPS found'} · ${fix.city}, ${fix.state}${distance}${precision}`;
}
export function gpsErrorMessage(error) {
  if (error?.code === 1) return 'Location permission is off. Allow location for this site in browser settings, then retry GPS.';
  if (error?.code === 3 || /timed? out|timeout/i.test(error?.message || '')) return 'Location took too long. Retry GPS or enter City, ST.';
  if (error?.code === 'GPS_ACCURACY') return `GPS is approximate${Number.isFinite(error.accuracy) ? ` (±${Math.round(error.accuracy)} m)` : ''}. Enable precise location, retry GPS or enter City, ST.`;
  return 'Could not get a position. Retry GPS or enter City, ST.';
}
