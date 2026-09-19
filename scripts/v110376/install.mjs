import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function patch(path, before, after) {
  const source = read(path);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, `v110.3.76 anchor mismatch: ${path}`);
  write(path, source.replace(before, after));
}
function patchAll(path, before, after, expectedCount) {
  const source = read(path);
  const found = source.split(before).length - 1;
  if (found === 0 && source.includes(after)) return;
  assert.equal(found, expectedCount, `v110.3.76 repeated anchor mismatch: ${path}`);
  write(path, source.replaceAll(before, after));
}

const dayLog = 'source/src/modules/logbook/DayLogScreen.jsx';
patch(dayLog,
`function formSummary(state, events) {`,
`export function formSummary(state, events) {`);

patch(dayLog,
`  const loadBelongsToDay = load.sourceEventDay === state.activeDay
    || (!!load.sourceEventId && eventIds.has(load.sourceEventId))
    || (!load.sourceEventDay && !load.sourceEventId && !routeLegs.length && !eventDocs.length);
  const loadDocs = loadBelongsToDay ? uniqueClean([load.shippingDocs, load.loadNo, load.bol, load.po]) : [];`,
`  const loadBelongsToDay = load.sourceEventDay === state.activeDay
    || (!!load.sourceEventId && eventIds.has(load.sourceEventId));
  // The paper Form represents one recorded log day. A global/current load cache
  // can never fill an unrelated historical day simply because the day has no
  // local route or shipping reference.
  const dayLoad = loadBelongsToDay ? load : {};
  const loadDocs = loadBelongsToDay ? uniqueClean([dayLoad.shippingDocs, dayLoad.loadNo, dayLoad.bol, dayLoad.po]) : [];`);

patch(dayLog,
`  const notes = safeValue(load.notes || load.note || state.formNotes || '', 'None');`,
`  const notes = safeValue(dayLoad.notes || dayLoad.note || '', 'None');`);

patch(dayLog,
`    from: routeLegs[0] ? joinCityState(routeLegs[0].fromCity, routeLegs[0].fromState) : joinCityState(load.pickupCity, load.pickupState),
    to: routeLegs.length ? joinCityState(routeLegs[routeLegs.length - 1].toCity, routeLegs[routeLegs.length - 1].toState) : joinCityState(load.deliveryCity, load.deliveryState),`,
`    from: routeLegs[0] ? joinCityState(routeLegs[0].fromCity, routeLegs[0].fromState) : joinCityState(dayLoad.pickupCity, dayLoad.pickupState),
    to: routeLegs.length ? joinCityState(routeLegs[routeLegs.length - 1].toCity, routeLegs[routeLegs.length - 1].toState) : joinCityState(dayLoad.deliveryCity, dayLoad.deliveryState),`);

patch(dayLog,
`  function editPickup() {`,
`  function saveLegacySingleRouteField(patch = {}) {
    const day = state.activeDay;
    const existing = form.routeLegs[0] || null;
    const docs = form.shippingDocs === 'None' ? '' : form.shippingDocs;
    const leg = {
      ...(existing || {}),
      id:existing?.id || \`manual_form_\${day}_\${Date.now()}\`,
      day:existing?.day || day,
      pickupDay:existing?.pickupDay || day,
      pickupEventId:existing?.pickupEventId || '',
      pickupMin:existing?.pickupMin ?? null,
      fromCity:existing?.fromCity || '',
      fromState:existing?.fromState || '',
      toCity:existing?.toCity || '',
      toState:existing?.toState || '',
      shippingDocs:existing?.shippingDocs || docs,
      loadNo:existing?.loadNo || docs,
      status:existing?.status || 'open',
      source:existing?.source || 'manual_form',
      updatedAt:Date.now(),
      ...patch,
    };
    const routeLegsByDay = { ...(state.routeLegsByDay || {}) };
    const target = [...(routeLegsByDay[day] || [])];
    const index = existing ? target.findIndex(item => item.id === existing.id) : -1;
    if (index >= 0) target[index] = leg; else target.push(leg);
    routeLegsByDay[day] = target;
    onSaveLoad?.({ logDayEdit:true, routeLegsByDay, syncLinkedRouteDetails:true });
  }

  function editPickup() {`);

