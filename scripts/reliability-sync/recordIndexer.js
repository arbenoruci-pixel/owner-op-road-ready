// This searchable diagnostic index is separate from account reconciliation.
// Only durable saves require a new full index; idle checks fetch corrections.
export function createRecordIndexer({sync, corrections, onError = () => {},
  available = () => true, setTimer = setTimeout, clearTimer = clearTimeout,
  initialMs = 15000, debounceMs = 30000, pollMs = 90000} = {}) {
  let stopped = false, running = false, dirty = 1, acknowledged = 0;
  let timer = null, failures = 0, blocked = false;
  function schedule(delay) {
    if (stopped || blocked || timer !== null || !available()) return;
    timer = setTimer(() => {timer = null; void run();}, delay);
  }
  async function run() {
    if (stopped || blocked || running || !available()) return;
    const captured = dirty;
    running = true;
    let retry = false;
    try {
      if (dirty > acknowledged) {
        const result = await sync() || {};
        if (result.error) throw new Error(result.error);
        if (result.paused || result.disabled || result.signedOut) blocked = true;
        else if (result.busy || result.deferred || result.offline) retry = true;
        else {acknowledged = captured; failures = 0;}
      } else await corrections();
    } catch (error) {
      failures++; onError(error);
      // A failing diagnostic pass must not keep scanning the phone forever.
      // Online/retry or another durable save starts a fresh attempt budget.
      if (failures >= 6) blocked = true;
      retry = true;
    } finally {running = false;}
    if (stopped || blocked) return;
    schedule(retry ? Math.min(120000, 5000 * 2 ** Math.min(failures, 5)) :
      dirty > acknowledged ? debounceMs : pollMs);
  }
  return {
    start() {schedule(initialMs);},
    saved() {dirty++; blocked = false; failures = 0; if (!running) {if (timer !== null) clearTimer(timer); timer = null; schedule(debounceMs);}},
    wake({retry = false} = {}) {if (retry) {blocked = false; failures = 0;} if (timer !== null) clearTimer(timer); timer = null; schedule(0);},
    stop() {stopped = true; if (timer !== null) clearTimer(timer); timer = null;},
    inspect() {return {running, dirty, acknowledged, failures, blocked};},
  };
}
