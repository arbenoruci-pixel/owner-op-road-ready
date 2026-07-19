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
}

// Invalid OCR routes stay visible for review while being excluded from the
// active-load resolver. This prevents strings such as "Date: 2026-07-18" from
// becoming a live destination.
if (!source.includes('excludedFromActiveLoad:true')) {
  source = source.replace(
    "  if (!loadNo || HIDDEN_STATUS_V105.test(textV105(leg.status))) return null;",
    "  if (!loadNo || leg.excludedFromActiveLoad === true || textV105(leg.reviewStatus).toLowerCase() === 'needs_review' || HIDDEN_STATUS_V105.test(textV105(leg.status))) return null;",
  );
  source = source.replace(
    "  state.loadGuidesById = loadGuidesById;\n\n  const openRoute = latestOpenRouteV105(state);",
    `  state.loadGuidesById = loadGuidesById;

  const invalidGuideIds = new Set(Object.values(loadGuidesById).filter(guideHasInvalidStopsV105).map(guide => textV105(guide.id)));
  const invalidLoadNos = new Set(Object.values(loadGuidesById).filter(guideHasInvalidStopsV105).map(guide => normalizeCanonicalLoadNoV105(guide.loadNo || guide.orderNo)).filter(Boolean));
  const routeLegsByDay = {};
  for (const [day, rows] of Object.entries(state.routeLegsByDay || {})) {
    routeLegsByDay[day] = (Array.isArray(rows) ? rows : []).map(leg => {
      const loadNo = canonicalRefFromLegV105(leg);
      const invalidLocation = isDateLikePlaceV105(leg?.fromCity) || isDateLikePlaceV105(leg?.toCity) || isDateLikePlaceV105(leg?.stopAddress);
      const invalidGuide = invalidGuideIds.has(textV105(leg?.loadGroupId)) || invalidLoadNos.has(loadNo);
      if (!invalidLocation && !invalidGuide) return leg;
      guideChanged = true;
      return {
        ...leg,
        excludedFromActiveLoad:true,
        reviewStatus:'needs_review',
        reviewReason:'Route contains date text or an invalid OCR location. Original data remains available for review.',
        foundationVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
      };
    });
  }
  state.routeLegsByDay = routeLegsByDay;

  const openRoute = latestOpenRouteV105(state);`,
  );
  source = source.replace(
    "      if (!loadNo || HIDDEN_STATUS_V105.test(textV105(leg.status))) return false;",
    "      if (!loadNo || leg.excludedFromActiveLoad === true || textV105(leg.reviewStatus).toLowerCase() === 'needs_review' || HIDDEN_STATUS_V105.test(textV105(leg.status))) return false;",
  );
  source = source.replace(
    ".filter(({ leg }) => !HIDDEN_STATUS_V105.test(textV105(leg.status)) && !COMPLETE_STATUS_V105.test(textV105(leg.status)) && textV105(leg.stopStatus).toLowerCase() !== 'done')",
    ".filter(({ leg }) => leg?.excludedFromActiveLoad !== true && textV105(leg.reviewStatus).toLowerCase() !== 'needs_review' && !HIDDEN_STATUS_V105.test(textV105(leg.status)) && !COMPLETE_STATUS_V105.test(textV105(leg.status)) && textV105(leg.stopStatus).toLowerCase() !== 'done')",
  );
}

// Documents already linked to a Logbook day are migrated into the same Vault
// as scanner/business documents. IDs are deduplicated before normalization.
if (!source.includes('const stateDocumentRowsV105')) {
  source = source.replace(
    "  const candidateStore = { ...base, documents:[] };\n  const documents = base.documents.map(document => {",
    `  const stateDocumentRowsV105 = Object.entries(state.documentsByDay || {}).flatMap(([day, rows]) =>
    (Array.isArray(rows) ? rows : []).filter(Boolean).map(document => ({
      ...document,
      date:document.date || day,
      documentDate:document.documentDate || document.date || day,
      source:document.source || 'logbook_state',
    }))
  );
  const sourceDocumentsV105 = [...base.documents];
  const knownDocumentIdsV105 = new Set(sourceDocumentsV105.map(document => textV105(document.id || document.localDocumentId || document.clientDocumentId)).filter(Boolean));
  for (const document of stateDocumentRowsV105) {
    const id = textV105(document.id || document.localDocumentId || document.clientDocumentId);
    if (id && knownDocumentIdsV105.has(id)) continue;
    sourceDocumentsV105.push(document);
    if (id) knownDocumentIdsV105.add(id);
  }
  const candidateStore = { ...base, documents:[] };
  const documents = sourceDocumentsV105.map(document => {`,
  );
}

// Load/Billing checklists count only driver-verified documents. Needs Review
// files remain searchable without falsely completing BOL/POD requirements.
if (!source.includes('const verifiedDocumentsV105')) {
  source = source.replace(
    "  const types = new Set(documents.map(document => textV105(document.type)));\n  const podByStop = {};\n  for (const document of documents.filter(document => document.type === 'pod')) {",
    "  const verifiedDocumentsV105 = documents.filter(document => document.status === 'verified' || document.reviewStatus === 'verified');\n  const types = new Set(verifiedDocumentsV105.map(document => textV105(document.type)));\n  const podByStop = {};\n  for (const document of verifiedDocumentsV105.filter(document => document.type === 'pod')) {",
  );
  source = source.replace(
    "    documents,\n    count:documents.length,",
    "    documents,\n    verifiedDocuments:verifiedDocumentsV105,\n    count:documents.length,\n    verifiedCount:verifiedDocumentsV105.length,",
  );
  source = source.replace(
    "    finalPodPresent:documents.some(document => document.type === 'pod' && (document.isFinalStop || document.finalStop || document.stopSequence === document.stopCount)),",
    "    finalPodPresent:verifiedDocumentsV105.some(document => document.type === 'pod' && (document.isFinalStop || document.finalStop || document.stopSequence === document.stopCount)),",
  );
  source = source.replace(
    "  return summary.documents.some(document => textV105(document.type) === textV105(type));",
    "  return summary.verifiedDocuments.some(document => textV105(document.type) === textV105(type));",
  );
}

fs.writeFileSync(target, source);
console.log('v105 evidence-aware log, route, Vault and checklist repair prepared');
