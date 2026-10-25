import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.7.0';
const RELEASED_AT = '2026-07-15T21:15:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.7 missing ${label}`);
  return content.replace(before, after);
}
function replacePattern(content, pattern, replacement, label, marker = '') {
  if (marker && content.includes(marker)) return content;
  if (!pattern.test(content)) throw new Error(`v100.7 missing ${label}`);
  return content.replace(pattern, replacement);
}

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
if (!app.includes("from '../core/integrity/logbookIntegrityV107.js'")) {
  const anchor = "import { normalizeLoadInfoFromRouteLegs, normalizeRoadReadyState } from '../core/routes/routeNormalization.js';";
  app = replaceOnce(app, anchor, `${anchor}\nimport { repairRoadReadyStateV107 } from '../core/integrity/logbookIntegrityV107.js';`, 'App integrity import');
}
if (!app.includes("source:'normalize_state_v107'")) {
  app = replacePattern(
    app,
    /  const routeNormalized = normalizeRoadReadyState\(normalized\);\n  return reconcilePreTripInspections\(routeNormalized, Object\.keys\(routeNormalized\.eventsByDay \|\| eventsByDay\)\);/,
    `  const routeNormalized = normalizeRoadReadyState(normalized);\n  const reconciled = reconcilePreTripInspections(routeNormalized, Object.keys(routeNormalized.eventsByDay || eventsByDay));\n  return repairRoadReadyStateV107(reconciled, { nowDay:today, repairNavigation:true, source:'normalize_state_v107' });`,
    'normalizeState integrity repair',
    "source:'normalize_state_v107'"
  );
}
if (!app.includes("source:'smart_document_link_v107'")) {
  app = replacePattern(
    app,
    /setState\(current => applySmartDocumentLinkV103\(current, payload\)\);/,
    `setState(current => repairRoadReadyStateV107(applySmartDocumentLinkV103(current, payload), { nowDay:localDayKey(), source:'smart_document_link_v107' }));`,
    'smart document integrity repair',
    "source:'smart_document_link_v107'"
  );
}
app = app.replace("if (ref) parts.push(`BOL ${ref}`);", "if (ref) parts.push(`Load ${ref}`);");
if (!app.includes("activeDay:localDayKey(),\n      sheet:null")) {
  app = replacePattern(
    app,
    /(const restored = normalizeState\(\{\n      \.\.\.imported,\n      view:'logbook',\n)(      sheet:null,)/,
    `$1      activeDay:localDayKey(),\n$2`,
    'full import current-day navigation',
    "activeDay:localDayKey(),\n      sheet:null"
  );
}
write(appPath, app);

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = read(guidePath);
guide = guide.replace("    const pickupDay = pickup?.date || guide.pickupDate || localDayKey();", "    const pickupDay = previous?.date || pickup?.date || guide.pickupDate || localDayKey();");
if (!guide.includes('duplicatePickupRouteV107')) {
  guide = replacePattern(
    guide,
    /function mergePlannedRouteLegs\(routeLegsByDay = \{\}, guide = \{\}, eventId = ''\) \{[\s\S]*?\n\}\n\nfunction guideReferenceValues/,
    `function mergePlannedRouteLegs(routeLegsByDay = {}, guide = {}, eventId = '') {\n  const next = {};\n  const guideRef = ref(guide.loadNo || guide.orderNo);\n  Object.entries(routeLegsByDay || {}).forEach(([day, legs]) => {\n    const cleaned = (Array.isArray(legs) ? legs : []).filter(leg => {\n      const sameGuide = leg?.loadGroupId === guide.id || (leg?.source === 'rate_confirmation_guide_v103' && ref(leg?.loadNo) === guideRef);\n      const duplicatePickupRouteV107 = !!eventId && leg?.pickupEventId === eventId && (ref(leg?.loadNo || leg?.shippingDocs) === guideRef || /^pickup_event/i.test(text(leg?.source)));\n      return !sameGuide && !duplicatePickupRouteV107;\n    });\n    if (cleaned.length) next[day] = cleaned;\n  });\n  for (const leg of plannedRouteLegs(guide, eventId)) {\n    const day = leg.pickupDay || guide.pickupDate || localDayKey();\n    next[day] = [...(next[day] || []), leg];\n  }\n  return next;\n}\n\nfunction guideReferenceValues`,
    'Rate Con route merge',
    'duplicatePickupRouteV107'
  );
}
write(guidePath, guide);

const routePath = 'source/src/core/routes/routeNormalization.js';
let route = read(routePath);
if (!route.includes("from '../integrity/logbookIntegrityV107.js'")) route = `import { primaryRouteReferencesV107 } from '../integrity/logbookIntegrityV107.js';\n${route}`;
if (!route.includes('return primaryRouteReferencesV107(value);')) {
  route = replacePattern(
    route,
    /function routeReferenceValuesV105\(value = \{\}\) \{[\s\S]*?\n\}/,
    `function routeReferenceValuesV105(value = {}) {\n  return primaryRouteReferencesV107(value);\n}`,
    'primary route references',
    'return primaryRouteReferencesV107(value);'
  );
}
write(routePath, route);

const scanPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let scan = read(scanPath);
scan = scan.replace("    loadNo:f.loadNo || f.bolNo || currentLoadNo,", "    loadNo:f.loadNo || f.bolNo || '',");
scan = scan.replace("    linkToLogbook:linkableType(result.type?.id),", "    linkToLogbook:linkableType(result.type?.id) && result.needsReview !== true && Number(result.confidence || 0) >= .78,\n    driverVerified:false,");
scan = scan.replace("        linkToLogbook:linkableType(id),", "        linkToLogbook:linkableType(id) && parsed.needsFieldReview !== true && nextConfidence >= .78,\n        driverVerified:false,");
if (!scan.includes('const automationVerifiedV107')) {
  scan = replaceOnce(
    scan,
    "  const selectedMeta = useMemo(() => documentTypeMeta(selectedType || analysis?.type?.id || 'other'), [selectedType, analysis]);",
    "  const selectedMeta = useMemo(() => documentTypeMeta(selectedType || analysis?.type?.id || 'other'), [selectedType, analysis]);\n  const automationVerifiedV107 = fields.driverVerified === true || (analysis?.needsReview !== true && Number(analysis?.confidence || 0) >= .78);",
    'scanner automation verification state'
  );
}
if (!scan.includes('verifiedForAutomationV107')) {
  scan = replaceOnce(
    scan,
    "      const title = String(fields.title || meta.label).trim();",
    "      const title = String(fields.title || meta.label).trim();\n      const verifiedForAutomationV107 = fields.driverVerified === true || (analysis?.needsReview !== true && Number(analysis?.confidence || 0) >= .78);\n      const autoLinkAllowedV107 = fields.linkToLogbook && linkableType(meta.id) && verifiedForAutomationV107;",
    'scanner save evidence gate'
  );
}
scan = scan.replace("      if (meta.target === 'loads') {", "      if (meta.target === 'loads' && verifiedForAutomationV107) {");
if (!scan.includes('driverVerified:verifiedForAutomationV107')) {
  scan = replacePattern(
    scan,
    /nextStore = addBusinessRecord\(nextStore, 'documents', \{ ([^\n]*?) source:'smart_scan_v100' \}\);/,
    `nextStore = addBusinessRecord(nextStore, 'documents', { $1 source:'smart_scan_v100', driverVerified:verifiedForAutomationV107, status:verifiedForAutomationV107 ? 'verified' : 'needs_review', autoLinkBlocked:!verifiedForAutomationV107 });`,
    'scanner document review status',
    'driverVerified:verifiedForAutomationV107'
  );
}
scan = scan.replace("      if (fields.linkToLogbook && linkableType(meta.id)) dispatchSmartDocumentLinkV100(result);", "      if (autoLinkAllowedV107) dispatchSmartDocumentLinkV100(result);");
if (!scan.includes('smart-verify-critical-v107')) {
  scan = replaceOnce(
    scan,
    "          <label className=\"smart-link-toggle-v100\"><input type=\"checkbox\" checked={fields.linkToLogbook !== false} onChange={event => updateField('linkToLogbook', event.target.checked)}/><span><b>Attach this document to the load and log day</b><em>No duty-status time is created or changed.</em></span></label>",
    "          <label className=\"smart-link-toggle-v100\"><input type=\"checkbox\" checked={fields.linkToLogbook !== false} onChange={event => updateField('linkToLogbook', event.target.checked)}/><span><b>Attach this document to the load and log day</b><em>No duty-status time is created or changed.</em></span></label>\n          {!automationVerifiedV107 && <label className=\"smart-link-toggle-v100 smart-verify-critical-v107\"><input type=\"checkbox\" checked={fields.driverVerified === true} onChange={event => setFields(current => ({ ...current, driverVerified:event.target.checked, linkToLogbook:event.target.checked ? true : current.linkToLogbook }))}/><span><b>I checked the critical fields</b><em>Required before a low-confidence document can update a load or Logbook.</em></span></label>}",
    'scanner explicit verification checkbox'
  );
}
write(scanPath, scan);

const backupUtilityPath = 'source/src/modules/backup/fullBackupV105.js';
let backupUtility = read(backupUtilityPath);
if (!backupUtility.includes('repairRoadReadyStateV107')) {
  backupUtility = replaceOnce(
    backupUtility,
    "import { normalizeBusinessStore } from '../business/businessStore.js';",
    "import { normalizeBusinessStore } from '../business/businessStore.js';\nimport { localDayKey } from '../../shared/utils/date.js';\nimport { primaryRouteReferencesV107, repairBusinessStoreV107, repairRoadReadyStateV107 } from '../../core/integrity/logbookIntegrityV107.js';",
    'full backup integrity imports'
  );
}
backupUtility = backupUtility.replace("    ...Object.keys(state.routeLegsByDay || {}),\n", '');
if (!backupUtility.includes("source:'full_backup_export_v107'")) {
  backupUtility = replacePattern(
    backupUtility,
    /export function compactRoadReadyStateV105\(state = \{\}\) \{\n  return normalizeRoadReadyState\(\{([\s\S]*?)\n  \}\);\n\}/,
    `export function compactRoadReadyStateV105(state = {}) {\n  const normalized = normalizeRoadReadyState({$1\n  });\n  return repairRoadReadyStateV107(normalized, { nowDay:localDayKey(), repairNavigation:false, source:'full_backup_export_v107' });\n}`,
    'full backup state repair',
    "source:'full_backup_export_v107'"
  );
}
if (!backupUtility.includes('primaryRouteReferencesV107(row)')) {
  backupUtility = replacePattern(
    backupUtility,
    /      loadReferences:\[\.\.\.new Set\(\[\n        \.\.\.events\.flatMap\(row => \[row\?\.loadNo, row\?\.shippingDocs, row\?\.bol, row\?\.po\]\),\n        \.\.\.routeLegs\.flatMap\(row => \[row\?\.loadNo, row\?\.shippingDocs, row\?\.bol, row\?\.po, row\?\.orderNo, row\?\.legNo\]\),\n      \]\.map\(value => String\(value \|\| ''\)\.trim\(\)\)\.filter\(Boolean\)\)\],/,
    `      loadReferences:[...new Set([\n        ...events.flatMap(row => primaryRouteReferencesV107(row)),\n        ...routeLegs.flatMap(row => primaryRouteReferencesV107(row)),\n      ])],`,
    'backup primary load references',
    'primaryRouteReferencesV107(row)'
  );
}
backupUtility = backupUtility.replace("  const cleanBusiness = normalizeBusinessStore(businessStore || {});", "  const cleanBusiness = normalizeBusinessStore(repairBusinessStoreV107(businessStore || {}, cleanState, { nowDay:localDayKey() }));");
write(backupUtilityPath, backupUtility);

const backupScreenPath = 'source/src/modules/backup/BackupLogsScreen.jsx';
let backupScreen = read(backupScreenPath);
if (!backupScreen.includes('repairBusinessStoreV107')) {
  backupScreen = replaceOnce(
    backupScreen,
    "import { readBusinessStore, writeBusinessStore } from '../business/businessStore.js';",
    "import { readBusinessStore, writeBusinessStore } from '../business/businessStore.js';\nimport { localDayKey } from '../../shared/utils/date.js';\nimport { repairBusinessStoreV107, repairRoadReadyStateV107 } from '../../core/integrity/logbookIntegrityV107.js';",
    'backup screen integrity imports'
  );
}
backupScreen = backupScreen.replace("      const payload = buildFullBackupPayloadV105(state, readBusinessStore(), {", "      const payload = buildFullBackupPayloadV105(state, repairBusinessStoreV107(readBusinessStore(), state, { nowDay:localDayKey() }), {");
if (!backupScreen.includes('repairedImportStateV107')) {
  backupScreen = replaceOnce(
    backupScreen,
    "      await onImportBackup?.(payload, {\n        filename:file.name,\n        summary:sum,\n        schemaVersion:extracted.schemaVersion,\n      });\n      if (extracted.businessStore) writeBusinessStore(extracted.businessStore);",
    "      const repairedImportStateV107 = repairRoadReadyStateV107(extracted.state, { nowDay:localDayKey(), repairNavigation:true, source:'full_backup_import_v107' });\n      const repairedBusinessV107 = repairBusinessStoreV107(extracted.businessStore || readBusinessStore(), repairedImportStateV107, { nowDay:localDayKey() });\n      const repairedPayloadV107 = { ...payload, state:repairedImportStateV107, businessStore:repairedBusinessV107 };\n      await onImportBackup?.(repairedPayloadV107, {\n        filename:file.name,\n        summary:sum,\n        schemaVersion:extracted.schemaVersion,\n      });\n      writeBusinessStore(repairedBusinessV107);",
    'backup import integrity repair'
  );
}
write(backupScreenPath, backupScreen);

const stylePath = 'source/src/turbo-scan-flow.css';
let styles = read(stylePath);
if (!styles.includes('/* v100.7 scanner evidence gate */')) styles += `\n\n/* v100.7 scanner evidence gate */\n.smart-verify-critical-v107{margin-top:9px;border-color:#fed7aa!important;background:#fff7ed!important;}\n.smart-verify-critical-v107 b{color:#9a3412!important;}\n.smart-verify-critical-v107 em{color:#c2410c!important;}\n`;
write(stylePath, styles);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100.7-logbook-load-integrity-engine',
  releasedAt:RELEASED_AT,
  notes:[
    'Adds a Logbook integrity engine that repairs small duty-status overlaps, invalid inspection links, stale open route legs and duplicate route artifacts from stored evidence.',
    'Closes completed legacy loads when the destination event proves delivery and prevents those old routes from returning as active-load or DOT carry-in warnings.',
    'Builds each multi-stop Rate Confirmation route leg on the correct pickup day and replaces the generic pickup route instead of creating a duplicate.',
    'Keeps Rate Confirmation order numbers separate from BOL and PO fields and aligns Home, Driver Mission and Logbook with the active guide.',
    'Blocks low-confidence scans from creating or changing loads until the driver explicitly verifies the critical fields.',
    'Repairs all-data export/import automatically and excludes stop PO numbers from the Logbook load-reference index.'
  ],
  label:'v100.7 Logbook & Load Integrity Engine',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyApp = read(appPath);
const verifyGuide = read(guidePath);
const verifyScan = read(scanPath);
const verifyRoute = read(routePath);
const verifyBackup = read(backupUtilityPath);
if (!verifyApp.includes('repairRoadReadyStateV107') || !verifyApp.includes("source:'smart_document_link_v107'")) throw new Error('v100.7 App integrity integration failed');
if (!verifyGuide.includes('previous?.date') || !verifyGuide.includes('duplicatePickupRouteV107')) throw new Error('v100.7 guide route integration failed');
if (!verifyScan.includes('automationVerifiedV107') || !verifyScan.includes('verifiedForAutomationV107') || !verifyScan.includes('autoLinkAllowedV107')) throw new Error('v100.7 scanner evidence gate failed');
if (!verifyRoute.includes('primaryRouteReferencesV107')) throw new Error('v100.7 canonical route reference integration failed');
if (!verifyBackup.includes("source:'full_backup_export_v107'") || !verifyBackup.includes('primaryRouteReferencesV107(row)')) throw new Error('v100.7 backup integrity integration failed');
console.log('v100.7 Logbook & Load Integrity Engine materialized');
await import('./verify-logbook-integrity-v107.mjs');