patch(dayLog,
`    const value = window.prompt('Pickup / From location (City, ST)', joinCityState(load.pickupCity, load.pickupState) === 'None' ? '' : joinCityState(load.pickupCity, load.pickupState));`,
`    const value = window.prompt('Pickup / From location (City, ST)', form.from === 'None' ? '' : form.from);`);

patch(dayLog,
`    onSaveLoad?.({ pickupCity: parsed.city, pickupState: parsed.state });`,
`    saveLegacySingleRouteField({ fromCity:parsed.city, fromState:parsed.state });`);

patch(dayLog,
`    const value = window.prompt('Delivery / To location (City, ST)', joinCityState(load.deliveryCity, load.deliveryState) === 'None' ? '' : joinCityState(load.deliveryCity, load.deliveryState));`,
`    const value = window.prompt('Delivery / To location (City, ST)', form.to === 'None' ? '' : form.to);`);

patch(dayLog,
`    onSaveLoad?.({ deliveryCity: parsed.city, deliveryState: parsed.state });`,
`    saveLegacySingleRouteField({ toCity:parsed.city, toState:parsed.state });`);

patch(dayLog,
`    onSaveLoad?.({ shippingDocs: String(value || '').trim(), loadNo: String(value || '').trim() });`,
`    onSaveLoad?.({ logDayEdit:true, shippingDocs: String(value || '').trim(), loadNo: String(value || '').trim() });`);

patchAll(dayLog,
`    onSaveLoad?.({ routeLegsByDay, syncLinkedRouteDetails:true });`,
`    onSaveLoad?.({ logDayEdit:true, routeLegsByDay, syncLinkedRouteDetails:true });`, 2);

{
  const source=read(dayLog);
  const old=`    onSaveLoad?.({ routeLegsByDay });`;
  const next=`    onSaveLoad?.({ logDayEdit:true, routeLegsByDay });`;
  if (source.includes(old)) write(dayLog,source.replace(old,next));
  else assert.ok(source.includes('onSaveLoad?.({ deleteRouteLeg:request });') || source.includes(next),'v110.3.76 route delete/save anchor mismatch');
}

const app = 'source/src/app/App.jsx';
patch(app,
`        routeLegsByDay: payloadRouteLegsByDay,
        syncLinkedRouteDetails = false,`,
`        routeLegsByDay: payloadRouteLegsByDay,
        syncLinkedRouteDetails = false,
        logDayEdit = false,`);

patch(app,
`      const linkedRouteLegsByDay = payloadRouteLegsByDay ? linkManualStopsToActiveLoad(s.routeLegsByDay || {}, payloadRouteLegsByDay, s.activeDay) : null;
      let next = {
        ...s,
        loadInfo: { ...(s.loadInfo || {}), ...loadInfoPayload },
        ...(linkedRouteLegsByDay ? { routeLegsByDay:linkedRouteLegsByDay } : {}),
      };`,
`      const linkedRouteLegsByDay = payloadRouteLegsByDay
        ? (logDayEdit ? payloadRouteLegsByDay : linkManualStopsToActiveLoad(s.routeLegsByDay || {}, payloadRouteLegsByDay, s.activeDay))
        : null;
      const selectedDayEventIds = new Set((s.eventsByDay?.[s.activeDay] || []).map(event => event?.id).filter(Boolean));
      const logEditOwnsCurrentLoad = logDayEdit && (
        s.loadInfo?.sourceEventDay === s.activeDay
        || (!!s.loadInfo?.sourceEventId && selectedDayEventIds.has(s.loadInfo.sourceEventId))
      );
      const updateGlobalLoadCache = !logDayEdit || logEditOwnsCurrentLoad;
      let next = {
        ...s,
        loadInfo: updateGlobalLoadCache ? { ...(s.loadInfo || {}), ...loadInfoPayload } : (s.loadInfo || {}),
        ...(linkedRouteLegsByDay ? { routeLegsByDay:linkedRouteLegsByDay } : {}),
      };`);

