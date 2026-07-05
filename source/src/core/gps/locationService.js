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
  // Field-test Midwest state detection. Production still needs real polygons/geocoder.
  if (lat == null || lng == null) return 'UNK';
  if (lat >= 37.6 && lat <= 41.8 && lng >= -88.2 && lng <= -84.7) return 'IN';
  if (lat >= 36.9 && lat <= 42.6 && lng >= -91.7 && lng <= -87.0) return 'IL';
  if (lat >= 38.3 && lat <= 42.4 && lng >= -84.9 && lng <= -80.4) return 'OH';
  if (lat >= 36.4 && lat <= 39.2 && lng >= -89.6 && lng <= -81.9) return 'KY';
  if (lat >= 42.45 && lat <= 47.35 && lng >= -92.9 && lng <= -86.75) return 'WI';
  if (lat >= 40.35 && lat <= 43.55 && lng >= -96.65 && lng <= -90.1) return 'IA';
  if (lat >= 41.65 && lat <= 48.35 && lng >= -90.45 && lng <= -82.1) return 'MI';
  if (lat >= 35.95 && lat <= 40.65 && lng >= -95.8 && lng <= -89.0) return 'MO';
  if (lat >= 43.45 && lat <= 49.4 && lng >= -97.25 && lng <= -89.45) return 'MN';
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

const STATE_NAME_TO_CODE = {
  illinois:'IL', il:'IL',
  indiana:'IN', in:'IN',
  wisconsin:'WI', wi:'WI',
  ohio:'OH', oh:'OH',
  michigan:'MI', mi:'MI',
  iowa:'IA', ia:'IA',
  kentucky:'KY', ky:'KY',
  missouri:'MO', mo:'MO',
  minnesota:'MN', mn:'MN',
  pennsylvania:'PA', pa:'PA',
};

function titleCaseCity(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, ch => ch.toUpperCase());
}

function editDistance(a = '', b = '') {
  const x = normalizePlacePart(a).replace(/\s+/g, '');
  const y = normalizePlacePart(b).replace(/\s+/g, '');
  if (!x || !y) return Math.max(x.length, y.length);
  const dp = Array.from({ length:x.length + 1 }, () => Array(y.length + 1).fill(0));
  for (let i = 0; i <= x.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= y.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= x.length; i += 1) {
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[x.length][y.length];
}

function parseStateToken(value = '') {
  const key = normalizePlacePart(value).replace(/\s+/g, '');
  return STATE_NAME_TO_CODE[key] || '';
}

function splitLocationText(value = '', fallbackState = '') {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return { city:'', state:'', explicitState:false };

  const commaParts = raw.split(',').map(part => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const state = parseStateToken(commaParts[commaParts.length - 1]) || commaParts[commaParts.length - 1].toUpperCase().slice(0, 2);
    return { city:commaParts.slice(0, -1).join(', ').trim(), state, explicitState:!!state };
  }

  const tokens = raw.split(' ').filter(Boolean);
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    const lastTwo = last.replace(/[^a-zA-Z]/g, '');
    const state = parseStateToken(lastTwo) || (lastTwo.length === 2 ? lastTwo.toUpperCase() : '');
    if (state) return { city:tokens.slice(0, -1).join(' ').trim(), state, explicitState:true };
  }

  return { city:raw, state:String(fallbackState || '').trim().toUpperCase().slice(0, 2), explicitState:false };
}

function bestKnownCityMatch(city = '', state = '', explicitState = false) {
  const wanted = normalizePlacePart(city);
  if (!wanted) return null;
  const wantedState = String(state || '').trim().toUpperCase().slice(0, 2);
  const candidates = GPS_CITY_POINTS
    .filter(point => !explicitState || !wantedState || String(point.state).toUpperCase() === wantedState)
    .map(point => {
      const normalizedCity = normalizePlacePart(point.city);
      const distance = editDistance(wanted, normalizedCity);
      const starts = normalizedCity.startsWith(wanted) || wanted.startsWith(normalizedCity);
      return { point, distance, starts };
    })
    .filter(item => item.starts || item.distance <= Math.max(1, Math.min(2, Math.floor(wanted.length / 3))))
    .sort((a, b) => a.distance - b.distance || Number(b.starts) - Number(a.starts));

  if (candidates[0]) return candidates[0].point;

  // If the typed state is wrong but the city is a unique known city (e.g. Gary IL),
  // prefer the known city/state instead of blindly keeping the fallback/wrong state.
  const allMatches = GPS_CITY_POINTS
    .map(point => ({ point, distance:editDistance(wanted, point.city), starts:normalizePlacePart(point.city).startsWith(wanted) || wanted.startsWith(normalizePlacePart(point.city)) }))
    .filter(item => item.starts || item.distance <= Math.max(1, Math.min(2, Math.floor(wanted.length / 3))))
    .sort((a, b) => a.distance - b.distance || Number(b.starts) - Number(a.starts));
  if (allMatches.length === 1) return allMatches[0].point;
  if (allMatches.length > 1 && allMatches[0].distance < allMatches[1].distance) return allMatches[0].point;
  return null;
}

export function parseSmartLocationText(value = '', fallbackState = '') {
  const split = splitLocationText(value, fallbackState);
  if (!split.city && !split.state) return { city:'', state:'' };

  const known = bestKnownCityMatch(split.city, split.state, split.explicitState);
  if (known) return { city:known.city, state:known.state };

  return {
    city:titleCaseCity(split.city),
    state:String(split.state || fallbackState || '').trim().toUpperCase().slice(0, 2),
  };
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
