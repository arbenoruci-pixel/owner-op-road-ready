'use client';

// Prepare before displaying Save / Share. The click handler must not serialize
// records, read IndexedDB, or await anything before invoking navigator.share.
export function prepareBackupFile(payload, filename, { compact = false } = {}) {
  return new File([JSON.stringify(payload, null, compact ? undefined : 2)], filename, { type: 'application/json' });
}

export async function sharePreparedBackupFile(file) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return { mode: 'unavailable' };
  }
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return { mode: 'unavailable' };
    }
    if (navigator.userActivation?.isActive === false) return { mode: 'retry' };
    await navigator.share({ title: 'Road Ready backup', files: [file] });
    return { mode: 'shared' };
  } catch (error) {
    if (error?.name === 'AbortError') return { mode: 'cancelled' };
    return { mode: 'retry' };
  }
}
