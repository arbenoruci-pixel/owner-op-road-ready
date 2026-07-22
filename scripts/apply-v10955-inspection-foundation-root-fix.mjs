import fs from 'node:fs';

const VERSION = '109.5.5';
const BUILD = 'v10955-inspection-foundation-root-fix';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceFunction(source, name, nextName, replacement) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`\n\nfunction ${nextName}`, start);
  if (start < 0 || end < 0) throw new Error(`v109.5.5 function boundary missing: ${name} -> ${nextName}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const foundationPath = 'source/src/modules/documents/documentFoundationV105.js';
let foundation = read(foundationPath);

const newRepair = `function structuredPretripReasonV105(event = {}) {
  const reasons = Array.isArray(event?.reasons) ? event.reasons : [];
  return reasons.some(reason => /pre[- ]?trip|inspection/i.test(textV105(reason)));
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
      const originalNote = textV105(event?.note || '');
      const cleaned = cleanDeliveryPretripNoteV105(originalNote);
      if (cleaned === originalNote) return event;

      changed = true;
      if (!changedDays.includes(day)) changedDays.push(day);

      const inspection = inspectionByDay[day] || {};
      const linkedAutoInspection = /^auto_on_duty_pretrip/i.test(textV105(inspection.source))
        && textV105(inspection.sourceEventId) === textV105(event.id);
      const confirmedPretrip = structuredPretripReasonV105(event)
        || event?.inspectionConfirmed === true
        || inspection?.driverConfirmed === true;

      // Old v105 logic deleted every linked auto inspection when it cleaned the
      // display note. Multi-activity events keep real PTI in reasons[], so their
      // completed inspection audit record must remain intact.
      if (linkedAutoInspection && !confirmedPretrip) {
        delete inspectionByDay[day];
      }

      // A display-note cleanup for a structured/confirmed PTI is metadata only.
      // Recertification is still required for genuinely false hidden PTI text.
      if (!confirmedPretrip && (certifyStatus[day] === 'Certified' || signatureByDay[day]?.signed)) {
        certifyStatus[day] = 'Needs Recertification';
        signatureByDay[day] = {
          ...(signatureByDay[day] || {}),
          needsRecertification:true,
          changedAfterSignAt:now,
          integrityRepairReason:'Removed a hidden Pre-trip label from a Delivery / Unloading event. Duty time, status and location were preserved.',
        };
      }

      return {
        ...event,
        note:cleaned,
        logTextRepairVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
        logTextRepairedAt:now,
      };
    });
  }
  return { changed, changedDays, eventsByDay, inspectionByDay, certifyStatus, signatureByDay };
}`;

foundation = replaceFunction(
  foundation,
  'repairDeliveryPretripContaminationV105',
  'latestOpenRouteV105',
  newRepair,
);
write(foundationPath, foundation);

const integrityPath = 'source/src/core/integrity/logbookIntegrityV107.js';
let integrity = read(integrityPath);
const newEventText = `function eventText(event = {}) {
  const reasons = Array.isArray(event?.reasons) ? event.reasons : [];
  return [...reasons, event?.note || '', event?.description || '']
    .map(value => text(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}`;
integrity = replaceFunction(integrity, 'eventText', 'isDeliveryEvent', newEventText);
write(integrityPath, integrity);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.5.5 Inspection Foundation Root Fix',
  force:true,
  notes:[
    'Stops the v105 document foundation repair from deleting a real completed inspection on multi-activity Delivery / Unloading plus Pre-trip events.',
    'Reads structured reasons[] in the v107 inspection-link repair.',
    'Keeps the old false-contamination cleanup only when no structured or driver-confirmed Pre-trip evidence exists.',
    'Does not change duty times, duty statuses, GPS locations or signed log content.'
  ]
}, null, 2)}\n`);

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

const legacyVerifier = 'scripts/verify-v10943-auto-upright.mjs';
let verify = read(legacyVerifier);
verify = verify.replace(/assert\.equal\(release\.version, '[^']+'\);/, `assert.equal(release.version, '${VERSION}');`);
verify = verify.replace(/assert\.equal\(release\.build, '[^']+'\);/, `assert.equal(release.build, '${BUILD}');`);
verify = verify.replace(/assert\.equal\(packageJson\.version, '[^']+'\);/, `assert.equal(packageJson.version, '${VERSION}');`);
write(legacyVerifier, verify);

if (!foundation.includes('const confirmedPretrip = structuredPretripReasonV105(event)')) throw new Error('v109.5.5 structured PTI guard missing');
if (!foundation.includes('linkedAutoInspection && !confirmedPretrip')) throw new Error('v109.5.5 delete guard missing');
if (!integrity.includes('const reasons = Array.isArray(event?.reasons)')) throw new Error('v109.5.5 V107 reasons support missing');

console.log('PASS — v109.5.5 protects real multi-reason inspection audit records at the v105 deletion source');
