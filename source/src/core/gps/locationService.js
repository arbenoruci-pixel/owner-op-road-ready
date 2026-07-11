export function haversineMiles(a, b) {
  if (!a || !b) return 0;
  const R = 3958.7613;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function detectState(lat, lng) {
  // Offline fallback only. The UI first asks the app's server-side reverse
  // geocoder; these compact bounds keep city/state usable without data service.
  if (lat == null || lng == null) return 'UNK';
  const y = Number(lat);
  const x = Number(lng);
  if (!Number.isFinite(y) || !Number.isFinite(x)) return 'UNK';

  // Northeast (small states first so broad neighboring boxes do not win).
  if (y >= 40.95 && y <= 42.10 && x >= -73.75 && x <= -71.75) return 'CT';
  if (y >= 41.10 && y <= 42.05 && x >= -71.95 && x <= -71.10) return 'RI';
  if (y >= 41.20 && y <= 42.95 && x >= -73.60 && x <= -69.80) return 'MA';
  if (y >= 38.85 && y <= 41.40 && x >= -75.60 && x <= -73.85) return 'NJ';
  if (y >= 38.40 && y <= 39.90 && x >= -75.80 && x <= -75.00) return 'DE';
  if (y >= 37.85 && y <= 39.80 && x >= -79.55 && x <= -75.00) return 'MD';
  if (y >= 39.70 && y <= 42.60 && x >= -80.60 && x <= -74.50) return 'PA';
  if (y >= 40.45 && y <= 45.10 && x >= -79.80 && x <= -71.80) return 'NY';
  if (y >= 37.00 && y <= 40.70 && x >= -82.70 && x <= -77.70) return 'WV';

  // Midwest / Great Lakes.
  if (y >= 37.6 && y <= 41.8 && x >= -88.2 && x <= -84.7) return 'IN';
  if (y >= 36.9 && y <= 42.6 && x >= -91.7 && x <= -87.0) return 'IL';
  if (y >= 38.3 && y <= 42.4 && x >= -84.9 && x <= -80.4) return 'OH';
  if (y >= 36.4 && y <= 39.2 && x >= -89.6 && x <= -81.9) return 'KY';
  if (y >= 42.45 && y <= 47.35 && x >= -92.9 && x <= -86.75) return 'WI';
  if (y >= 40.35 && y <= 43.55 && x >= -96.65 && x <= -90.1) return 'IA';
  if (y >= 41.65 && y <= 48.35 && x >= -90.45 && x <= -82.1) return 'MI';
  if (y >= 35.95 && y <= 40.65 && x >= -95.8 && x <= -89.0) return 'MO';
  if (y >= 43.45 && y <= 49.4 && x >= -97.25 && x <= -89.45) return 'MN';
  return 'UNK';
}

export function addMilesByState(existing, state, miles) {
  const key = state || 'UNK';
  return { ...existing, [key]: Number(((existing[key] || 0) + miles).toFixed(2)) };
}

export function formatMiles(m) {
  return `${Number(m || 0).toFixed(2)} mi`;
}

export function metersPerSecondToMph(speed) {
  if (speed == null || Number.isNaN(speed)) return 0;
  return speed * 2.236936;
}

export function pointMinute(point) {
  const d = new Date(point.timestamp);
  return d.getHours() * 60 + d.getMinutes();
}

export function recalcMilesByTimeWindow(points, startMin, endMin) {
  const filtered = (points || [])
    .filter(p => {
      const m = pointMinute(p);
      return m >= startMin && m <= endMin;
    })
    .sort((a,b) => a.timestamp - b.timestamp);

  let milesByState = {};
  let totalMiles = 0;

  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1];
    const curr = filtered[i];
    const raw = haversineMiles(prev, curr);
    if (raw >= 0.005 && raw <= 5) {
      const st = curr.state || detectState(curr.lat, curr.lng);
      milesByState = addMilesByState(milesByState, st, raw);
      totalMiles += raw;
    }
  }

  return {
    milesByState,
    totalMiles: Number(totalMiles.toFixed(2)),
    pointsUsed: filtered.length,
  };
}

