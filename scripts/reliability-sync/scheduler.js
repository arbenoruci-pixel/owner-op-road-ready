// One queue owns working records and originals. Durable local saves are the
// queue: after reload the initial reconciliation recaptures all unacknowledged
// data. Timers never mark a failed write as synchronized.
export function createSyncScheduler({
  sync, onResult = () => {}, prioritize = () => {},
  online = () => true, canRun = () => true,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  random = Math.random, pollMs = 60000, archivePollMs = 300000,
  debounceMs = 600, onRetry = () => {},
} = {}) {
  let stopped = false, running = false, timer = null, dueAt = Infinity;
  let first = true, attempted = false, recordsVersion = 1, recordsAck = 0;
  let archiveVersion = 1, archiveAck = 0, recordsDue = 0, archiveDue = 0;
  let retryAt = 0, failures = 0, blocked = false, choices = null;
  const pending = () => recordsVersion > recordsAck || archiveVersion > archiveAck;
  function schedule(delay = 0) {
    if (stopped || blocked || !online() && attempted) return;
    const due = Math.max(now() + delay, retryAt);
    if (timer !== null && due >= dueAt) return;
    if (timer !== null) clearTimer(timer);
    dueAt = due;
    timer = setTimer(() => { timer = null; dueAt = Infinity; void run(); }, Math.max(0, due - now()));
  }
  function backoff(base = 5000, ceiling = 120000) {
    failures++;
    const delay = Math.min(ceiling, base * 2 ** Math.min(failures - 1, 8)) * (1 + .2 * random());
    retryAt = now() + Math.round(delay);
    onRetry({ failures, retryAt });
    schedule(delay);
  }
  async function run() {
    if (stopped || running || blocked || !online() && attempted) return;
    if (now() < retryAt) return schedule(retryAt - now());
    let scope = recordsVersion > recordsAck || now() >= recordsDue ? 'records' :
      archiveVersion > archiveAck || now() >= archiveDue ? 'all' : null;
    if (!scope) return schedule(Math.max(0, Math.min(recordsDue, archiveDue) - now()));
    if (!canRun({ scope, initial: first, dirty: pending() })) return schedule(2000);
    const capturedRecords = recordsVersion, capturedArchive = archiveVersion;
    const initial = first, selected = choices; choices = null; running = true; attempted = true;
    let result;
    try { result = await sync({ scope, initial, ...(selected ? { choices: selected } : {}) }); }
    catch (error) { result = { error: error?.message || String(error) }; }
    finally { running = false; }
    if (stopped) return;
    onResult(result || {});
    if (result?.offline || !online()) return;
    if (result?.conflicts?.length || result?.paused || result?.disabled || result?.signedOut ||
        (result?.blocked && !result?.error && !result?.transient && !result?.deferred && !result?.busy)) { blocked = true; return; }
    if (result?.busy || result?.transient || result?.deferred) {
      if (scope === 'all' && recordsVersion > capturedRecords) return schedule(0);
      return backoff(result?.busy ? 500 : 1000, 10000);
    }
    if (result?.error) return backoff();
    first = false; failures = 0; retryAt = 0; onRetry({ failures: 0, retryAt: 0 });
    recordsAck = Math.max(recordsAck, capturedRecords); recordsDue = now() + pollMs;
    if (scope === 'all') { archiveAck = Math.max(archiveAck, capturedArchive); archiveDue = now() + archivePollMs; }
    else if (result?.archivePending || result?.handoffPending) archiveVersion++;
    // Exactly one follow-up captures edits committed during the preceding run.
    schedule(pending() ? (recordsVersion > recordsAck ? debounceMs : 1200) : Math.min(recordsDue, archiveDue) - now());
  }
  return {
    start() { schedule(0); },
    saved({ scope = 'records', immediate = false } = {}) {
      if (scope === 'records') { recordsVersion++; prioritize(); }
      archiveVersion++;
      schedule(immediate ? 0 : debounceMs);
    },
    wake({ reconnect = false } = {}) {
      if (reconnect) { retryAt = 0; failures = 0; blocked = false; recordsDue = 0; }
      schedule(0);
    },
    retry(selected = null) {
      blocked = false; choices = selected; recordsVersion++; archiveVersion++;
      retryAt = 0; failures = 0; schedule(0);
    },
    stop() { stopped = true; if (timer !== null) clearTimer(timer); timer = null; },
    inspect() { return { running, first, pending: pending(), recordsVersion, recordsAck,
      archiveVersion, archiveAck, retryAt, failures, blocked, dueAt }; },
  };
}
