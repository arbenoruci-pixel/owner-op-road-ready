import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '103.2.0';
const RELEASED_AT = '2026-07-16T09:10:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v103.2 missing ${label}`);
  return content.replace(before, after);
}

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  "import { signableLogDays, signConfirmMessage, signBlockMessage } from '../modules/logbook/signing.js';",
  "import { signableLogDays, signConfirmMessage, signBlockMessage } from '../modules/logbook/signing.js';\nimport { CERTIFICATION_FINGERPRINT_VERSION_V1032, certificationFingerprintV1032, reconcileCertificationStatusesV1032 } from '../modules/logbook/certificationFingerprintV1032.js';",
  'certification fingerprint import'
);
app = replaceOnce(
  app,
  `  const routeNormalized = normalizeRoadReadyState(normalized);
  return reconcilePreTripInspections(routeNormalized, Object.keys(routeNormalized.eventsByDay || eventsByDay));`,
  `  const routeNormalized = normalizeRoadReadyState(normalized);
  const inspectionNormalized = reconcilePreTripInspections(routeNormalized, Object.keys(routeNormalized.eventsByDay || eventsByDay));
  return reconcileCertificationStatusesV1032(inspectionNormalized);`,
  'startup certification reconciliation'
);
app = replaceOnce(
  app,
  `  function markDayRecert(next, day = next.activeDay) {
    if (next.certifyStatus?.[day] === 'Certified') {
      next = { ...next, certifyStatus: { ...next.certifyStatus, [day]: 'Needs Recertification' } };
    }
    return next;
  }`,
  `  function markDayRecert(next, day = next.activeDay) {
    const signature = next.signatureByDay?.[day] || {};
    if (signature.signed && signature.certifiedFingerprint) {
      const currentFingerprint = certificationFingerprintV1032(next, day);
      const status = currentFingerprint === signature.certifiedFingerprint ? 'Certified' : 'Needs Recertification';
      if (next.certifyStatus?.[day] !== status) {
        next = { ...next, certifyStatus:{ ...(next.certifyStatus || {}), [day]:status } };
      }
      return next;
    }
    if (next.certifyStatus?.[day] === 'Certified') {
      next = { ...next, certifyStatus: { ...next.certifyStatus, [day]: 'Needs Recertification' } };
    }
    return next;
  }`,
  'content-aware recertification'
);
app = replaceOnce(
  app,
  `        const existingDaySignature = (s.signatureByDay || {})[day] || {};
        const { signatureDataUrl, ...compactDaySignature } = existingDaySignature;

        return {`,
  `        const existingDaySignature = (s.signatureByDay || {})[day] || {};
        const { signatureDataUrl, ...compactDaySignature } = existingDaySignature;
        const certifiedFingerprintV1032 = certificationFingerprintV1032(s, day);

        return {`,
  'signing fingerprint calculation'
);
app = replaceOnce(
  app,
  `              signed: true,
              signedAt: Date.now(),`,
  `              signed: true,
              signedAt: Date.now(),
              certifiedFingerprint:certifiedFingerprintV1032,
              certifiedFingerprintVersion:CERTIFICATION_FINGERPRINT_VERSION_V1032,
              certifiedSnapshotAt:Date.now(),`,
  'signed day fingerprint metadata'
);
app = replaceOnce(
  app,
  `  function certify(day = state.activeDay) {
    signLogDay(day, {});
  }

  function saveInspection(payload) {`,
  `  function certify(day = state.activeDay) {
    signLogDay(day, {});
  }

  function signLogDays(days = []) {
    const uniqueDays = [...new Set((days || []).filter(Boolean))];
    if (!uniqueDays.length) return;
    const existingSignature = state.driverSignature || null;
    if (!existingSignature?.dataUrl) {
      window.alert?.('Add your driver signature first.');
      return;
    }
    const blocked = uniqueDays.map(day => ({ day, message:signBlockMessage(state, day) })).filter(item => item.message);
    if (blocked.length) {
      window.alert?.(blocked.map(item => item.day + ':\\n' + item.message).join('\\n\\n'));
      return;
    }
    const warnings = uniqueDays.flatMap(day => {
      const message = signConfirmMessage(state, day);
      return message ? [day + ': ' + message.replace('Review before signing this log:', '').trim()] : [];
    });
    if (warnings.length && !window.confirm('Review before signing listed logs:\\n\\n' + warnings.join('\\n\\n'))) return;

    setState(s => {
      let signatureByDay = { ...(s.signatureByDay || {}) };
      let certifyStatus = { ...(s.certifyStatus || {}) };
      const now = Date.now();
      for (const day of uniqueDays) {
        const existingDaySignature = signatureByDay[day] || {};
        const { signatureDataUrl, ...compactDaySignature } = existingDaySignature;
        signatureByDay[day] = {
          ...compactDaySignature,
          driverName:existingSignature.driverName || s.driverProfile?.name || 'Driver',
          signatureRef:'driverSignature',
          signed:true,
          signedAt:now,
          certifiedFingerprint:certificationFingerprintV1032(s, day),
          certifiedFingerprintVersion:CERTIFICATION_FINGERPRINT_VERSION_V1032,
          certifiedSnapshotAt:now,
        };
        certifyStatus[day] = 'Certified';
      }
      return reconcileCertificationStatusesV1032({ ...s, signatureByDay, certifyStatus });
    });
  }

  function saveInspection(payload) {`,
  'atomic bulk signing'
);
app = replaceOnce(
  app,
  `      onSignDay={(day)=>signLogDay(day, {})}
      />`,
  `      onSignDay={(day)=>signLogDay(day, {})}
      onSignAll={signLogDays}
      />`,
  'bulk signing prop'
);
write(appPath, app);