const GPS_CITY_POINTS = [
  // Wisconsin
  { city:'Milwaukee', state:'WI', lat:43.0389, lng:-87.9065 },
  { city:'Waukesha', state:'WI', lat:43.0117, lng:-88.2315 },
  { city:'Mukwonago', state:'WI', lat:42.8667, lng:-88.3334 },
  { city:'Racine', state:'WI', lat:42.7261, lng:-87.7829 },
  { city:'Kenosha', state:'WI', lat:42.5847, lng:-87.8212 },
  { city:'Oak Creek', state:'WI', lat:42.8859, lng:-87.8631 },
  { city:'Beloit', state:'WI', lat:42.5083, lng:-89.0318 },
  { city:'Janesville', state:'WI', lat:42.6828, lng:-89.0187 },
  { city:'Madison', state:'WI', lat:43.0722, lng:-89.4008 },
  { city:'Green Bay', state:'WI', lat:44.5133, lng:-88.0133 },

  // Illinois
  { city:'Chicago', state:'IL', lat:41.8781, lng:-87.6298 },
  { city:'Willowbrook', state:'IL', lat:41.7698, lng:-87.9359 },
  { city:'Joliet', state:'IL', lat:41.5250, lng:-88.0817 },
  { city:'Aurora', state:'IL', lat:41.7606, lng:-88.3201 },
  { city:'Naperville', state:'IL', lat:41.7508, lng:-88.1535 },
  { city:'Elgin', state:'IL', lat:42.0354, lng:-88.2826 },
  { city:'Schaumburg', state:'IL', lat:42.0334, lng:-88.0834 },
  { city:'Bolingbrook', state:'IL', lat:41.6986, lng:-88.0684 },
  { city:'Rockford', state:'IL', lat:42.2711, lng:-89.0940 },
  { city:'Moline', state:'IL', lat:41.5067, lng:-90.5151 },

  // Indiana / Ohio / nearby lanes
  { city:'Greenwood', state:'IN', lat:39.6137, lng:-86.1067 },
  { city:'Indianapolis', state:'IN', lat:39.7684, lng:-86.1581 },
  { city:'Gary', state:'IN', lat:41.5934, lng:-87.3464 },
  { city:'Hammond', state:'IN', lat:41.5834, lng:-87.5000 },
  { city:'Merrillville', state:'IN', lat:41.4828, lng:-87.3328 },
  { city:'Portage', state:'IN', lat:41.5759, lng:-87.1761 },
  { city:'South Bend', state:'IN', lat:41.6764, lng:-86.2520 },
  { city:'Fort Wayne', state:'IN', lat:41.0793, lng:-85.1394 },
  { city:'Toledo', state:'OH', lat:41.6528, lng:-83.5379 },
  { city:'Maumee', state:'OH', lat:41.5628, lng:-83.6538 },
  { city:'Elyria', state:'OH', lat:41.3684, lng:-82.1076 },
  { city:'Cleveland', state:'OH', lat:41.4993, lng:-81.6944 },
  { city:'Streetsboro', state:'OH', lat:41.2392, lng:-81.3459 },
  { city:'Akron', state:'OH', lat:41.0814, lng:-81.5190 },
  { city:'Youngstown', state:'OH', lat:41.0998, lng:-80.6495 },
  { city:'Hubbard', state:'OH', lat:41.1564, lng:-80.5698 },
  { city:'Warren', state:'OH', lat:41.2376, lng:-80.8184 },
  { city:'Columbus', state:'OH', lat:39.9612, lng:-82.9988 },
  { city:'Cincinnati', state:'OH', lat:39.1031, lng:-84.5120 },
  { city:'Louisville', state:'KY', lat:38.2527, lng:-85.7585 },
  { city:'Davenport', state:'IA', lat:41.5236, lng:-90.5776 },
  { city:'Des Moines', state:'IA', lat:41.5868, lng:-93.6250 },
  { city:'Detroit', state:'MI', lat:42.3314, lng:-83.0458 },

  // Connecticut / Northeast freight lanes
  { city:'Cheshire', state:'CT', lat:41.4989, lng:-72.9007 },
  { city:'East Hartford', state:'CT', lat:41.7637, lng:-72.6851 },
  { city:'Hartford', state:'CT', lat:41.7658, lng:-72.6734 },
  { city:'New Haven', state:'CT', lat:41.3083, lng:-72.9279 },
  { city:'Waterbury', state:'CT', lat:41.5582, lng:-73.0515 },
  { city:'Meriden', state:'CT', lat:41.5382, lng:-72.8070 },
  { city:'New Britain', state:'CT', lat:41.6612, lng:-72.7795 },
  { city:'Southington', state:'CT', lat:41.5965, lng:-72.8776 },
  { city:'Stamford', state:'CT', lat:41.0534, lng:-73.5387 },
  { city:'Bridgeport', state:'CT', lat:41.1792, lng:-73.1894 },
  { city:'Danbury', state:'CT', lat:41.3948, lng:-73.4540 },
  { city:'Springfield', state:'MA', lat:42.1015, lng:-72.5898 },
  { city:'Worcester', state:'MA', lat:42.2626, lng:-71.8023 },
  { city:'Boston', state:'MA', lat:42.3601, lng:-71.0589 },
  { city:'Providence', state:'RI', lat:41.8240, lng:-71.4128 },
  { city:'Newark', state:'NJ', lat:40.7357, lng:-74.1724 },
  { city:'Elizabeth', state:'NJ', lat:40.6639, lng:-74.2107 },
  { city:'Kearny', state:'NJ', lat:40.7684, lng:-74.1454 },
  { city:'Secaucus', state:'NJ', lat:40.7895, lng:-74.0565 },
  { city:'Allentown', state:'PA', lat:40.6023, lng:-75.4714 },
  { city:'Scranton', state:'PA', lat:41.4090, lng:-75.6624 },
  { city:'Harrisburg', state:'PA', lat:40.2732, lng:-76.8867 },
  { city:'Pittsburgh', state:'PA', lat:40.4406, lng:-79.9959 },
  { city:'Sharon', state:'PA', lat:41.2331, lng:-80.4934 },
  { city:'Hermitage', state:'PA', lat:41.2334, lng:-80.4487 },
  { city:'Erie', state:'PA', lat:42.1292, lng:-80.0851 },
  { city:'Buffalo', state:'NY', lat:42.8864, lng:-78.8784 },
  { city:'Rochester', state:'NY', lat:43.1566, lng:-77.6088 },
  { city:'Syracuse', state:'NY', lat:43.0481, lng:-76.1474 },
  { city:'Albany', state:'NY', lat:42.6526, lng:-73.7562 },
];


