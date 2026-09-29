import {nearestCensusPlace} from './nearbyPlaceV110421.js';

const clean = value => String(value || '').replace(/\s+(city|town|village|borough|municipality|CDP)$/i, '').trim();
const first = (geographies, keys) => keys.map(key=>geographies?.[key]?.[0]).find(Boolean);
export function censusPlace(payload, lat, lng) {
  const geo = payload?.result?.geographies || {};
  const place = first(geo, ['Incorporated Places','Census Designated Places']);
  const stateRow = first(geo, ['States']);
  const subdivision = first(geo, ['County Subdivisions']);
  const state = String(place?.STUSAB || stateRow?.STUSAB || subdivision?.STUSAB || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) return null;
  const city = clean(place?.BASENAME || place?.NAME);
  if (city) return {city, state, source:'us-census-geocoder', approximate:false};
  // Outside a municipality, use a nearby actual place in the confirmed state.
  // Administrative county subdivisions must never be relabeled as cities.
  return nearestCensusPlace(lat, lng, {state}) || {city:'', state, source:'us-census-state-only'};
}

export async function reverseGpsLookup(rawLat, rawLng, {fetchImpl = fetch, signal, timeoutMs = 4000, warn = console.warn} = {}) {
  const lat = typeof rawLat === 'string' && rawLat.trim() ? Number(rawLat) : NaN;
  const lng = typeof rawLng === 'string' && rawLng.trim() ? Number(rawLng) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 18 || lat > 72 || lng < -180 || lng > -60) return {status:400, body:{error:'Invalid U.S. coordinates'}};
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) return {status:499, body:{error:'Location lookup cancelled'}};
  signal?.addEventListener('abort', cancel, {once:true});
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const endpoint = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates');
    for (const [key,value] of Object.entries({x:lng,y:lat,benchmark:'Public_AR_Current',vintage:'Current_Current',format:'json',layers:'States,Incorporated Places,Census Designated Places'})) endpoint.searchParams.set(key, String(value));
    const response = await fetchImpl(endpoint, {cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error('upstream-http');
    const result = censusPlace(await response.json(), lat, lng);
    if (result) return {status:200, body:result};
    // An authoritative empty result is not evidence of a U.S. location.
    return {status:404, body:{error:'No U.S. location match'}};
  } catch (error) {
    if (signal?.aborted) return {status:499, body:{error:'Location lookup cancelled'}};
    const nearby = nearestCensusPlace(lat, lng);
    warn('[location/reverse]', {reason:controller.signal.aborted ? 'timeout' : 'upstream-unavailable', fallback:!!nearby});
    return nearby ? {status:200, body:nearby} : {status:503, body:{error:'City lookup unavailable'}};
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
