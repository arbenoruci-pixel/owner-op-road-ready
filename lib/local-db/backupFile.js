'use client';

// An app policy, not a claimed browser limit. WebKit's ShareDataReader reads a
// whole File into ArrayBuffer and copies it again before opening the native UI.
// Large backups must use the download link to preserve bounded-memory export.
export const MAX_NATIVE_BACKUP_SHARE_BYTES = 32 * 1024 * 1024;
export const canUseNativeBackupShare = file => Boolean(file && file.size <= MAX_NATIVE_BACKUP_SHARE_BYTES);

// Prepare before displaying Save / Share. The click handler must not serialize
// records, read IndexedDB, or await anything before invoking navigator.share.
export function prepareBackupFile(payload, filename, { compact = false } = {}) {
  return new File([JSON.stringify(payload, null, compact ? undefined : 2)], filename, { type: 'application/json' });
}

export async function sharePreparedBackupFile(file) {
  if (!canUseNativeBackupShare(file)) return { mode: 'download' };
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return { mode: 'unavailable' };
  }
  try {
    const data = { files: [file] };
    if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) {
      return { mode: 'unavailable' };
    }
    if (navigator.userActivation?.isActive === false) return { mode: 'retry' };
    await navigator.share(data);
    return { mode: 'shared' };
  } catch (error) {
    // No names, document contents or account information enter the diagnostic.
    console.warn('[backup/share]', { error: error?.name || 'Error', bytes: file.size, type: file.type });
    if (error?.name === 'AbortError') return { mode: 'cancelled' };
    return { mode: 'retry' };
  }
}
