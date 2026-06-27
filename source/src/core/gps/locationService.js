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
  { city:'South Bend', state:'IN', lat:41.6764, lng:-86.2520 },
  { city:'Fort Wayne', state:'IN', lat:41.0793, lng:-85.1394 },
  { city:'Toledo', state:'OH', lat:41.6528, lng:-83.5379 },
  { city:'Columbus', state:'OH', lat:39.9612, lng:-82.9988 },
  { city:'Cincinnati', state:'OH', lat:39.1031, lng:-84.5120 },
  { city:'Louisville', state:'KY', lat:38.2527, lng:-85.7585 },
  { city:'Davenport', state:'IA', lat:41.5236, lng:-90.5776 },
  { city:'Des Moines', state:'IA', lat:41.5868, lng:-93.6250 },
  { city:'Detroit', state:'MI', lat:42.3314, lng:-83.0458 },
];

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
