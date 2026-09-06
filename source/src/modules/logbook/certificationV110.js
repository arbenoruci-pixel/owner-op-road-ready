import { certificationPayloadV1032 as legacyPayload, certificationFingerprintV1032 as legacyFingerprint, certificationStatusV1032 as legacyStatus } from './certificationFingerprintV1032.js';
import { getHomeTerminalTimeZone } from '../../core/time/homeTerminalTime.js';

// v1 contract: certification concerns this day's recorded facts. Current fleet,
// scanner output and a load's later lifecycle are outside the signed payload.
export const CERTIFICATION_FINGERPRINT_VERSION_V1032 = '110.1.0';
export const stable = value => value == null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
const clone = value => value === undefined ? undefined : structuredClone(value);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
function digest(value) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h.toString(16).padStart(8, '0'); }
function contextFor(state, day) {
  const old = state.signatureByDay?.[day]?.certificationContext;
  if (old?.version === 1) return clone(old);
  const form = legacyPayload(state, day).form;
  return { version:1, form:clone(form), homeTimezone:getHomeTerminalTimeZone(state), profileAtBackup:{
    driverName:form.driver, carrierName:form.carrier, mainOffice:form.mainOffice,
    unit:form.truck, trailer:form.trailer, usdot:state.dotNumber || state.usdot || state.driverProfile?.usdotNumber || '',
    homeTerminal:state.homeTerminalAddress || state.driverProfile?.homeTerminal || '',
  } };
}
function routesForDay(state, day) {
  const rows = [];
  for (const [homeDay, legs] of Object.entries(state.routeLegsByDay || {})) for (const leg of Array.isArray(legs) ? legs : []) {
    if (!leg) continue;
    const ref = clean(leg.shippingDocs || leg.loadNo || leg.bol || leg.po);
    if ((leg.pickupDay || leg.day || homeDay) === day) rows.push({ activity:'pickup', minute:leg.pickupMin ?? null, city:clean(leg.fromCity), state:clean(leg.fromState), reference:ref });
    if (leg.deliveryDay === day) rows.push({ activity:'delivery', minute:leg.deliveryMin ?? null, city:clean(leg.toCity), state:clean(leg.toState), reference:ref });
  }
  return rows.sort((a,b) => stable(a).localeCompare(stable(b)));
}
export function certificationContent(state, day, context = contextFor(state, day)) {
  const old = legacyPayload(state, day);
  return { version:1, day, events:old.events, inspection:old.inspection, miles:old.miles,
    form:clone(context.form), homeTimezone:context.homeTimezone,
    dayForm:clone(state.formByDay?.[day] || {}), routeLegs:routesForDay(state, day) };
}
function fingerprint(content) { return 'rods-110.1.0-' + digest(stable(content)); }
export function certificationFingerprintV1032(state = {}, day = '') {
  const sig = state.signatureByDay?.[day];
  if (sig?.certifiedFingerprint && !sig.certificationContext) return legacyFingerprint(state, day);
  return fingerprint(certificationContent(state, day));
}
export function certificationStatusV1032(state = {}, day = '') {
  const sig = state.signatureByDay?.[day] || {};
  if (!sig.certificationContext) return legacyStatus(state, day);
  const content = certificationContent(state, day);
  // The full canonical payload comparison is authoritative; the short digest
  // is an index only and can never hide a digest collision.
  const fields = Object.keys(content).filter(k => stable(content[k]) !== stable(sig.certifiedContent?.[k]));
  const changed = sig.signed === true && (fields.length > 0 || sig.needsRecertification === true);
  return { signed:sig.signed === true, changed, changedFields:fields,
    status:sig.signed !== true ? 'Needs signature' : changed ? 'Needs Recertification' : 'Certified',
    storedFingerprint:sig.certifiedFingerprint || '', currentFingerprint:fingerprint(content), signature:sig };
}
export function createCertificationRecord(state, day, { driverName = 'Driver', now = Date.now() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('A valid log day is required.');
  const prev = state.signatureByDay?.[day] || {};
  const context = contextFor(state, day), content = certificationContent(state, day, context);
  const { certificationHistory = [], ...prior } = clone(prev);
  const { needsRecertification, changedAfterSignAt, integrityRepairReason, repairReason, ...cleanPrior } = prior;
  return { ...cleanPrior, signed:true, driverName, signatureRef:'driverSignature', signedAt:now,
    certifiedSnapshotAt:now, certifiedFingerprintVersion:CERTIFICATION_FINGERPRINT_VERSION_V1032,
    certifiedFingerprint:fingerprint(content), certificationContext:context, certifiedContent:content,
    // Prior attestations stay available; no back-dating or automatic re-signing.
    certificationHistory:prev.signed ? [...certificationHistory, prior] : certificationHistory };
}
export function upgradeVerifiedLegacyCertifications(state = {}) {
  let next = state;
  for (const [day, sig] of Object.entries(state.signatureByDay || {})) {
    if (!sig?.signed || sig.certificationContext || !sig.certifiedFingerprint || sig.needsRecertification || state.certifyStatus?.[day] !== 'Certified') continue;
    if (legacyFingerprint(state, day) !== sig.certifiedFingerprint) continue;
    const context = contextFor(state, day), content = certificationContent(state, day, context);
    next = { ...next, signatureByDay:{ ...next.signatureByDay, [day]:{ ...sig,
      legacyCertifiedFingerprint:sig.certifiedFingerprint, legacyCertifiedFingerprintVersion:sig.certifiedFingerprintVersion || '103.2.0',
      certifiedFingerprint:fingerprint(content), certifiedFingerprintVersion:CERTIFICATION_FINGERPRINT_VERSION_V1032,
      certificationContext:context, certifiedContent:content } } };
  }
  return next;
}
export function reconcileCertificationStatusesV1032(state = {}) {
  let next = state;
  for (const day of Object.keys(state.signatureByDay || {})) {
    const status = certificationStatusV1032(state, day);
    if (status.storedFingerprint && state.certifyStatus?.[day] !== status.status) next = { ...next, certifyStatus:{ ...next.certifyStatus, [day]:status.status } };
  }
  return next;
}
