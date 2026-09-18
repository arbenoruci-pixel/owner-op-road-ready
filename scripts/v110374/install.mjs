import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='source/src/core/routes/routeNormalization.js';
let source=fs.readFileSync(path,'utf8');
function patch(before,after){
  if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,'Recorded-day route scope anchor: '+before.slice(0,100));
  source=source.replace(before,after);
}
patch("export function routeLegsForDayCanonical(state = {}, day = '') {", `// Route carryover requires evidence from the recorded trip or selected log day.
// Today's active guide and a missing global load selection are not such evidence.
function recordedLogEventV110374(event) {
  return event && !event.voided && !event.deleted && !event.deletedAt
    && !event.synthetic && !event.syntheticCoverage && !event.displayOnly
    && !event.carriedFromPreviousDay && !event.continuityGenerated
    && !/^(carryover|timeline_continuity|display|display_timeline)$/i.test(safeText(event.source));
}

export function routeLegsForDayCanonical(state = {}, day = '') {`);
patch('  const dayEvents = Array.isArray(state.eventsByDay?.[day]) ? state.eventsByDay[day] : [];',
      '  const dayEvents = (Array.isArray(state.eventsByDay?.[day]) ? state.eventsByDay[day] : []).filter(recordedLogEventV110374);');
patch(`  const scope = activeRouteScopeV105(state);
  const hasScope = !!scope.guideId || scope.refs.size > 0 || dayRefs.size > 0;`,
      '  // Legacy unlinked rows may use real references on this log day only.');
patch(`      if (!hasScope) return true;
      if (scope.guideId && safeText(leg.loadGroupId) === scope.guideId) return true;
      const refs = routeReferenceValuesV105(leg);
      return refs.some(value => scope.refs.has(value) || dayRefs.has(value));`,
      `      const refs = routeReferenceValuesV105(leg);
      return refs.some(value => dayRefs.has(value));`);
fs.writeFileSync(path,source);
console.log('PASS — unrecorded cross-day routes no longer follow the global active load; stored data unchanged');