patch(app,
`      if (linkedRouteLegsByDay && syncLinkedRouteDetails) {`,
`      // Only an explicit paper-Form edit may write load/route details back
      // into a recorded log day. Scanner, Reader, Home and business-load saves
      // remain metadata-only with respect to RODS history.
      if (linkedRouteLegsByDay && syncLinkedRouteDetails && logDayEdit) {`);

patch(app,
`        next = {
          ...next,
          eventsByDay:applyRouteLegDetailsToLinkedEvents(s.eventsByDay || {}, linkedRouteLegsByDay),
        };`,
`        const reconciledEvents = applyRouteLegDetailsToLinkedEvents(s.eventsByDay || {}, linkedRouteLegsByDay);
        next = {
          ...next,
          eventsByDay:{
            ...(s.eventsByDay || {}),
            [s.activeDay]:reconciledEvents[s.activeDay] || (s.eventsByDay?.[s.activeDay] || []),
          },
        };`);


patch(app,
`      if (docsKey) {
        next = applyShippingDocumentReference(next, {
          day:s.activeDay,
          value:docsValue,
          allowEmpty:true,
        });
      }`,
`      if (docsKey && logDayEdit) {
        next = applyShippingDocumentReference(next, {
          day:s.activeDay,
          value:docsValue,
          allowEmpty:true,
        });
        if (!updateGlobalLoadCache) next = { ...next, loadInfo:s.loadInfo || {} };
      } else if (docsKey) {
        // Preserve current-load metadata without touching any duty event,
        // route history, signature, certification or selected historical day.
        next = {
          ...next,
          loadInfo:{
            ...(next.loadInfo || {}),
            shippingDocs:docsValue,
            loadNo:docsValue,
            bol:docsValue,
            po:docsValue,
            updatedAt:Date.now(),
          },
        };
      }`);

patch(app,
`      if (payload.pickupCity || payload.pickupState) {
        next.currentLocation = {
          city: payload.pickupCity || s.currentLocation?.city || 'Chicago',
          state: payload.pickupState || s.currentLocation?.state || 'IL',
          locationSource: s.currentLocation?.locationSource || 'manual',
        };
      }
      const changesCertifiedRouteOrDocs = !!docsKey || !!payloadRouteLegsByDay || [
        'pickupCity','pickupState','deliveryCity','deliveryState'
      ].some(key => Object.prototype.hasOwnProperty.call(payload || {}, key));
      next = applyDayFormEdit(s, next, payload, s.activeDay);
      return changesCertifiedRouteOrDocs ? markDayRecert(next, s.activeDay) : reconcileCertificationStatusesV1032(next);`,
`      // A load's pickup address is route metadata. Physical/current location
      // is owned only by the Status/GPS workflow and is never changed here.
      const changesCertifiedRouteOrDocs = logDayEdit && (!!docsKey || !!payloadRouteLegsByDay || [
        'pickupCity','pickupState','deliveryCity','deliveryState'
      ].some(key => Object.prototype.hasOwnProperty.call(payload || {}, key)));
      next = applyDayFormEdit(s, next, payload, s.activeDay);
      return changesCertifiedRouteOrDocs ? markDayRecert(next, s.activeDay) : reconcileCertificationStatusesV1032(next);`);

patch(app,
`      next = normalizeLoadInfoFromRouteLegs(next);
      if (payload.driverName !== undefined) {`,
`      if (updateGlobalLoadCache) next = normalizeLoadInfoFromRouteLegs(next);
      if (payload.driverName !== undefined) {`);