function normalizePlacePart(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function lookupCityPoint(city = '', state = '') {
  const wantedCity = normalizePlacePart(city);
  const wantedState = String(state || '').trim().toUpperCase().slice(0, 2);
  if (!wantedCity || !wantedState) return null;
  return GPS_CITY_POINTS.find(point =>
    normalizePlacePart(point.city) === wantedCity &&
    String(point.state || '').toUpperCase() === wantedState
  ) || null;
}

function hasRealCoordinate(value) {
  if (value == null || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n);
}

export function pointFromLogLocation(item = {}) {
  const hasLatLng = hasRealCoordinate(item.lat) && hasRealCoordinate(item.lng);
  if (hasLatLng) {
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    // Guard against null/blank coordinates turning into 0,0 and creating
    // impossible mileage suggestions such as 6,000+ miles from Midwest logs.
    if (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001) {
      return {
        lat,
        lng,
        city: item.city || 'GPS',
        state: item.state || detectState(lat, lng),
        source: item.locationSource === 'gps' || item.source === 'gps_drive' ? 'gps' : 'coordinates',
      };
    }
  }
  const point = lookupCityPoint(item.city, item.state);
  if (!point) return null;
  return { ...point, source:'log-location' };
}

export function estimatedRoadMiles(a, b) {
  const raw = haversineMiles(a, b);
  if (!raw || raw > 1200) return 0;
  // Conservative highway estimate from city center/log points. It is not a
  // routing engine; the driver can accept or change it in the manual miles flow.
  return Number((raw * 1.1).toFixed(2));
}

function addStateMiles(map, state, miles) {
  const key = String(state || 'UNK').trim().toUpperCase().slice(0, 2) || 'UNK';
  const amount = Math.max(0, Number(miles || 0));
  if (!amount) return map;
  return { ...map, [key]: Number(((map[key] || 0) + amount).toFixed(2)) };
}

// Directional state-border/corridor points for manual-mile estimates when the
// web app has no GPS breadcrumbs. These are approximate highway split points,
// not a routing engine; the driver can edit the state breakdown before saving.
const STATE_CORRIDORS = {
  'IL-IN': [{ state:'IL', lat:41.5990, lng:-87.5240 }],
  'IN-IL': [{ state:'IN', lat:41.5990, lng:-87.5240 }],

  'IN-OH': [{ state:'IN', lat:41.6920, lng:-84.8060 }],
  'OH-IN': [{ state:'OH', lat:41.6920, lng:-84.8060 }],

  'IL-OH': [
    { state:'IL', lat:41.5990, lng:-87.5240 },
    { state:'IN', lat:41.6920, lng:-84.8060 },
  ],
  'OH-IL': [
    { state:'OH', lat:41.6920, lng:-84.8060 },
    { state:'IN', lat:41.5990, lng:-87.5240 },
  ],

  'IL-WI': [{ state:'IL', lat:42.4930, lng:-87.9490 }],
  'WI-IL': [{ state:'WI', lat:42.4930, lng:-87.9490 }],

  'IL-IA': [{ state:'IL', lat:41.5060, lng:-90.5150 }],
  'IA-IL': [{ state:'IA', lat:41.5060, lng:-90.5150 }],

  'IN-MI': [{ state:'IN', lat:41.7590, lng:-85.9900 }],
  'MI-IN': [{ state:'MI', lat:41.7590, lng:-85.9900 }],

  'OH-MI': [{ state:'OH', lat:41.7320, lng:-83.5000 }],
  'MI-OH': [{ state:'MI', lat:41.7320, lng:-83.5000 }],
};

export function sumMilesByState(map = {}) {
  return Number(Object.values(map || {}).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0).toFixed(2));
}

