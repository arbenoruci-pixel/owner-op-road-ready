const FALLBACK_APP_VERSION = '95.94.0';

export const CURRENT_APP_VERSION = String(
  process.env.NEXT_PUBLIC_OWNER_OP_APP_VERSION || FALLBACK_APP_VERSION,
).trim() || FALLBACK_APP_VERSION;

export const APP_VERSION_URL = '/app-version.json';
export const SERVICE_WORKER_URL = '/sw.js';
export const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 1000;
export const UPDATE_WORKER_TIMEOUT_MS = 5_000;

function versionParts(version = '') {
  return String(version || '')
    .split(/[.+-]/)
    .map(part => Number.parseInt(part, 10))
    .filter(num => Number.isFinite(num));
}

export function compareVersions(a = '', b = '') {
  const left = versionParts(a);
  const right = versionParts(b);
  const len = Math.max(left.length, right.length, 3);
  for (let i = 0; i < len; i += 1) {
    const av = left[i] || 0;
    const bv = right[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export function isNewerVersion(remoteVersion = '', currentVersion = CURRENT_APP_VERSION) {
  return compareVersions(remoteVersion, currentVersion) > 0;
}

export function normalizeRemoteVersionPayload(payload = {}) {
  const version = String(payload.version || payload.appVersion || '').trim();
  return {
    version,
    build: String(payload.build || payload.buildId || '').trim(),
    releasedAt: String(payload.releasedAt || payload.updatedAt || '').trim(),
    notes: Array.isArray(payload.notes) ? payload.notes.map(String).filter(Boolean) : [],
    force: payload.force === true,
  };
}

export async function fetchRemoteAppVersion(fetchImpl = fetch) {
  const url = `${APP_VERSION_URL}?ts=${Date.now()}`;
  const response = await fetchImpl(url, {
    cache: 'no-store',
    headers: {
      'cache-control': 'no-cache, no-store, must-revalidate',
      pragma: 'no-cache',
    },
  });
  if (!response.ok) throw new Error(`Version check failed: ${response.status}`);
  return normalizeRemoteVersionPayload(await response.json());
}

export function buildUpdateMeta(remote = {}, reason = 'manual') {
  return {
    reason,
    currentVersion: CURRENT_APP_VERSION,
    nextVersion: remote.version || '',
    remoteBuild: remote.build || '',
    createdAt: new Date().toISOString(),
  };
}

export function updateReloadUrl(remote = {}) {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.searchParams.set('road_ready_update', remote.version || CURRENT_APP_VERSION);
  url.searchParams.set('t', String(Date.now()));
  return url.toString();
}

export function versionedServiceWorkerUrl(
  version = CURRENT_APP_VERSION,
  baseUrl = SERVICE_WORKER_URL,
) {
  const source = String(baseUrl || SERVICE_WORKER_URL);
  const separator = source.includes('?') ? '&' : '?';
  return `${source}${separator}owner_op_v=${encodeURIComponent(version || CURRENT_APP_VERSION)}`;
}

export async function clearBrowserCaches() {
  if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return;
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

function workerTargetsVersion(worker, version) {
  if (!worker?.scriptURL || !version) return false;
  try {
    const url = new URL(worker.scriptURL);
    return url.searchParams.get('owner_op_v') === String(version);
  } catch {
    return String(worker.scriptURL).includes(`owner_op_v=${encodeURIComponent(version)}`);
  }
}

export function waitForServiceWorkerVersion(
  registration,
  version,
  timeoutMs = UPDATE_WORKER_TIMEOUT_MS,
) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker || !registration) {
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    let finished = false;
    let timer = null;
    const watchedWorkers = new Set();

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      registration.removeEventListener?.('updatefound', onUpdateFound);
      for (const worker of watchedWorkers) {
        worker.removeEventListener?.('statechange', onWorkerStateChange);
      }
    };

    const finish = value => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };

    const check = () => {
      const controller = navigator.serviceWorker.controller;
      if (workerTargetsVersion(controller, version)) {
        finish(true);
        return true;
      }

      const active = registration.active;
      if (active?.state === 'activated' && workerTargetsVersion(active, version)) {
        finish(true);
        return true;
      }

      const waiting = registration.waiting;
      if (waiting && workerTargetsVersion(waiting, version)) {
        waiting.postMessage?.({ type: 'OWNER_OP_SKIP_WAITING', version });
      }
      return false;
    };

    function onControllerChange() {
      if (!check()) finish(true);
    }

    function onWorkerStateChange() {
      check();
    }

    const watchWorker = worker => {
      if (!worker || watchedWorkers.has(worker)) return;
      watchedWorkers.add(worker);
      worker.addEventListener?.('statechange', onWorkerStateChange);
      if (worker.state === 'installed' || worker.state === 'waiting') {
        worker.postMessage?.({ type: 'OWNER_OP_SKIP_WAITING', version });
      }
    };

    function onUpdateFound() {
      watchWorker(registration.installing);
      check();
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    registration.addEventListener?.('updatefound', onUpdateFound);
    watchWorker(registration.installing);
    watchWorker(registration.waiting);
    watchWorker(registration.active);

    timer = setTimeout(() => finish(false), Math.max(250, Number(timeoutMs) || UPDATE_WORKER_TIMEOUT_MS));
    check();
  });
}

export async function requestServiceWorkerUpdate(remote = {}, meta = {}) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { supported: false, activated: false, registration: null };
  }

  const version = String(remote.version || CURRENT_APP_VERSION).trim() || CURRENT_APP_VERSION;
  const swUrl = versionedServiceWorkerUrl(version);
  await clearBrowserCaches().catch(() => {});

  let registration;
  try {
    registration = await navigator.serviceWorker.register(swUrl, {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch (registerError) {
    registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw registerError;
  }

  const payload = { type: 'OWNER_OP_APPLY_UPDATE', version, meta };
  registration.active?.postMessage?.(payload);
  registration.waiting?.postMessage?.(payload);
  registration.installing?.postMessage?.(payload);

  try {
    await registration.update?.();
  } catch {
    // The versioned service-worker URL already forces a network update check.
  }

  registration.active?.postMessage?.(payload);
  registration.waiting?.postMessage?.(payload);
  registration.installing?.postMessage?.(payload);

  const activated = await waitForServiceWorkerVersion(registration, version);
  return { supported: true, activated, registration };
}
