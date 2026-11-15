// Report the failing operation without exposing record values or document names.
async function accountStep(label, run) {
  try { return await run(); }
  catch (error) {
    if (error?.deferred || error?.deviceRevoked || error?.syncStep) throw error;
    const wrapped = new Error(label + ': ' + (error?.message || error?.name || String(error)), {cause:error});
    wrapped.name = error?.name || 'Error';
    wrapped.syncStep = label;
    throw wrapped;
  }
}
