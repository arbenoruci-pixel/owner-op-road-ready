import { NextResponse } from 'next/server';
import { analyzeReceiverReviewsV1021, receiverSearchQueryV1021 } from '../../../../source/src/modules/receiver/receiverIntelEngineV1021.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

const SEARCH_FIELDS = 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri';
const DETAIL_FIELDS = [
  'id','displayName','formattedAddress','rating','userRatingCount','reviews','reviewSummary',
  'googleMapsUri','nationalPhoneNumber','currentOpeningHours','regularOpeningHours',
  'businessStatus','parkingOptions','restroom',
].join(',');

function text(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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

function apiKey() {
  return text(
    process.env.GOOGLE_PLACES_API_KEY
    || process.env.GOOGLE_MAPS_PLATFORM_API_KEY
    || process.env.GOOGLE_MAPS_API_KEY
  );
}

function allowedMapsUrl(value = '') {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === 'maps.app.goo.gl'
      || host === 'maps.google.com'
      || host === 'www.google.com'
      || host.endsWith('.google.com');
  } catch {
    return false;
  }
}

function queryFromGoogleMapsUrl(value = '') {
  try {
    const url = new URL(value);
    const query = text(url.searchParams.get('q') || url.searchParams.get('query'));
    if (query) return query;
    const placeMatch = decodeURIComponent(url.pathname).match(/\/place\/([^/]+)/i);
    return placeMatch ? text(placeMatch[1].replace(/\+/g, ' ')) : '';
  } catch {
    return '';
  }
}

async function resolveMapsQuery(mapsUrl = '') {
  if (!allowedMapsUrl(mapsUrl)) return '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);
  try {
    const response = await fetch(mapsUrl, {
      redirect:'follow',
      cache:'no-store',
      signal:controller.signal,
      headers:{ 'User-Agent':'RoadReadyReceiverIntel/1.0' },
    });
    return queryFromGoogleMapsUrl(response.url || mapsUrl);
  } catch {
    return queryFromGoogleMapsUrl(mapsUrl);
  } finally {
    clearTimeout(timeout);
  }
}

async function googleFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);
  try {
    return await fetch(url, {
      ...options,
      cache:'no-store',
      signal:controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function findPlace(key, textQuery) {
  const response = await googleFetch('https://places.googleapis.com/v1/places:searchText', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':key,
      'X-Goog-FieldMask':SEARCH_FIELDS,
    },
    body:JSON.stringify({
      textQuery,
      languageCode:'en',
      regionCode:'US',
      pageSize:1,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Google Text Search failed (${response.status})`);
  }
  return body?.places?.[0] || null;
}

async function placeDetails(key, placeId) {
  const response = await googleFetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en&regionCode=US`, {
    method:'GET',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':key,
      'X-Goog-FieldMask':DETAIL_FIELDS,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Google Place Details failed (${response.status})`);
  }
  return body;
}

function reviewSummaryText(place = {}) {
  return text(
    place?.reviewSummary?.text?.text
    || place?.reviewSummary?.text
    || place?.reviewSummary?.overview?.text
    || place?.reviewSummary?.overview
  );
}

export async function POST(request) {
  const key = apiKey();
  if (!key) {
    return noStoreJson({
      error:'Google Maps connection is not configured.',
      code:'google_places_not_configured',
      requiredEnvironmentVariable:'GOOGLE_PLACES_API_KEY',
    }, 503);
  }

  let input = {};
  try {
    input = await request.json();
  } catch {
    return noStoreJson({ error:'Invalid request body.' }, 400);
  }

  let placeId = text(input.placeId);
  let textQuery = text(input.query) || receiverSearchQueryV1021(input);
  if (!textQuery && input.mapsUrl) textQuery = await resolveMapsQuery(text(input.mapsUrl));

  if (!placeId && (textQuery.length < 3 || textQuery.length > 320)) {
    return noStoreJson({ error:'Facility name or address is required.' }, 400);
  }

  try {
    let match = null;
    if (!placeId) {
      match = await findPlace(key, textQuery);
      if (!match?.id) return noStoreJson({ error:'Google Maps did not find this receiver.' }, 404);
      placeId = match.id;
    }

    const place = await placeDetails(key, placeId);
    const intelligence = analyzeReceiverReviewsV1021(place.reviews || []);
    return noStoreJson({
      source:'google_places_api_new',
      fetchedAt:new Date().toISOString(),
      query:textQuery,
      place:{
        id:text(place.id || placeId),
        name:text(place.displayName?.text || match?.displayName?.text),
        formattedAddress:text(place.formattedAddress || match?.formattedAddress),
        phone:text(place.nationalPhoneNumber),
        rating:Number(place.rating || 0),
        userRatingCount:Number(place.userRatingCount || 0),
        googleMapsUri:text(place.googleMapsUri || match?.googleMapsUri),
        businessStatus:text(place.businessStatus),
        openNow:Boolean(place.currentOpeningHours?.openNow),
        weekdayDescriptions:Array.isArray(place.regularOpeningHours?.weekdayDescriptions) ? place.regularOpeningHours.weekdayDescriptions : [],
        parkingOptions:place.parkingOptions || null,
        restroom:place.restroom === true,
        reviewSummary:reviewSummaryText(place),
      },
      reviews:intelligence.reviews,
      intelligence:{ ...intelligence, reviews:undefined },
      limitations:{
        returnedReviews:intelligence.reviewCountUsed,
        note:'Google Places returns a limited set of relevant reviews, not the full Google Maps review list.',
      },
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return noStoreJson({
      error:timedOut ? 'Google Maps request timed out.' : text(error?.message || 'Google Maps request failed.'),
      code:timedOut ? 'google_places_timeout' : 'google_places_error',
    }, timedOut ? 504 : 502);
  }
}
