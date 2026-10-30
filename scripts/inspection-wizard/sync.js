// An explicit inspection request waits for a fresh records pass. Background
// contention is retryable; conflicts and ownership failures require review.
export function inspectionSyncProblem(result) {
  if (result?.conflicts?.length) return 'Saved versions differ. Open Synchronization status and review the listed changes.';
  if (result?.handoffPending) return 'This device is still receiving saved documents. Let synchronization finish, then retry.';
  if (result?.signedOut) return 'Sign in again before preparing the inspection.';
  if (result?.offline) return 'Reconnect to the internet, then retry.';
  if (result?.paused) return 'Synchronization is paused. Resume it in Cloud settings, then retry.';
  if (result?.disabled) return 'Enable account synchronization in Cloud settings, then retry.';
  if (result?.error) return result.error;
  if (result?.blocked) return 'This device is not ready to share. Open Synchronization status to review the device transfer.';
  return result?.reason || 'Synchronization is still busy. Close any open edit and retry.';
}

export async function verifyInspectionRecords(sync, onProgress = () => {}, {timeoutMs = 45000, includeDocuments = false, wait = ms => new Promise(r => setTimeout(r, ms))} = {}) {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; attempt < 3; attempt++) {
    let timer;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error('Logbook verification timed out. Your records remain saved. Retry when the connection is stable.');
    let result;
    try {
      result = await Promise.race([
        sync({scope:'records', fresh:true}),
        new Promise((_, reject) => {timer = setTimeout(() => reject(Error('Logbook verification timed out. Your records remain saved. Retry when the connection is stable.')), remaining);}),
      ]);
    } finally {clearTimeout(timer);}
    // Log records may be fully verified while unrelated original documents
    // are still transferring. A logs-only share needs the records receipt.
    const handoffBlocked = result?.handoffPending && (includeDocuments || result.recordsReady !== true);
    const blocked = result?.error || result?.blocked || handoffBlocked || result?.conflicts?.length || result?.signedOut || result?.offline || result?.paused || result?.disabled;
    if (!blocked && Number.isInteger(result?.revision) && !result?.busy && !result?.transient && !result?.deferred) return result;
    if (!blocked && (result?.busy || result?.transient || result?.deferred) && attempt < 2) {
      onProgress('Finishing the current save and checking again…');
      await wait(250 * (attempt + 1));
      continue;
    }
    throw Error('The latest logbook could not be verified. ' + inspectionSyncProblem(result));
  }
}
