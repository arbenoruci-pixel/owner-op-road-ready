// Cancel the actual PostgREST request as well as the waiting caller. Storage
// promises retain the existing bounded wait; only query builders expose a signal.
export async function bounded(request, milliseconds = 45000) {
  const controller = typeof request?.abortSignal === 'function' ? new AbortController() : null;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Cloud connection timed out. Pending changes remain saved on this device.');
      // Reject with the actionable timeout before cancellation can return a
      // transport-specific error. Reconciliation checks an uncertain write again.
      reject(error);
      controller?.abort();
    }, milliseconds);
  });
  try {
    return await Promise.race([controller ? request.abortSignal(controller.signal) : request, deadline]);
  } finally { clearTimeout(timer); }
}
