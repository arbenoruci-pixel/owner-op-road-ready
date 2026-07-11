import assert from 'node:assert/strict';
import { getAccurateGpsLocation, getBestGpsPosition, resolveGpsPosition, guessGpsCity, detectState } from '../source/src/core/gps/locationService.js';

const positions = [
  { coords:{ latitude:41.1560, longitude:-80.5700, accuracy:900 }, timestamp:1 },
  { coords:{ latitude:41.1563, longitude:-80.5699, accuracy:85 }, timestamp:2 },
  { coords:{ latitude:41.1564, longitude:-80.5698, accuracy:22 }, timestamp:3 },
];
let cleared = false;
const geolocation = {
  watchPosition(success) {
    positions.forEach((position, index) => setTimeout(() => success(position), index * 5));
    return 7;
  },
  clearWatch(id) { if (id === 7) cleared = true; },
};
const best = await getBestGpsPosition({ geolocation, durationMs:2500, targetAccuracy:40, minimumSamples:2 });
assert.equal(best.coords.accuracy, 22);
assert.equal(cleared, true);

const resolved = await resolveGpsPosition(best, {
  fetchImpl:async () => ({ ok:true, json:async () => ({ city:'Hubbard', state:'OH', source:'test-geocoder' }) }),
});
assert.equal(resolved.city, 'Hubbard');
assert.equal(resolved.state, 'OH');
assert.equal(resolved.accuracy, 22);

const coarseGeolocation = {
  watchPosition(success) {
    setTimeout(() => success({ coords:{ latitude:41.1564, longitude:-80.5698, accuracy:780 }, timestamp:1 }), 0);
    return 8;
  },
  clearWatch() {},
};
await assert.rejects(
  () => getAccurateGpsLocation({
    geolocation:coarseGeolocation,
    durationMs:2500,
    minimumSamples:1,
    rejectCoarseFix:true,
    maximumAcceptedAccuracy:250,
    fetchImpl:null,
  }),
  error => error?.code === 'GPS_ACCURACY' && error.accuracy === 780,
  'coarse/cell-tower fix must be rejected instead of silently saving a wrong stop',
);

const ct = guessGpsCity(41.4990, -72.9007);
assert.equal(ct.city, 'Cheshire');
assert.equal(ct.state, 'CT');
assert.equal(detectState(41.4990, -72.9007), 'CT');

console.log('v96.2 multi-sample GPS, coarse-fix guard, and Northeast fallback checks passed');
