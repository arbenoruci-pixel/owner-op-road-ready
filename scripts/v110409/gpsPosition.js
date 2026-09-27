export function gpsAbortError() {
  const error = new Error('GPS cancelled'); error.name = 'AbortError'; return error;
}
export function validGpsCoordinates(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
function gpsError(code, message) { const error = new Error(message); error.code = code; return error; }
const accuracy = position => typeof position?.coords?.accuracy === 'number' && position.coords.accuracy >= 0 ? position.coords.accuracy : Infinity;

// Keep the best fresh sample, release the watch on every exit, and allow the
// user to cancel while granting permission, collecting samples or typing.
export function getBestGpsPosition(options = {}) {
  const geolocation = options.geolocation || (typeof navigator !== 'undefined' ? navigator.geolocation : null);
  const durationMs = Math.max(2500, Number(options.durationMs || 12000));
  const targetAccuracy = Math.max(10, Number(options.targetAccuracy || 40));
  const minimumSamples = Math.max(1, Number(options.minimumSamples || 2));
  const signal = options.signal;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(gpsAbortError());
    if (!geolocation) return reject(gpsError(2, 'Geolocation unavailable'));
    let best = null, samples = 0, settled = false, watchId = null, timer;
    const clearWatch = () => {
      if (watchId != null && typeof geolocation.clearWatch === 'function') {
        try { geolocation.clearWatch(watchId); } catch (_) {}
        watchId = null;
      }
    };
    const finish = (error, discard = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearWatch();
      signal?.removeEventListener('abort', cancel);
      if (best && !discard) resolve(best);
      else reject(error || gpsError(2, 'Could not get GPS position'));
    };
    const cancel = () => finish(gpsAbortError(), true);
    const accept = (position, once = false) => {
      if (settled || !validGpsCoordinates(position?.coords?.latitude, position?.coords?.longitude)) return;
      samples += 1;
      if (!best || accuracy(position) < accuracy(best)) best = position;
      if (once || accuracy(best) <= Math.min(15, targetAccuracy / 2) || (samples >= minimumSamples && accuracy(best) <= targetAccuracy)) finish();
    };
    const fail = error => finish(error || gpsError(2, 'Location unavailable'), error?.code === 1);
    signal?.addEventListener('abort', cancel, {once:true});
    timer = setTimeout(() => finish(gpsError(3, 'GPS timed out')), durationMs);
    const settings = {enableHighAccuracy:true, timeout:durationMs, maximumAge:Math.max(0,Number(options.maximumAge ?? 0))};
    try {
      if (typeof geolocation.watchPosition === 'function') {
        watchId = geolocation.watchPosition(accept, fail, settings);
        // Test adapters and some providers can call back before returning ID.
        if (settled) clearWatch();
      } else if (typeof geolocation.getCurrentPosition === 'function') {
        geolocation.getCurrentPosition(position => accept(position, true), fail, settings);
      } else finish(gpsError(2, 'Geolocation unavailable'));
    } catch (error) { finish(error); }
  });
}
