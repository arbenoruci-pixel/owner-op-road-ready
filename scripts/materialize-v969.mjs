import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '96.9.0';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v96.9 patch failed: ${label}`);
  return content.replace(before, after);
}

// 1) Canonical multi-stop model + day-scoped presentation.
const routePath = 'source/src/core/routes/routeNormalization.js';
let route = read(routePath);
route = replaceOnce(route,
`export function routeLegsForDayCanonical(state = {}, day = '') {
  const all = Object.entries(state.routeLegsByDay || {}).flatMap(([legDay, legs]) => (
    (Array.isArray(legs) ? legs : []).map(leg => ({ ...leg, day: leg.day || legDay }))
  ));
  return all
    .filter(leg => {
      if (leg.day === day || leg.pickupDay === day || leg.deliveryDay === day) return true;
      return String(leg.pickupDay || leg.day || '') < String(day || '') && leg.status !== 'delivered' && leg.status !== 'cancelled';
    })
    .sort((a, b) => String(a.pickupDay || a.day).localeCompare(String(b.pickupDay || b.day)) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999));
}`,
`function routeStopIdentity(leg = {}) {
  return [
    safeText(leg.loadGroupId || ''),
    safeText(leg.pickupDay || leg.day || ''),
    normalizeDocToken(firstRealText(leg.shippingDocs, leg.loadNo, leg.bol, leg.po)),
    keyText(leg.toCity),
    safeUpper(leg.toState).slice(0, 2),
  ].join('|');
}

function routeLoadGroupKey(leg = {}) {
  if (safeText(leg.loadGroupId)) return safeText(leg.loadGroupId);
  if (safeText(leg.pickupEventId)) return `load_${safeText(leg.pickupEventId)}`;
  return [
    'load',
    safeText(leg.pickupDay || leg.day || 'day'),
    keyText(leg.fromCity),
    safeUpper(leg.fromState).slice(0, 2),
  ].join('_');
}

function preferLinkedRouteLeg(current = {}, candidate = {}) {
  const score = leg => (
    (safeText(leg.pickupEventId) ? 8 : 0)
    + (safeText(leg.deliveryEventId) ? 4 : 0)
    + (/pickup_event|delivery_event/i.test(safeText(leg.source)) ? 3 : 0)
    + Number(leg.updatedAt || 0) / 1e15
  );
  return score(candidate) >= score(current) ? candidate : current;
}

export function canonicalMultiStopRouteLegs(state = {}) {
  const raw = Object.entries(state.routeLegsByDay || {}).flatMap(([legDay, legs]) => (
    (Array.isArray(legs) ? legs : []).map(leg => normalizeRouteLegRecord({ ...leg, day:leg.day || legDay }, legDay))
  ));

  // Remove duplicate manual/event rows for the same BOL + destination stop.
  const deduped = new Map();
  for (const leg of raw) {
    if (leg.status === 'cancelled') continue;
    const key = routeStopIdentity(leg);
    deduped.set(key, deduped.has(key) ? preferLinkedRouteLeg(deduped.get(key), leg) : leg);
  }

  const ordered = [...deduped.values()].sort((a, b) => (
    String(a.pickupDay || a.day || '').localeCompare(String(b.pickupDay || b.day || ''))
    || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999)
    || Number(a.stopSequence ?? 9999) - Number(b.stopSequence ?? 9999)
  ));

  const groups = new Map();
  for (const leg of ordered) {
    const key = routeLoadGroupKey(leg);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...leg, loadGroupId:key });
  }

  const out = [];
  for (const [loadGroupId, legs] of groups.entries()) {
    const sorted = [...legs].sort((a, b) => (
      Number(a.stopSequence ?? 9999) - Number(b.stopSequence ?? 9999)
      || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999)
      || String(a.id || '').localeCompare(String(b.id || ''))
    ));
    sorted.forEach((leg, index) => out.push({
      ...leg,
      loadGroupId,
      stopSequence:Number.isFinite(Number(leg.stopSequence)) ? Number(leg.stopSequence) : index + 1,
      stopCount:sorted.length,
      stopStatus:leg.status === 'delivered' ? 'done' : 'pending',
    }));
  }
  return out;
}

