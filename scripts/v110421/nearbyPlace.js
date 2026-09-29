import places from './censusPlacesV110421.js';

export function nearestCensusPlace(lat, lng, {state = '', maxMiles = 15} = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const radians = Math.PI / 180, latitudeWindow = maxMiles / 69 + 0.01;
  let best = null, miles = maxMiles;
  for (const [y, x, st, city] of places) {
    if (y < lat - latitudeWindow) continue;
    if (y > lat + latitudeWindow) break;
    if (state && st !== state) continue;
    const a = Math.sin((y-lat)*radians/2)**2 + Math.cos(lat*radians)*Math.cos(y*radians)*Math.sin((x-lng)*radians/2)**2;
    const distance = 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
    if (distance <= miles) { miles = distance; best = {city, state:st, distanceMiles:Math.round(distance*100)/100, source:'offline-nearest-city-census', approximate:true}; }
  }
  return best;
}
