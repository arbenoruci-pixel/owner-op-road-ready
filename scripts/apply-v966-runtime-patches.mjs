import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '96.6.0';

function file(relativePath) {
  return path.join(ROOT, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(file(relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(file(relativePath), content);
}

function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) {
    throw new Error(`v96.6 patch failed: ${label} anchor not found`);
  }
  return content.replace(before, after);
}

function patchJsonVersions() {
  const pkgPath = 'package.json';
  const pkg = JSON.parse(read(pkgPath));
  pkg.version = VERSION;
  write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const lockPath = 'package-lock.json';
  if (fs.existsSync(file(lockPath))) {
    const lock = JSON.parse(read(lockPath));
    lock.version = VERSION;
    if (lock.packages?.['']) lock.packages[''].version = VERSION;
    write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
}

function patchDisplayTail() {
  const relativePath = 'source/src/core/timeline/displayTimeline.js';
  let content = read(relativePath);
  const before = `export function displayEventsForDay(events, isCurrentDay=false, options = {}) {\n  return makeContinuousLogEvents(events, {\n    ...startFillOptions(events, options),\n    isCurrentDay,\n    nowMinute: options.nowMinute ?? nowMin(),\n  });\n}`;
  const after = `function shouldExtendTailToNow(events = [], isCurrentDay = false, requestedNow = null) {\n  if (!isCurrentDay) return false;\n  const ordered = normalizeLogEvents(realDisplayBase(events));\n  const tail = ordered.at(-1) || null;\n  if (!tail) return false;\n  if (tail.manualEndLocked === true || tail.explicitEndLocked === true) return false;\n\n  const start = Number(tail.startMin || 0);\n  const end = Number(tail.endMin || 0);\n  const duration = Math.max(0, end - start);\n  const source = String(tail.source || '').toLowerCase();\n  const liveTagged = tail.active === true\n    || tail.liveStatus === true\n    || /live_status|status_workflow|manual_drive|gps_drive|driver_workflow|current_status/.test(source);\n\n  // Live status rows are stored as a one-minute raw stub and may be painted to\n  // the current minute. Once the driver explicitly edits a real end time, the\n  // saved end wins and the old live extension is removed.\n  return liveTagged || (duration <= 1 && end <= Number(requestedNow ?? end));\n}\n\nexport function displayEventsForDay(events, isCurrentDay=false, options = {}) {\n  const requestedNow = options.nowMinute ?? nowMin();\n  const ordered = normalizeLogEvents(realDisplayBase(events));\n  const tail = ordered.at(-1) || null;\n  const effectiveNow = shouldExtendTailToNow(events, isCurrentDay, requestedNow)\n    ? requestedNow\n    : Math.min(Number(requestedNow), Number(tail?.endMin ?? requestedNow));\n\n  return makeContinuousLogEvents(events, {\n    ...startFillOptions(events, options),\n    isCurrentDay,\n    nowMinute: effectiveNow,\n  });\n}`;
  content = replaceOnce(content, before, after, 'current-day tail rendering');
  write(relativePath, content);
}

function patchEditEventEndLock() {
  const relativePath = 'source/src/modules/editor/EditEventSheet.jsx';
  let content = read(relativePath);
  const before = `      endMin:preview.endMin,\n      city,`;
  const after = `      endMin:preview.endMin,\n      manualEndLocked: preview.endMin !== Number(event.endMin || 0) ? true : !!event.manualEndLocked,\n      manualEndUpdatedAt: preview.endMin !== Number(event.endMin || 0) ? Date.now() : (event.manualEndUpdatedAt || null),\n      city,`;
  content = replaceOnce(content, before, after, 'explicit event end lock');
  write(relativePath, content);
}

function patchPreTripRequirement() {
  const relativePath = 'source/src/core/compliance/preTripContinuity.js';
  const content = `import { addDays } from '../../shared/utils/date.js';\nimport { rawStoredEventsForDay } from './rawRodsChecks.js';\n\nconst QUALIFYING_REST_MINUTES = 10 * 60;\nconst CONTIGUOUS_TOLERANCE_MINUTES = 2;\n\nfunction statusCode(event = {}) {\n  const value = String(event?.status || '').trim().toUpperCase();\n  if (value === 'DRIVING') return 'D';\n  if (value === 'ON DUTY' || value === 'ON_DUTY') return 'ON';\n  if (value === 'OFF DUTY' || value === 'OFF_DUTY') return 'OFF';\n  if (value === 'SLEEPER' || value === 'SLEEPER BERTH') return 'SB';\n  return value;\n}\n\nfunction minute(value, fallback = 0) {\n  const number = Number(value);\n  if (!Number.isFinite(number)) return fallback;\n  return Math.max(0, Math.min(1440, Math.round(number)));\n}\n\nfunction dayNumber(day = '') {\n  const stamp = Date.parse(\\`${'${day}'}T00:00:00Z\\`);\n  return Number.isFinite(stamp) ? Math.floor(stamp / 86400000) : 0;\n}\n\nfunction isDisplayOnlyEvent(event = {}) {\n  return !!event.syntheticCoverage\n    || !!event.carriedFromPreviousDay\n    || !!event.displayOnly\n    || !!event.synthetic\n    || !!event.continuityGenerated\n    || /^(carryover|timeline_continuity|display|display_timeline)$/i.test(String(event.source || '').trim());\n}\n\nfunction isRest(event = {}) {\n  const status = statusCode(event);\n  return status === 'OFF' || status === 'SB';\n}\n\nfunction isPreTrip(event = {}) {\n  return statusCode(event) === 'ON'\n    && /pre[- ]?trip|inspection/i.test(\\`${'${event.note || \'\'} ${event.description || \'\'}'}\\`);\n}\n\nfunction normalizedDayEvents(events = []) {\n  return [...(events || [])]\n    .filter(Boolean)\n    .filter(event => !isDisplayOnlyEvent(event))\n    .map(event => ({ ...event, startMin:minute(event.startMin, 0), endMin:minute(event.endMin, 0) }))\n    .filter(event => event.endMin > event.startMin)\n    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);\n}\n\nfunction eventsBeforeDriving(eventsByDay = {}, day = '', currentEventsOverride = null, candidateStartMin = null) {\n  const targetDayNumber = dayNumber(day);\n  const targetEvents = normalizedDayEvents(Array.isArray(currentEventsOverride)\n    ? currentEventsOverride\n    : rawStoredEventsForDay(eventsByDay || {}, day));\n\n  const actualFirstDriving = targetEvents.find(event => statusCode(event) === 'D') || null;\n  const driveStartMin = candidateStartMin == null\n    ? minute(actualFirstDriving?.startMin, 0)\n    : minute(candidateStartMin, 0);\n  const drivingEvent = actualFirstDriving && candidateStartMin == null\n    ? actualFirstDriving\n    : { id:'candidate_driving_start', status:'D', startMin:driveStartMin, endMin:Math.min(1440, driveStartMin + 1) };\n\n  if (!drivingEvent) return { drivingEvent:null, driveAbsolute:null, events:[] };\n\n  const collected = [];\n  for (let offset = -7; offset <= 0; offset += 1) {\n    const sourceDay = addDays(day, offset);\n    let sourceEvents = offset === 0 ? targetEvents : normalizedDayEvents(rawStoredEventsForDay(eventsByDay || {}, sourceDay));\n\n    // When the driver is about to start Driving, the current OFF/SB raw row is\n    // usually a one-minute live stub. Extend only that final rest row to the\n    // candidate start for the 10-hour reset calculation.\n    if (offset === 0 && candidateStartMin != null && sourceEvents.length) {\n      const lastIndex = sourceEvents.length - 1;\n      const last = sourceEvents[lastIndex];\n      if (isRest(last) && last.startMin < driveStartMin && last.endMin < driveStartMin) {\n        sourceEvents = sourceEvents.map((event, index) => index === lastIndex ? { ...event, endMin:driveStartMin } : event);\n      }\n    }\n\n    const sourceNumber = dayNumber(sourceDay);\n    sourceEvents.forEach(event => {\n      const absoluteStart = sourceNumber * 1440 + event.startMin;\n      const absoluteEnd = sourceNumber * 1440 + event.endMin;\n      collected.push({ ...event, sourceDay, absoluteStart, absoluteEnd });\n    });\n  }\n\n  const driveAbsolute = targetDayNumber * 1440 + driveStartMin;\n  return {\n    drivingEvent,\n    driveAbsolute,\n    events:collected\n      .filter(event => event.absoluteStart < driveAbsolute)\n      .sort((a, b) => a.absoluteStart - b.absoluteStart || a.absoluteEnd - b.absoluteEnd),\n  };\n}\n\nexport function preTripRequirementForDrivingStart(eventsByDay = {}, day = '', currentEventsOverride = null, candidateStartMin = null) {\n  if (!day) return { required:false, satisfied:true, restMinutes:0, drivingEvent:null, preTripEvent:null };\n\n  const context = eventsBeforeDriving(eventsByDay, day, currentEventsOverride, candidateStartMin);\n  if (!context.drivingEvent || context.driveAbsolute == null) {\n    return { required:false, satisfied:true, restMinutes:0, drivingEvent:null, preTripEvent:null };\n  }\n\n  const before = context.events;\n  if (!before.length) {\n    return { required:false, satisfied:true, restMinutes:0, drivingEvent:context.drivingEvent, preTripEvent:null };\n  }\n\n  let latestRestIndex = -1;\n  for (let index = before.length - 1; index >= 0; index -= 1) {\n    if (isRest(before[index])) {\n      latestRestIndex = index;\n      break;\n    }\n  }\n\n  if (latestRestIndex < 0) {\n    return { required:false, satisfied:true, restMinutes:0, drivingEvent:context.drivingEvent, preTripEvent:null };\n  }\n\n  let restStart = before[latestRestIndex].absoluteStart;\n  let restEnd = before[latestRestIndex].absoluteEnd;\n  for (let index = latestRestIndex - 1; index >= 0; index -= 1) {\n    const event = before[index];\n    if (!isRest(event)) break;\n    if (restStart - event.absoluteEnd > CONTIGUOUS_TOLERANCE_MINUTES) break;\n    restStart = Math.min(restStart, event.absoluteStart);\n  }\n\n  const restMinutes = Math.max(0, restEnd - restStart);\n  if (restMinutes < QUALIFYING_REST_MINUTES) {\n    return { required:false, satisfied:true, restMinutes, drivingEvent:context.drivingEvent, preTripEvent:null, restStart, restEnd };\n  }\n\n  const preTripEvent = before.find(event => (\n    isPreTrip(event)\n    && event.absoluteStart >= restEnd - CONTIGUOUS_TOLERANCE_MINUTES\n    && event.absoluteEnd <= context.driveAbsolute + CONTIGUOUS_TOLERANCE_MINUTES\n  )) || null;\n\n  return {\n    required:true,\n    satisfied:!!preTripEvent,\n    restMinutes,\n    restStart,\n    restEnd,\n    drivingEvent:context.drivingEvent,\n    preTripEvent,\n  };\n}\n\n/**\n * Compatibility helper used by Sign and DOT Check. A new pre-trip review is\n * suppressed unless the driving start follows a real 10-hour OFF/SB reset.\n * Midnight itself never creates a new pre-trip requirement.\n */\nexport function isDrivingContinuationFromPreviousDay(eventsByDay = {}, day = '', currentEventsOverride = null) {\n  const result = preTripRequirementForDrivingStart(eventsByDay, day, currentEventsOverride, null);\n  return !result.required || result.satisfied;\n}\n\nexport function previousDayForDrivingContinuation(day = '') {\n  return day ? addDays(day, -1) : '';\n}\n`;
  write(relativePath, content);
}

function patchDrivingGuard() {
  const relativePath = 'source/src/modules/status/StatusWorkflowSheet.jsx';
  let content = read(relativePath);
  content = replaceOnce(
    content,
    `import { getAccurateGpsLocation } from '../../core/gps/locationService.js';`,
    `import { getAccurateGpsLocation } from '../../core/gps/locationService.js';\nimport { preTripRequirementForDrivingStart } from '../../core/compliance/preTripContinuity.js';\nimport { getHomeTerminalTimeZone, homeTerminalMinute } from '../../core/time/homeTerminalTime.js';`,
    'Status workflow imports'
  );

  const before = `    if (status === 'D') {\n      onStartDriving({ city:p.city, state:p.state, lat:p.lat, lng:p.lng, gpsAccuracy:p.gpsAccuracy, locationSource:p.locationSource });\n      return;\n    }`;
  const after = `    if (status === 'D') {\n      const driveStartMin = homeTerminalMinute(new Date(), getHomeTerminalTimeZone(state));\n      const preTripRequirement = preTripRequirementForDrivingStart(\n        state.eventsByDay || {},\n        state.activeDay,\n        null,\n        driveStartMin\n      );\n      if (preTripRequirement.required && !preTripRequirement.satisfied) {\n        setStatus('ON');\n        setSelectedReasons(['Pre-trip inspection']);\n        setGpsStatus(\\`10h or more OFF/SB reset completed (${ '${Math.floor(preTripRequirement.restMinutes / 60)}h ${preTripRequirement.restMinutes % 60}m' }). Add ON DUTY Pre-trip before Driving.\\`);\n        return;\n      }\n      onStartDriving({ city:p.city, state:p.state, lat:p.lat, lng:p.lng, gpsAccuracy:p.gpsAccuracy, locationSource:p.locationSource });\n      return;\n    }`;
  content = replaceOnce(content, before, after, '10-hour pre-trip driving guard');
  write(relativePath, content);
}

patchJsonVersions();
patchDisplayTail();
patchEditEventEndLock();
patchPreTripRequirement();
patchDrivingGuard();

console.log('v96.6 runtime patches applied');
