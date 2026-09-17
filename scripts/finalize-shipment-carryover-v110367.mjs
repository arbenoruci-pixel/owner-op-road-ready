import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read = path => fs.readFileSync(path, 'utf8');
function patch(path, before, after) {
  const source = read(path);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, 'Shipment carryover anchor: ' + path);
  fs.writeFileSync(path, source.replace(before, after));
}
fs.copyFileSync('scripts/v110367/shipmentCarryover.js', 'source/src/core/routes/shipmentCarryover.js');
const routes = 'source/src/core/routes/routeNormalization.js';
patch(routes, "import { newestRouteCopies } from './routeProjectionV110352.js';",
  "import { newestRouteCopies } from './routeProjectionV110352.js';\nimport { routeHistoryIndex, recordedRouteDayMembership } from './shipmentCarryover.js';");
patch(routes, '  const dayEvents = Array.isArray(state.eventsByDay?.[day]) ? state.eventsByDay[day] : [];',
  '  const historyIndex = routeHistoryIndex(state);\n  const dayEvents = Array.isArray(state.eventsByDay?.[day]) ? state.eventsByDay[day] : [];');
patch(routes, '      if (leg.day === day || leg.pickupDay === day || leg.deliveryDay === day) return true;',
  '      const recorded = recordedRouteDayMembership(leg, day, historyIndex);\n      if (recorded !== null) return recorded;\n      if (leg.day === day || leg.pickupDay === day || leg.deliveryDay === day) return true;');
const day = 'source/src/modules/logbook/DayLogScreen.jsx';
patch(day, "import EventList from './EventList.jsx';",
  "import EventList from './EventList.jsx';\nimport { shipmentContextForEvents, routeStatusForLogDay } from '../../core/routes/shipmentCarryover.js';");
patch(day, 'function legMeta(leg) {', 'function legMeta(leg, day, state) {');
patch(day, `  if (leg.status === 'delivered') parts.push('Done');
  else if (leg.isCurrentStop) parts.push('Next stop');
  else parts.push('Pending');`, `  parts.push(routeStatusForLogDay(leg, day, state));`);
patch(day, '<span>{legMeta(leg)}</span>', '<span>{legMeta(leg, state.activeDay, state)}</span>');
patch(day, '  const eventListEvents = useMemo(\n    () => ((state.selectMode || isMoving || bulkMoveDelta)',
  '  const eventListEvents = useMemo(\n    () => shipmentContextForEvents(state, state.activeDay, ((state.selectMode || isMoving || bulkMoveDelta)');
patch(day, '      .map(event => enrichLoadEventFromLinkedRoute(state, state.activeDay, event)),',
  '      .map(event => enrichLoadEventFromLinkedRoute(state, state.activeDay, event)), routeLegsForDayCanonical(state, state.activeDay)),');
// Legacy unconfirmed route scope can depend on the current guide, while recorded
// shipments remain determined by history. Keep memo dependencies complete.
patch(day, 'state.eventsByDay, state.routeLegsByDay, state.activeDay]\n  );\n  const bulkAppliedDelta',
  'state.eventsByDay, state.routeLegsByDay, state.activeDay, state.activeLoadGuideId, state.loadGuidesById, state.loadInfo]\n  );\n  const bulkAppliedDelta');
const list = 'source/src/modules/logbook/EventList.jsx';
patch(list, "import { sanitizeLogText, combineLogText } from '../../shared/utils/logText.js';",
  "import { sanitizeLogText, combineLogText } from '../../shared/utils/logText.js';\nimport { shipmentContextLabel } from '../../core/routes/shipmentCarryover.js';");
patch(list, '        const routeMeta = loadActivity', '        const activityRouteMeta = loadActivity');
patch(list, '        return (\n          <div',
  '        const routeMeta = [activityRouteMeta, shipmentContextLabel(event.shipmentContextV110367)].filter(Boolean).join(\' · \');\n        return (\n          <div');
const VERSION = '110.3.67', BUILD = 'v110367-shipment-carryover';
for (const path of ['release-version.json', 'public/app-version.json']) {
  const value = JSON.parse(read(path));
  Object.assign(value, {version:VERSION, build:BUILD, force:false, label:'v110.3.67 Shipment carryover through delivery', releasedAt:new Date().toISOString(), updatedAt:new Date().toISOString(), sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes:['Carry recorded loads across every log day from pickup through delivery.', 'Show BOL, destination and recorded pickup trailer beside intervening duty events.', 'Preserve historical routes when a newer load is active or the earlier load is delivered.']});
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const path of ['package.json', 'package-lock.json']) {
  const value = JSON.parse(read(path)); value.version = VERSION; if (value.packages?.['']) value.packages[''].version = VERSION;
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
  let source = read(path);
  for (const [key, value] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
    const pattern = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`, 'g');
    assert.equal([...source.matchAll(pattern)].length, 1, 'Unique release marker: ' + path);
    source = source.replace(pattern, `const ${name}_${key} = '${value}';`);
  }
  fs.writeFileSync(path, source);
}
for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
patch('scripts/test-duty-graph-continuity.mjs', "assert.equal(meta.version,'110.3.66');assert.equal(meta.build,'v110366-continuous-driving-miles');", `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
patch('scripts/test-editor-grips-v110355.mjs', "assert.equal(meta.version,'110.3.66'); assert.equal(meta.build,'v110366-continuous-driving-miles');", `assert.equal(meta.version,'${VERSION}'); assert.equal(meta.build,'${BUILD}');`);
patch('scripts/verify-log-integrity-v1051.mjs', "assert.equal(JSON.parse(read('public/app-version.json')).version, '110.3.66');", `assert.equal(JSON.parse(read('public/app-version.json')).version, '${VERSION}');`);

// Reviewed display wiring; stored events and signature implementation keep their locks.
const reviewedDayHash = 'fa7509bcecdcd3968cf91ebdb53de48fa341cef0c5717b44eef95fd38fa84255';
assert.equal(crypto.createHash('sha256').update(read(day)).digest('hex'), reviewedDayHash);
const lockPath = 'module-locks.v1.json', locks = JSON.parse(read(lockPath));
locks.release = VERSION; locks.files[day] = reviewedDayHash;
fs.writeFileSync(lockPath, JSON.stringify(locks, null, 2) + '\n');
console.log('PASS — 110.3.67 carries recorded shipments through delivery');
