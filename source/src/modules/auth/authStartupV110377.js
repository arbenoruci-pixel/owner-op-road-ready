export const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_CHECK_TIMEOUT_MS = 2500;
export const ACCESS_CHECK_TIMEOUT_MS = 4500;
export const AUTH_STORAGE_KEY = 'owner-op-prototype-auth-v1';
export const APPROVAL_PREFIX = 'owner-op-approved-device-v1:';

const text = value => String(value || '').trim();

export function approvalKeyForUser(user) {
  return `${APPROVAL_PREFIX}${user?.id || 'none'}`;
}

export function approvalIsFresh(row, user, now = Date.now(), graceMs = OFFLINE_GRACE_MS) {
  if (!row || !user?.id) return false;
  if (row.userId !== user.id) return false;
  if (text(row.email).toLowerCase() !== text(user.email).toLowerCase()) return false;
  const verifiedAt = Number(row.verifiedAt || 0);
  return Number.isFinite(verifiedAt) && verifiedAt > 0 && now - verifiedAt <= graceMs;
}

export function storedAuthUser(storage) {
  if (!storage?.getItem) return null;
  try {
    const raw = JSON.parse(storage.getItem(AUTH_STORAGE_KEY) || 'null');
    const user = raw?.user || raw?.currentSession?.user || raw?.session?.user || null;
    if (!user?.id) return null;
    return { id:user.id, email:user.email || '', email_confirmed_at:user.email_confirmed_at || null };
  } catch {
    return null;
  }
}

export function cachedApprovedUser(storage, now = Date.now(), graceMs = OFFLINE_GRACE_MS) {
  const user = storedAuthUser(storage);
  if (!user) return null;
  try {
    const row = JSON.parse(storage.getItem(approvalKeyForUser(user)) || 'null');
    return approvalIsFresh(row, user, now, graceMs) ? { user, approval:row } : null;
  } catch {
    return null;
  }
}

export async function settleWithin(promise, timeoutMs, label = 'Operation') {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} timed out`);
          error.name = 'TimeoutError';
          reject(error);
        }, Math.max(50, Number(timeoutMs || 0)));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
