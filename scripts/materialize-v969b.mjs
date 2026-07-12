import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '96.9.0';
const file = p => path.join(ROOT, p);
const read = p => fs.readFileSync(file(p), 'utf8');
function write(p, c) { fs.mkdirSync(path.dirname(file(p)), { recursive:true }); fs.writeFileSync(file(p), c); }

const routePath = 'source/src/core/routes/routeNormalization.js';
let route = read(routePath);
const routeBlock = `function multiStopGroupKey(leg = {}) {
  if (safeText(leg.loadGroupId)) return safeText(leg.loadGroupId);
  if (safeText(leg.pickupEventId)) return 'load_' + safeText(leg.pickupEventId);
  return ['load', safeText(leg.pickupDay || leg.day || 'day'), keyText(leg.fromCity), safeUpper(leg.fromState).slice(0, 2)].join('_');
}

function multiStopIdentity(leg = {}) {
  return [
    safeText(leg.pickupDay || leg.day || ''),
    normalizeDocToken(firstRealText(leg.shippingDocs, leg.loadNo, leg.bol, leg.po)),
    keyText(leg.toCity),
    safeUpper(leg.toState).slice(0, 2),
  ].join('|');
}

function preferMultiStopLeg(a = {}, b = {}) {
  const score = leg => (safeText(leg.pickupEventId) ? 8 : 0) + (safeText(leg.deliveryEventId) ? 4 : 0) + (/pickup_event|delivery_event/i.test(safeText(leg.source)) ? 2 : 0) + Number(leg.updatedAt || 0) / 1e15;
  return score(b) >= score(a) ? b : a;
}

export function canonicalMultiStopRouteLegs(state = {}) {
  const raw = Object.entries(state.routeLegsByDay || {}).flatMap(([homeDay, legs]) => (Array.isArray(legs) ? legs : []).map(leg => normalizeRouteLegRecord({ ...leg, day:leg.day || homeDay }, homeDay)));
  const dedupe = new Map();
  for (const leg of raw) {
    if (leg.status === 'cancelled') continue;
    const key = multiStopIdentity(leg);
    dedupe.set(key, dedupe.has(key) ? preferMultiStopLeg(dedupe.get(key), leg) : leg);
  }
  const grouped = new Map();
  for (const leg of dedupe.values()) {
    const key = multiStopGroupKey(leg);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ ...leg, loadGroupId:key });
  }
  const out = [];
  for (const [loadGroupId, legs] of grouped.entries()) {
    const ordered = [...legs].sort((a, b) => Number(a.stopSequence ?? 9999) - Number(b.stopSequence ?? 9999) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999) || String(a.id || '').localeCompare(String(b.id || '')));
    ordered.forEach((leg, index) => out.push({ ...leg, loadGroupId, stopSequence:Number.isFinite(Number(leg.stopSequence)) ? Number(leg.stopSequence) : index + 1, stopCount:ordered.length }));
  }
  return out;
}

export function routeLegsForDayCanonical(state = {}, day = '') {
  const groups = new Map();
  for (const leg of canonicalMultiStopRouteLegs(state)) {
    if (!groups.has(leg.loadGroupId)) groups.set(leg.loadGroupId, []);
    groups.get(leg.loadGroupId).push(leg);
  }
  const visible = [];
  for (const legs of groups.values()) {
    const ordered = [...legs].sort((a, b) => Number(a.stopSequence || 0) - Number(b.stopSequence || 0));
    const pickupDay = ordered.map(leg => String(leg.pickupDay || leg.day || '')).filter(Boolean).sort()[0] || '';
    if (pickupDay && pickupDay > day) continue;
    const completedToday = ordered.filter(leg => String(leg.deliveryDay || '') === day);
    const pending = ordered.filter(leg => leg.status !== 'cancelled' && (leg.status !== 'delivered' || String(leg.deliveryDay || '') > day));
    const nextPending = pending[0] || null;
    if (pickupDay === day) {
      visible.push(...ordered.map(leg => ({ ...leg, isCurrentStop:nextPending?.id === leg.id })));
    } else if (completedToday.length) {
      visible.push(...completedToday.map(leg => ({ ...leg, isCurrentStop:false })));
      if (nextPending && !completedToday.some(leg => leg.id === nextPending.id)) visible.push({ ...nextPending, isCurrentStop:true });
    } else if (nextPending) {
      visible.push({ ...nextPending, isCurrentStop:true });
    }
  }
  return visible.sort((a, b) => String(a.pickupDay || a.day || '').localeCompare(String(b.pickupDay || b.day || '')) || Number(a.stopSequence || 0) - Number(b.stopSequence || 0));
}
`;
const routeRegex = /export function routeLegsForDayCanonical\(state = \{\}, day = ''\) \{[\s\S]*?\n\}\n\nfunction primaryMilesDayForLeg/;
if (routeRegex.test(route)) route = route.replace(routeRegex, routeBlock + '\nfunction primaryMilesDayForLeg');
else if (!route.includes('canonicalMultiStopRouteLegs')) throw new Error('v96.9 route day function not found');
write(routePath, route);

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
if (!app.includes('linkManualStopsToActiveLoad')) {
  app = app.replace('  function saveLoadInfo(payload = {}) {', `  function linkManualStopsToActiveLoad(existingMap = {}, incomingMap = {}, activeDay = '') {
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
    let sequence = Math.max(0, ...groupLegs.map(leg => Number(leg.stopSequence || 0))) + 1;
    const result = {};
    for (const original of incoming) {
      const append = !existingIds.has(original.id) && /manual_form/i.test(String(original.source || '')) && original.status !== 'delivered' && original.status !== 'cancelled';
      const leg = append ? {
        ...original,
        day:anchor.pickupDay || anchor.day || activeDay,
        pickupDay:anchor.pickupDay || anchor.day || activeDay,
        pickupEventId:anchor.pickupEventId || '',
        pickupMin:anchor.pickupMin ?? null,
        fromCity:anchor.fromCity || original.fromCity,
        fromState:anchor.fromState || original.fromState,
        loadGroupId:anchor.loadGroupId || ('load_' + (anchor.pickupEventId || anchor.id)),
        stopSequence:sequence++,
        source:'manual_form_multistop',
        updatedAt:Date.now(),
      } : original;
      const homeDay = leg.pickupDay || leg.day || activeDay;
      if (!result[homeDay]) result[homeDay] = [];
      result[homeDay].push(leg);
    }
    return result;
  }

  function saveLoadInfo(payload = {}) {`);
}
app = app.replace(/let next = \{\n        \.\.\.s,\n        loadInfo: \{ \.\.\.\(s\.loadInfo \|\| \{\}\), \.\.\.loadInfoPayload \},\n        \.\.\.\(payloadRouteLegsByDay \? \{ routeLegsByDay: payloadRouteLegsByDay \} : \{\}\),\n      \};\n      if \(payloadRouteLegsByDay && syncLinkedRouteDetails\) \{/, `const linkedRouteLegsByDay = payloadRouteLegsByDay ? linkManualStopsToActiveLoad(s.routeLegsByDay || {}, payloadRouteLegsByDay, s.activeDay) : null;
      let next = {
        ...s,
        loadInfo: { ...(s.loadInfo || {}), ...loadInfoPayload },
        ...(linkedRouteLegsByDay ? { routeLegsByDay:linkedRouteLegsByDay } : {}),
      };
      if (linkedRouteLegsByDay && syncLinkedRouteDetails) {`);
app = app.replace('eventsByDay:applyRouteLegDetailsToLinkedEvents(s.eventsByDay || {}, payloadRouteLegsByDay),', 'eventsByDay:applyRouteLegDetailsToLinkedEvents(s.eventsByDay || {}, linkedRouteLegsByDay),');
app = app.replace('const existing = findOpenRouteLeg(routeLegsByDay, day, shippingDocs);', `const openStops = routeLegArray(routeLegsByDay).filter(leg => leg.status !== 'delivered' && leg.status !== 'cancelled');
      const docsKey = shippingDocs.toLowerCase();
      const exactDocs = docsKey ? openStops.filter(leg => String(leg.shippingDocs || leg.loadNo || '').trim().toLowerCase() === docsKey).at(-1) : null;
      const cityKey = String(origin.city || destination.city || '').trim().toLowerCase();
      const stateKey = String(origin.state || destination.state || '').trim().toUpperCase();
      const sameDestination = cityKey ? openStops.filter(leg => String(leg.toCity || '').trim().toLowerCase() === cityKey && String(leg.toState || '').trim().toUpperCase() === stateKey).at(-1) : null;
      const existing = exactDocs || sameDestination || (openStops.length === 1 ? openStops[0] : null);`);
write(appPath, app);

const dayPath = 'source/src/modules/logbook/DayLogScreen.jsx';
let dayScreen = read(dayPath);
dayScreen = dayScreen.replace("  parts.push(leg.status === 'delivered' ? 'Delivered' : 'Open');\n  if (leg.pickupDay) parts.push(`Pickup ${leg.pickupDay}`);", "  if (leg.stopCount > 1) parts.push('Stop ' + leg.stopSequence + ' of ' + leg.stopCount);\n  if (leg.status === 'delivered') parts.push('Done');\n  else if (leg.isCurrentStop) parts.push('Next stop');\n  else parts.push('Pending');\n  if (leg.pickupDay) parts.push('Pickup ' + leg.pickupDay);");
write(dayPath, dayScreen);

const pkg = JSON.parse(read('package.json')); pkg.version = VERSION; write('package.json', JSON.stringify(pkg, null, 2) + '\n');
const lock = JSON.parse(read('package-lock.json')); lock.version = VERSION; if (lock.packages?.['']) lock.packages[''].version = VERSION; write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
write('public/app-version.json', JSON.stringify({ version:VERSION, build:'v96.9-multistop-loads', releasedAt:'2026-07-12T21:30:00.000Z', notes:['One pickup can keep multiple delivery stops with separate BOLs.','Add stop appends to the active load and never replaces earlier stops.','Delivery closes only the matching stop by BOL or destination.','Pickup day shows all stops; later days show the completed stop plus the next pending stop, then only the current pending stop.','All completed stops disappear from the next day after the load is fully done.'], label:'v96.9 Multi-stop Loads', updatedAt:'2026-07-12T21:30:00.000Z' }, null, 2) + '\n');
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, "const OWNER_OP_SW_VERSION = '96.9.0';"));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, "const FALLBACK_APP_VERSION = '96.9.0';"));
if (!route.includes('canonicalMultiStopRouteLegs') || !app.includes('linkManualStopsToActiveLoad')) throw new Error('v96.9 verification failed');
console.log('v96.9 multi-stop load logic materialized');
