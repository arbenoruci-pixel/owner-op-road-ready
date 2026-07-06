export const CURRENT_APP_VERSION = '95.60.0';
export const APP_VERSION_URL = '/app-version.json';
export const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 1000;

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
    headers: { 'cache-control': 'no-cache' },
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