export function routeLegsForDayCanonical(state = {}, day = '') {
  const all = canonicalMultiStopRouteLegs(state);
  const groups = new Map();
  for (const leg of all) {
    const key = leg.loadGroupId || routeLoadGroupKey(leg);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(leg);
  }

  const visible = [];
  for (const legs of groups.values()) {
    const ordered = [...legs].sort((a, b) => Number(a.stopSequence || 0) - Number(b.stopSequence || 0));
    const pickupDay = ordered.map(leg => String(leg.pickupDay || leg.day || '')).filter(Boolean).sort()[0] || '';
    if (pickupDay && pickupDay > day) continue;

    const completedToday = ordered.filter(leg => String(leg.deliveryDay || '') === day);
    const pendingAsOfDay = ordered.filter(leg => {
      if (leg.status === 'cancelled') return false;
      if (leg.status !== 'delivered') return true;
      return String(leg.deliveryDay || '') > day;
    });
    const nextPending = pendingAsOfDay.sort((a, b) => Number(a.stopSequence || 0) - Number(b.stopSequence || 0))[0] || null;

    if (pickupDay === day) {
      visible.push(...ordered.map(leg => ({ ...leg, isCurrentStop:nextPending?.id === leg.id })));
      continue;
    }

    if (completedToday.length) {
      visible.push(...completedToday.map(leg => ({ ...leg, isCurrentStop:false })));
      if (nextPending && !completedToday.some(leg => leg.id === nextPending.id)) {
        visible.push({ ...nextPending, isCurrentStop:true });
      }
      continue;
    }

    if (nextPending) visible.push({ ...nextPending, isCurrentStop:true });
  }

  return visible.sort((a, b) => (
    String(a.pickupDay || a.day || '').localeCompare(String(b.pickupDay || b.day || ''))
    || Number(a.stopSequence || 0) - Number(b.stopSequence || 0)
  ));
}`,
'canonical multi-stop day view');

route = replaceOnce(route,
`  const sorted = sortedRouteMap(canonical);
  const routeLegsByDay = normalizeLegacyIntermodalRouteIntent(sorted, state.eventsByDay || {});`,
`  const sorted = sortedRouteMap(canonical);
  const legacyRepaired = normalizeLegacyIntermodalRouteIntent(sorted, state.eventsByDay || {});
  const canonicalStops = canonicalMultiStopRouteLegs({ ...state, routeLegsByDay:legacyRepaired });
  const routeLegsByDay = {};
  for (const stop of canonicalStops) {
    const homeDay = stop.pickupDay || stop.day;
    if (!routeLegsByDay[homeDay]) routeLegsByDay[homeDay] = [];
    routeLegsByDay[homeDay].push(stop);
  }`,
'persist canonical multi-stop groups');
write(routePath, route);

// 2) App write logic: append manual stops to the current load and close the exact stop.
const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(app,
`  function saveLoadInfo(payload = {}) {`,
`  function linkManualStopsToActiveLoad(existingMap = {}, incomingMap = {}, activeDay = '') {
    const flatten = map => Object.entries(map || {}).flatMap(([day, legs]) => (legs || []).map(leg => ({ ...leg, day:leg.day || day })));
    const existing = flatten(existingMap);
    const incoming = flatten(incomingMap);
    const existingIds = new Set(existing.map(leg => leg.id));
    const active = existing.filter(leg => leg.status !== 'delivered' && leg.status !== 'cancelled');
    const groupKeys = [...new Set(active.map(leg => leg.loadGroupId || leg.pickupEventId || leg.id).filter(Boolean))];
    if (groupKeys.length !== 1) return incomingMap;

    const groupKey = groupKeys[0];
    const groupLegs = active.filter(leg => (leg.loadGroupId || leg.pickupEventId || leg.id) === groupKey);
    const anchor = [...groupLegs].sort((a, b) => String(a.pickupDay || a.day).localeCompare(String(b.pickupDay || b.day)) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999))[0];
    if (!anchor) return incomingMap;
    let nextSequence = Math.max(0, ...groupLegs.map(leg => Number(leg.stopSequence || 0))) + 1;
    const result = {};

    for (const original of incoming) {
      const isNewManualStop = !existingIds.has(original.id)
        && /manual_form/i.test(String(original.source || ''))
        && original.status !== 'delivered'
        && original.status !== 'cancelled';
      const leg = isNewManualStop ? {
        ...original,
        day:anchor.pickupDay || anchor.day || activeDay,
        pickupDay:anchor.pickupDay || anchor.day || activeDay,
        pickupEventId:anchor.pickupEventId || '',
        pickupMin:anchor.pickupMin ?? null,
        fromCity:anchor.fromCity || original.fromCity,
        fromState:anchor.fromState || original.fromState,
        loadGroupId:anchor.loadGroupId || `load_${anchor.pickupEventId || anchor.id}`,
        stopSequence:nextSequence++,
        source:'manual_form_multistop',
        updatedAt:Date.now(),
      } : original;
      const homeDay = leg.pickupDay || leg.day || activeDay;
      if (!result[homeDay]) result[homeDay] = [];
      result[homeDay].push(leg);
    }
    return result;
  }

  function saveLoadInfo(payload = {}) {`,
'manual stop append helper');

app = replaceOnce(app,
`      let next = {
        ...s,
        loadInfo: { ...(s.loadInfo || {}), ...loadInfoPayload },
        ...(payloadRouteLegsByDay ? { routeLegsByDay: payloadRouteLegsByDay } : {}),
      };
      if (payloadRouteLegsByDay && syncLinkedRouteDetails) {`,
`      const linkedRouteLegsByDay = payloadRouteLegsByDay
        ? linkManualStopsToActiveLoad(s.routeLegsByDay || {}, payloadRouteLegsByDay, s.activeDay)
        : null;
      let next = {
        ...s,
        loadInfo: { ...(s.loadInfo || {}), ...loadInfoPayload },
        ...(linkedRouteLegsByDay ? { routeLegsByDay: linkedRouteLegsByDay } : {}),
      };
      if (linkedRouteLegsByDay && syncLinkedRouteDetails) {`,
'link manual stops during form save');
app = app.replace(`eventsByDay:applyRouteLegDetailsToLinkedEvents(s.eventsByDay || {}, payloadRouteLegsByDay),`, `eventsByDay:applyRouteLegDetailsToLinkedEvents(s.eventsByDay || {}, linkedRouteLegsByDay),`);

app = replaceOnce(app,
`    if (isDeliveryReason(reason)) {
      const existing = findOpenRouteLeg(routeLegsByDay, day, shippingDocs);`,
`    if (isDeliveryReason(reason)) {
      const openStops = routeLegArray(routeLegsByDay)
        .filter(leg => leg.status !== 'delivered' && leg.status !== 'cancelled');
      const docsKey = shippingDocs.toLowerCase();
      const exactDocs = docsKey
        ? openStops.filter(leg => String(leg.shippingDocs || leg.loadNo || '').trim().toLowerCase() === docsKey).at(-1)
        : null;
      const sameDestination = openStops.filter(leg => (
        String(leg.toCity || '').trim().toLowerCase() === String(origin.city || destination.city || '').trim().toLowerCase()
        && String(leg.toState || '').trim().toUpperCase() === String(origin.state || destination.state || '').trim().toUpperCase()
      )).at(-1) || null;
      const existing = exactDocs || sameDestination || (openStops.length === 1 ? openStops[0] : null);`,
'close exact delivery stop');

app = replaceOnce(app,
`        source:'pickup_event',
      });`,
`        loadGroupId:existing?.loadGroupId || ` + "`load_${eventId}`" + `,
        stopSequence:existing?.stopSequence || 1,
        source:'pickup_event',
      });`,
'pickup load group metadata');
write(appPath, app);

// 3) Form labels: explicit stop sequence, Done, Pending, and Next stop.
const dayPath = 'source/src/modules/logbook/DayLogScreen.jsx';
let dayScreen = read(dayPath);
dayScreen = replaceOnce(dayScreen,
`  parts.push(leg.status === 'delivered' ? 'Delivered' : 'Open');
  if (leg.pickupDay) parts.push(` + "`Pickup ${leg.pickupDay}`" + `);`,
`  if (leg.stopCount > 1) parts.push(` + "`Stop ${leg.stopSequence} of ${leg.stopCount}`" + `);
  if (leg.status === 'delivered') parts.push('Done');
  else if (leg.isCurrentStop) parts.push('Next stop');
  else parts.push('Pending');
  if (leg.pickupDay) parts.push(` + "`Pickup ${leg.pickupDay}`" + `);`,
'form stop status labels');
write(dayPath, dayScreen);

// Version metadata.
const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v96.9-multistop-loads',
  releasedAt:'2026-07-12T21:30:00.000Z',
  notes:[
    'Supports one pickup with multiple delivery stops and a separate BOL/load reference for each stop.',
    'Adding a second stop appends it to the active load instead of replacing the first stop or rewriting prior log days.',
    'Delivery / Unloading closes only the matching stop by BOL or destination; remaining stops stay pending.',
    'Pickup day shows all stops, completion day shows the completed stop plus the next pending stop, and later days show only the current pending stop.',
    'When all stops are Done the load closes and no completed stop carries into the next day.'
  ],
  label:'v96.9 Multi-stop Loads',
  updatedAt:'2026-07-12T21:30:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

if (!route.includes('canonicalMultiStopRouteLegs') || !app.includes('linkManualStopsToActiveLoad') || !dayScreen.includes('Next stop')) {
  throw new Error('v96.9 verification failed');
}
console.log('v96.9 multi-stop load logic materialized');
