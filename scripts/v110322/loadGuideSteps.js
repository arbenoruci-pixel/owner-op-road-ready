// Apply at creation and display time so saved guides cannot restore Logbook prompts.
// This only selects guide steps; it never edits recorded duty events.
export function loadGuideStepsV110322(steps) {
  return (Array.isArray(steps) ? steps : []).filter(step => step
    && !['status', 'logbook'].includes(step.kind)
    && !['status', 'open_status', 'open_logbook'].includes(step.action)
    && !/^(pretrip|arrive_pickup|depart_pickup|arrive_delivery_\d+|depart_delivery_\d+)$/.test(step.id || ''));
}
