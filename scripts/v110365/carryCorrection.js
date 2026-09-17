// A displayed continuation has no editable stored row. Open a current-day
// Insert draft; the existing command records it only after the driver saves.
export function carryCorrectionDefaults(event) {
  if (!event || !(event.displayOnly || event.carriedFromPreviousDay || event.syntheticCoverage)
    || !['OFF', 'SB', 'ON'].includes(event.status)
    || !Number.isInteger(event.startMin) || !Number.isInteger(event.endMin)
    || event.startMin < 0 || event.endMin > 1440 || event.endMin <= event.startMin) return null;
  return {
    mode: 'insert', carryCorrection: true, status: event.status,
    startMin: event.startMin, endMin: event.endMin,
    city: event.city || '', state: event.state || '',
  };
}
