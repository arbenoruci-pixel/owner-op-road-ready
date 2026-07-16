import { rawStoredEventsForDay } from '../../core/compliance/rawRodsChecks.js';

export const CERTIFICATION_FINGERPRINT_VERSION_V1032 = '103.2.0';

function text(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function minute(value = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1440, Math.round(parsed))) : 0;
}

function number(value = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}

function canonicalEvent(event = {}) {
  return {
    status:upper(event.status || 'OFF'),
    specialMode:upper(event.specialMode || event.special_mode || 'NONE'),
    startMin:minute(event.startMin),
    endMin:minute(event.endMin),
    city:upper(event.city),
    state:upper(event.state),
    note:text(event.note),
    description:text(event.description),
    shippingDocs:upper(event.shippingDocs || event.loadNo || event.bol || event.po),
    manualMiles:number(event.manualMiles),
    trailer:upper(event.trailer || event.trailerNo),
    chassis:upper(event.chassis),
    container:upper(event.container),
    seal:upper(event.seal),
  };
}

function canonicalInspection(inspection = {}) {
  return {
    complete:Boolean(inspection.complete),
    type:upper(inspection.type),
    checked:Array.isArray(inspection.checked) ? [...inspection.checked].map(upper).sort() : [],
    completedAt:inspection.completedAt || null,
    sourceStartMin:inspection.sourceStartMin == null ? null : minute(inspection.sourceStartMin),
    sourceEndMin:inspection.sourceEndMin == null ? null : minute(inspection.sourceEndMin),
    city:upper(inspection.city),
    state:upper(inspection.state),
  };
}

function canonicalRouteLeg(leg = {}) {
  return {
    kind:upper(leg.kind),
    status:upper(leg.status),
    pickupDay:text(leg.pickupDay || leg.day),
    pickupMin:leg.pickupMin == null ? null : minute(leg.pickupMin),
    deliveryDay:text(leg.deliveryDay),
    deliveryMin:leg.deliveryMin == null ? null : minute(leg.deliveryMin),
    fromCity:upper(leg.fromCity),
    fromState:upper(leg.fromState),
    toCity:upper(leg.toCity),
    toState:upper(leg.toState),
    shippingDocs:upper(leg.shippingDocs || leg.loadNo || leg.bol || leg.po),
    container:upper(leg.container),
    chassis:upper(leg.chassis),
    seal:upper(leg.seal),
  };
}

function routeLegsForDay(state = {}, day = '') {
  return Object.entries(state.routeLegsByDay || {})
    .flatMap(([homeDay, legs]) => (Array.isArray(legs) ? legs : []).map(leg => ({ ...leg, homeDay })))
    .filter(leg => (leg.pickupDay || leg.day || leg.homeDay) === day || leg.deliveryDay === day)
    .map(canonicalRouteLeg)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function certificationPayloadV1032(state = {}, day = '') {
  const events = rawStoredEventsForDay(state.eventsByDay || {}, day)
    .map(canonicalEvent)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.status.localeCompare(b.status) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const equipment = state.equipment || {};
  const trailer = state.currentTrailer && !/no trailer/i.test(String(state.currentTrailer || ''))
    ? state.currentTrailer
    : (state.driver?.trailer || equipment.trailer || equipment.chassis || '');
  return {
    version:CERTIFICATION_FINGERPRINT_VERSION_V1032,
    day:text(day),
    events,
    inspection:canonicalInspection(state.inspectionByDay?.[day] || {}),
    miles:number(state.manualMilesByDay?.[day]),
    form:{
      driver:upper(state.driverProfile?.name || state.driver?.name),
      carrier:upper(state.carrierName || state.driver?.carrier),
      mainOffice:upper(state.mainOfficeAddress || state.driver?.mainOffice),
      truck:upper(state.driver?.truck),
      trailer:upper(trailer),
      coDrivers:upper(state.coDrivers),
    },
    routeLegs:routeLegsForDay(state, day),
  };
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function fnv1a(value = '') {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function certificationFingerprintV1032(state = {}, day = '') {
  return `rods-${CERTIFICATION_FINGERPRINT_VERSION_V1032}-${fnv1a(stableStringify(certificationPayloadV1032(state, day)))}`;
}

export function certificationStatusV1032(state = {}, day = '') {
  const signature = state.signatureByDay?.[day] || {};
  const signed = signature.signed === true;
  const legacyStatus = state.certifyStatus?.[day] || 'Needs signature';
  const storedFingerprint = text(signature.certifiedFingerprint);
  const currentFingerprint = signed && storedFingerprint ? certificationFingerprintV1032(state, day) : '';
  const changed = Boolean(signed && storedFingerprint && currentFingerprint !== storedFingerprint);
  let status = legacyStatus;
  if (signed && storedFingerprint) status = changed ? 'Needs Recertification' : 'Certified';
  else if (!signed && legacyStatus === 'Certified') status = 'Needs signature';
  return { signed, status, changed, storedFingerprint, currentFingerprint, signature };
}

export function reconcileCertificationStatusesV1032(state = {}) {
  let nextState = state;
  let certifyStatus = state.certifyStatus || {};
  let signatureByDay = state.signatureByDay || {};
  let statusChanged = false;
  let signatureChanged = false;
  const days = new Set([...Object.keys(certifyStatus), ...Object.keys(signatureByDay)]);

  for (const day of days) {
    const signature = signatureByDay?.[day] || {};
    const legacyStatus = certifyStatus?.[day] || 'Needs signature';
    if (signature.signed === true && !signature.certifiedFingerprint && legacyStatus === 'Certified') {
      signatureByDay = {
        ...signatureByDay,
        [day]:{
          ...signature,
          certifiedFingerprint:certificationFingerprintV1032(state, day),
          certifiedFingerprintVersion:CERTIFICATION_FINGERPRINT_VERSION_V1032,
          fingerprintMigratedAt:Date.now(),
        },
      };
      signatureChanged = true;
    }
  }

  if (signatureChanged) nextState = { ...nextState, signatureByDay };

  for (const day of days) {
    const effective = certificationStatusV1032(nextState, day);
    const current = certifyStatus?.[day] || 'Needs signature';
    if (effective.status !== current && effective.storedFingerprint) {
      certifyStatus = { ...certifyStatus, [day]:effective.status };
      statusChanged = true;
    }
  }

  if (statusChanged) nextState = { ...nextState, certifyStatus };
  return nextState;
}