const unsignedPath = 'source/src/modules/logbook/UnsignedLogsScreen.jsx';
let unsigned = read(unsignedPath);
unsigned = replaceOnce(
  unsigned,
  'export default function UnsignedLogsScreen({ state, days = [], onBack, onOpenDay, onSignDay }) {',
  'export default function UnsignedLogsScreen({ state, days = [], onBack, onOpenDay, onSignDay, onSignAll }) {',
  'unsigned bulk prop'
);
unsigned = replaceOnce(
  unsigned,
  `<button className="unsigned-sign-all" onClick={() => days.forEach(day => onSignDay(day))}>
          Sign listed logs with saved signature
        </button>`,
  `<button className="unsigned-sign-all" onClick={() => onSignAll ? onSignAll(days) : days.forEach(day => onSignDay(day))}>
          Sign listed logs with saved signature
        </button>`,
  'atomic bulk button'
);
write(unsignedPath, unsigned);

const signingPath = 'source/src/modules/logbook/signing.js';
let signing = read(signingPath);
if (!signing.includes("from './certificationFingerprintV1032.js'")) {
  signing = signing.replace(
    "import { eventHasNoLoadDeclaration, findShippingDocsTargetEvent, isDeliveryLoadEvent, isExplicitNoLoadReference, isPickupLoadEvent } from '../../core/routes/shippingDocsRepair.js';",
    "import { eventHasNoLoadDeclaration, findShippingDocsTargetEvent, isDeliveryLoadEvent, isExplicitNoLoadReference, isPickupLoadEvent } from '../../core/routes/shippingDocsRepair.js';\nimport { certificationStatusV1032 } from './certificationFingerprintV1032.js';"
  );
}
signing = replaceOnce(
  signing,
  `  const status = state.certifyStatus?.[day] || 'Needs signature';
  const signed = !!state.signatureByDay?.[day]?.signed;`,
  `  const certificationV1032 = certificationStatusV1032(state, day);
  const status = certificationV1032.status;
  const signed = certificationV1032.signed;`,
  'effective fingerprint signing status'
);
signing = replaceOnce(
  signing,
  `    const signed = !!state.signatureByDay?.[prevDay]?.signed;
    const statusText = state.certifyStatus?.[prevDay] || '';
    const needsRecert = statusText === 'Needs Recertification';
    const certified = statusText === 'Certified' && signed && !needsRecert;`,
  `    const prevSignState = logSignState(state, prevDay);
    const signed = prevSignState.signed;
    const statusText = prevSignState.status || '';
    const needsRecert = statusText === 'Needs Recertification';
    const certified = statusText === 'Certified' && signed && !needsRecert;`,
  'DOT package fingerprint status'
);
write(signingPath, signing);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v103.2-stable-log-certification-snapshot',
  releasedAt:RELEASED_AT,
  notes:[
    'Stores a canonical RODS fingerprint with every certification and recertification.',
    'Requests recertification only when DOT-relevant log content changes, not when app metadata, IDs, reloads, sync state or update timestamps change.',
    'Automatically migrates existing Certified signed days to the fingerprint system without asking the driver to sign them again.',
    'Keeps existing Needs Recertification days visible until the driver reviews and signs them once under the new fingerprint system.',
    'Makes Sign listed logs atomic so every selected day is certified in one saved state update.',
    'Does not alter duty-status times, statuses, locations, notes, inspections, miles or shipping documents.'
  ],
  label:'v103.2 Stable Log Certification',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const checks = [
  ['source/src/app/App.jsx','certificationFingerprintV1032'],
  ['source/src/app/App.jsx','certifiedFingerprint:certifiedFingerprintV1032'],
  ['source/src/app/App.jsx','onSignAll={signLogDays}'],
  ['source/src/modules/logbook/signing.js','certificationStatusV1032'],
  ['source/src/modules/logbook/UnsignedLogsScreen.jsx','onSignAll ? onSignAll(days)'],
  ['source/src/modules/logbook/certificationFingerprintV1032.js','reconcileCertificationStatusesV1032'],
];
for (const [relative, needle] of checks) {
  if (!read(relative).includes(needle)) throw new Error(`v103.2 verification missing ${needle} in ${relative}`);
}
console.log('v103.2 stable log certification materialized');
await import('./verify-certification-fingerprint-v1032.mjs');