export function scaleMilesByState(map = {}, targetMiles = 0) {
  const target = Math.max(0, Number(targetMiles || 0));
  const current = sumMilesByState(map);
  if (!target || !current) return map || {};
  const entries = Object.entries(map || {}).filter(([, miles]) => Number(miles || 0) > 0);
  let scaled = {};
  let running = 0;
  entries.forEach(([state, miles], index) => {
    const value = index === entries.length - 1
      ? Math.max(0, Number((target - running).toFixed(2)))
      : Number(((Number(miles || 0) / current) * target).toFixed(2));
    running += value;
    scaled = addStateMiles(scaled, state, value);
  });
  return scaled;
}

export function formatMilesByState(map = {}) {
  return Object.entries(map || {})
    .filter(([, miles]) => Number(miles || 0) > 0)
    .map(([state, miles]) => `${String(state || 'UNK').toUpperCase()} ${Number(miles || 0).toFixed(2)}`)
    .join(', ');
}

export function parseMilesByState(input = '') {
  const text = String(input || '').trim();
  if (!text) return {};
  let out = {};
  const stateFirst = /([A-Za-z]{2})\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/g;
  const milesFirst = /([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]{2})/g;
  let matched = false;
  for (const match of text.matchAll(stateFirst)) {
    matched = true;
    out = addStateMiles(out, match[1], Number(match[2]));
  }
  if (!matched) {
    for (const match of text.matchAll(milesFirst)) {
      matched = true;
      out = addStateMiles(out, match[2], Number(match[1]));
    }
  }
  return out;
}

export function estimateMilesByStateBetween(origin = {}, destination = {}) {
  if (!origin || !destination) return {};
  const startState = String(origin.state || detectState(origin.lat, origin.lng) || 'UNK').toUpperCase().slice(0, 2);
  const endState = String(destination.state || detectState(destination.lat, destination.lng) || 'UNK').toUpperCase().slice(0, 2);
  if (!startState || !endState || startState === 'UN' || endState === 'UN') return {};

  if (startState === endState) {
    const miles = estimatedRoadMiles(origin, destination);
    return miles ? { [startState]: miles } : {};
  }

  const corridor = STATE_CORRIDORS[`${startState}-${endState}`] || [];
  if (!corridor.length) {
    const miles = estimatedRoadMiles(origin, destination);
    if (!miles) return {};
    const half = Number((miles / 2).toFixed(2));
    return { [startState]: half, [endState]: Number((miles - half).toFixed(2)) };
  }

  let out = {};
  let previous = origin;
  for (const point of corridor) {
    const miles = estimatedRoadMiles(previous, point);
    out = addStateMiles(out, point.state || previous.state || startState, miles);
    previous = point;
  }
  const finalMiles = estimatedRoadMiles(previous, destination);
  out = addStateMiles(out, endState, finalMiles);

  return out;
}

export function guessGpsCity(lat, lng) {
  if (lat == null || lng == null) return { city:'GPS', state:'UNK' };

  let best = null;
  for (const p of GPS_CITY_POINTS) {
    const miles = haversineMiles({ lat, lng }, p);
    if (!best || miles < best.miles) best = { ...p, miles };
  }

  const state = detectState(lat, lng);
  if (best && best.miles <= 30) return { city:best.city, state:best.state };
  if (best && best.miles <= 45 && best.state === state) return { city:best.city, state:best.state };
  return { city:'GPS', state };
}


