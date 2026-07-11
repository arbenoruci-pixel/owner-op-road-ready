import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function firstRecord(geographies = {}, keys = []) {
  for (const key of keys) {
    const rows = geographies?.[key];
    if (Array.isArray(rows) && rows.length) return rows[0];
  }
  return null;
}

function cleanPlaceName(value = '') {
  return String(value || '')
    .replace(/\s+(city|town|village|borough|municipality|CDP|township)$/i, '')
    .trim();
}

function noStoreJson(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers:{
      'Cache-Control':'no-store, max-age=0',
      Pragma:'no-cache',
    },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 18 || lat > 72 || lng < -180 || lng > -60) {
    return noStoreJson({ error:'Invalid U.S. coordinates' }, 400);
  }

  const endpoint = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates');
  endpoint.searchParams.set('x', String(lng));
  endpoint.searchParams.set('y', String(lat));
  endpoint.searchParams.set('benchmark', 'Public_AR_Current');
  endpoint.searchParams.set('vintage', 'Current_Current');
  endpoint.searchParams.set('format', 'json');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(endpoint, {
      cache:'no-store',
      signal:controller.signal,
      headers:{ Accept:'application/json' },
    });
    if (!response.ok) return noStoreJson({ error:'Reverse geocoder unavailable' }, 502);

    const payload = await response.json();
    const geographies = payload?.result?.geographies || {};
    const place = firstRecord(geographies, [
      'Incorporated Places',
      'Census Designated Places',
      'County Subdivisions',
    ]);
    const stateRow = firstRecord(geographies, ['States']);
    const city = cleanPlaceName(place?.BASENAME || place?.NAME || '');
    const state = String(place?.STUSAB || stateRow?.STUSAB || '').trim().toUpperCase().slice(0, 2);

    if (!city || !state) return noStoreJson({ error:'No city/state match' }, 404);
    return noStoreJson({ city, state, source:'us-census-geocoder' });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Reverse geocoder timed out' : 'Reverse geocoder failed';
    return noStoreJson({ error:message }, 504);
  } finally {
    clearTimeout(timeout);
  }
}