const status = 'source/src/modules/status/StatusWorkflowSheet.jsx';
patch(status,
`      locationSource: gpsFix ? 'gps' : 'manual',`,
`      locationSource: gpsFix ? (gpsFix.source || 'gps') : 'manual',`);

const reverse = 'app/api/location/reverse/route.js';
patch(reverse,
`    const place = firstRecord(geographies, [
      'Incorporated Places',
      'Census Designated Places',
      'County Subdivisions',
    ]);
    const stateRow = firstRecord(geographies, ['States']);
    const city = cleanPlaceName(place?.BASENAME || place?.NAME || '');
    const state = String(place?.STUSAB || stateRow?.STUSAB || '').trim().toUpperCase().slice(0, 2);

    if (!city || !state) return noStoreJson({ error:'No city/state match' }, 404);
    return noStoreJson({ city, state, source:'us-census-geocoder' });`,
`    const place = firstRecord(geographies, [
      'Incorporated Places',
      'Census Designated Places',
    ]);
    const subdivision = firstRecord(geographies, ['County Subdivisions']);
    const stateRow = firstRecord(geographies, ['States']);
    const city = cleanPlaceName(place?.BASENAME || place?.NAME || '');
    const state = String(place?.STUSAB || stateRow?.STUSAB || subdivision?.STUSAB || '').trim().toUpperCase().slice(0, 2);

    if (!state) return noStoreJson({ error:'No state match' }, 404);
    if (!city) {
      // County subdivisions are townships/administrative areas in many states.
      // Returning one as a "city" can create a real GPS coordinate paired with
      // a completely different city name. Preserve the authoritative state and
      // let the client require/derive a nearby city separately.
      return noStoreJson({
        city:'',
        state,
        source:'us-census-state-only',
        localityKind:subdivision ? 'county_subdivision' : 'state_only',
        subdivision:cleanPlaceName(subdivision?.BASENAME || subdivision?.NAME || ''),
      });
    }
    return noStoreJson({ city, state, source:'us-census-geocoder' });`);

const location = 'source/src/core/gps/locationService.js';
patch(location,
`  if (best && best.miles <= 30) return { city:best.city, state:best.state };
  if (best && best.miles <= 45 && best.state === state) return { city:best.city, state:best.state };
  return { city:'GPS', state };`,
`  if (best && best.miles <= 30) return { city:best.city, state:best.state, distanceMiles:Number(best.miles.toFixed(2)) };
  if (best && best.miles <= 45 && best.state === state) return { city:best.city, state:best.state, distanceMiles:Number(best.miles.toFixed(2)) };
  return { city:'GPS', state, distanceMiles:best ? Number(best.miles.toFixed(2)) : null };`);

patch(location,
`  return {
    city:guessed.city || 'GPS',
    state:guessed.state || detectState(lat, lng) || 'UNK',
    source:'offline-nearest-city',
  };`,
`  return {
    city:guessed.city || 'GPS',
    state:guessed.state || detectState(lat, lng) || 'UNK',
    distanceMiles:Number.isFinite(Number(guessed.distanceMiles)) ? Number(guessed.distanceMiles) : null,
    source:'offline-nearest-city',
  };`);

patch(location,
`        if (city && state) resolved = { city, state, source:data.source || 'reverse-geocoder' };`,
`        if (city && state) {
          resolved = { city, state, source:data.source || 'reverse-geocoder' };
        } else if (state) {
          const nearbySameState = fallback.city !== 'GPS'
            && fallback.state === state
            && Number.isFinite(Number(fallback.distanceMiles))
            && Number(fallback.distanceMiles) <= 15;
          resolved = nearbySameState
            ? { ...fallback, state, source:'offline-nearest-city+census-state' }
            : { city:'GPS', state, distanceMiles:fallback.distanceMiles ?? null, source:data.source || 'us-census-state-only' };
        }`);

console.log('PASS — v110.3.76 load/log/GPS state boundaries installed');
