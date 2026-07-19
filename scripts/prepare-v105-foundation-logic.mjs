import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/documents/documentFoundationV105.js');
let source = fs.readFileSync(target, 'utf8');

if (!source.includes('function deliveryEvidenceForEventV105(')) {
  const pattern = /function cleanDeliveryPretripNoteV105\(note = ''\) \{[\s\S]*?return \{ changed, changedDays, eventsByDay, inspectionByDay, certifyStatus, signatureByDay \};\n\}/;
  if (!pattern.test(source)) throw new Error('v105 missing mixed Delivery / Pre-trip repair block');
  source = source.replace(pattern, `function mixedDeliveryPretripPartsV105(note = '') {
  const parts = textV105(note).split(/\\s*[·•|]\\s*/g).map(textV105).filter(Boolean);
  return {
    parts,
    hasDelivery:parts.some(part => /delivery|unloading/i.test(part)),
    hasPretrip:parts.some(part => /pre[- ]?trip|inspection/i.test(part)),
  };
}

function deliveryEvidenceForEventV105(state = {}, event = {}) {
  if (upperV105(event.status) !== 'ON') return false;
  const refs = eventLoadRefsV105(event);
  if (!refs.length) return false;
  const explicitSequence = Number(event.deliveryStopSequence || event.stopSequence || 0);

  for (const guide of Object.values(state.loadGuidesById || {})) {
    const loadNo = normalizeCanonicalLoadNoV105(guide?.loadNo || guide?.orderNo);
    if (!loadNo || !refs.includes(loadNo)) continue;
    const deliveries = (guide.stops || []).filter(stop => stop?.type === 'delivery');
    if (explicitSequence && deliveries.some(stop => Number(stop.deliverySequence || stop.stopSequence || stop.sequence || 0) === explicitSequence)) return true;
    if (deliveries.some(stop => samePlaceV105(event, stop))) return true;
  }

  return routeEntriesV105(state).some(({ leg }) => {
    const loadNo = canonicalRefFromLegV105(leg);
    if (!loadNo || !refs.includes(loadNo)) return false;
    if (explicitSequence && Number(leg.stopSequence || 0) === explicitSequence) return true;
    return samePlaceV105(event, { city:leg.toCity, state:leg.toState });
  });
}

function cleanDeliveryPretripEventV105(state = {}, event = {}) {
  const mixed = mixedDeliveryPretripPartsV105(event?.note || '');
  if (!mixed.hasDelivery || !mixed.hasPretrip) return { changed:false, event, keptDelivery:false };
  const keptDelivery = deliveryEvidenceForEventV105(state, event);
  const kept = keptDelivery
    ? mixed.parts.filter(part => !/pre[- ]?trip|inspection/i.test(part))
    : mixed.parts.filter(part => !/delivery|unloading/i.test(part));
  const note = kept.join(' · ') || (keptDelivery ? 'Delivery / Unloading' : 'Pre-trip inspection');
  const description = !keptDelivery && /(?:arrival|stop|delivery|unloading)/i.test(textV105(event.description || '')) ? '' : textV105(event.description || '');
  return { changed:note !== textV105(event.note || '') || description !== textV105(event.description || ''), event:{ ...event, note, description }, keptDelivery };
}

function repairDeliveryPretripContaminationV105(state = {}) {
  let changed = false;
  const changedDays = [];
  const eventsByDay = {};
  const inspectionByDay = { ...(state.inspectionByDay || {}) };
  const certifyStatus = { ...(state.certifyStatus || {}) };
  const signatureByDay = { ...(state.signatureByDay || {}) };
  const now = Date.now();

  for (const [day, rows] of Object.entries(state.eventsByDay || {})) {
    eventsByDay[day] = (Array.isArray(rows) ? rows : []).map(event => {
      const repair = cleanDeliveryPretripEventV105(state, event);
      if (!repair.changed) return event;
      changed = true;
      if (!changedDays.includes(day)) changedDays.push(day);
      const inspection = inspectionByDay[day] || {};
      if (repair.keptDelivery && /^auto_on_duty_pretrip/i.test(textV105(inspection.source)) && textV105(inspection.sourceEventId) === textV105(event.id)) {
        delete inspectionByDay[day];
      }
      if (certifyStatus[day] === 'Certified' || signatureByDay[day]?.signed) {
        certifyStatus[day] = 'Needs Recertification';
        signatureByDay[day] = {
          ...(signatureByDay[day] || {}),
          needsRecertification:true,
          changedAfterSignAt:now,
          integrityRepairReason:repair.keptDelivery
            ? 'Removed a hidden Pre-trip label from a verified Delivery / Unloading event. Duty time, status and location were preserved.'
            : 'Removed stale Delivery mission text from a verified Pre-trip event. Duty time, status and location were preserved.',
        };
      }
      return {
        ...repair.event,
        logTextRepairVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
        logTextRepairedAt:now,
      };
    });
  }
  return { changed, changedDays, eventsByDay, inspectionByDay, certifyStatus, signatureByDay };
}`);
  fs.writeFileSync(target, source);
}

console.log('v105 mixed Delivery / Pre-trip evidence repair prepared');