function gpsAccuracyValue(position = {}) {
  const accuracy = Number(position?.coords?.accuracy);
  return Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : Number.POSITIVE_INFINITY;
}

/**
 * Collects several high-accuracy fixes and returns the best one. A single
 * getCurrentPosition call on iOS can return a cached/cell-tower fix; watching
 * briefly lets the GPS radio refine the stop location before the event saves.
 */
export function getBestGpsPosition(options = {}) {
  const geolocation = options.geolocation || (typeof navigator !== 'undefined' ? navigator.geolocation : null);
  const durationMs = Math.max(2500, Number(options.durationMs || 12000));
  const targetAccuracy = Math.max(10, Number(options.targetAccuracy || 40));
  const maximumAge = Math.max(0, Number(options.maximumAge ?? 0));
  const minimumSamples = Math.max(1, Number(options.minimumSamples || 2));

  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }

    let best = null;
    let samples = 0;
    let settled = false;
    let watchId = null;
    let timer = null;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (watchId != null && typeof geolocation.clearWatch === 'function') {
        try { geolocation.clearWatch(watchId); } catch (_) {}
      }
      if (best) resolve(best);
      else reject(error || new Error('Could not get GPS position'));
    };

    const accept = (position) => {
      if (settled || !position?.coords) return;
      samples += 1;
      if (!best || gpsAccuracyValue(position) < gpsAccuracyValue(best)) best = position;
      const bestAccuracy = gpsAccuracyValue(best);
      // A truly precise satellite fix does not need a second sample. Otherwise
      // keep watching until the requested sample count and target are met.
      if (bestAccuracy <= Math.min(15, targetAccuracy / 2)) finish();
      else if (samples >= minimumSamples && bestAccuracy <= targetAccuracy) finish();
    };

    const fail = (error) => {
      if (best) finish();
      else if (error?.code === 1) finish(error);
    };

    timer = setTimeout(() => finish(new Error('GPS timed out')), durationMs);

    const gpsOptions = { enableHighAccuracy:true, timeout:durationMs, maximumAge };
    if (typeof geolocation.watchPosition === 'function') {
      try {
        watchId = geolocation.watchPosition(accept, fail, gpsOptions);
      } catch (error) {
        finish(error);
      }
      return;
    }

    if (typeof geolocation.getCurrentPosition === 'function') {
      try { geolocation.getCurrentPosition(accept, fail, gpsOptions); } catch (error) { finish(error); }
      return;
    }

    finish(new Error('Geolocation unavailable'));
  });
}

function gpsFallbackPlace(lat, lng) {
  const guessed = guessGpsCity(lat, lng);
  return {
    city:guessed.city || 'GPS',
    state:guessed.state || detectState(lat, lng) || 'UNK',
    source:'offline-nearest-city',
  };
}

/** Resolve a GPS fix to City, ST through the same-origin server route, with a
 * deterministic offline fallback. */
export async function resolveGpsPosition(position = {}, options = {}) {
  const lat = Number(position?.coords?.latitude ?? position?.lat);
  const lng = Number(position?.coords?.longitude ?? position?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid GPS coordinates');

  const fallback = gpsFallbackPlace(lat, lng);
  const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 5000));
  let resolved = fallback;

  if (fetchImpl) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(`/api/location/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, {
        cache:'no-store',
        signal:controller?.signal,
      });
      if (response?.ok) {
        const data = await response.json();
        const city = String(data?.city || '').trim();
        const state = String(data?.state || '').trim().toUpperCase().slice(0, 2);
        if (city && state) resolved = { city, state, source:data.source || 'reverse-geocoder' };
      }
    } catch (_) {
      // Offline/timeout: the nearest known city fallback remains available.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    ...resolved,
    lat,
    lng,
    accuracy:Number.isFinite(Number(position?.coords?.accuracy)) ? Number(position.coords.accuracy) : null,
    timestamp:Number(position?.timestamp || Date.now()),
  };
}

export async function getAccurateGpsLocation(options = {}) {
  const position = await getBestGpsPosition(options);
  const accuracy = gpsAccuracyValue(position);
  const maximumAcceptedAccuracy = Math.max(25, Number(options.maximumAcceptedAccuracy || 250));

  if (options.rejectCoarseFix === true && accuracy > maximumAcceptedAccuracy) {
    const error = new Error(`GPS accuracy is too coarse: ${Math.round(accuracy)} m`);
    error.code = 'GPS_ACCURACY';
    error.accuracy = accuracy;
    throw error;
  }

  return resolveGpsPosition(position, options);
}
