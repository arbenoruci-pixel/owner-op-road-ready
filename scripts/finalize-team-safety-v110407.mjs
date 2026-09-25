import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function patch(path, before, after) {
  const source = read(path);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, `v110407 anchor: ${path} ${before.slice(0,70)}`);
  write(path, source.replace(before, after));
}
function replaceFunction(path, start, end, replacement) {
  const source = read(path);
  if (replacement && source.includes(replacement)) return;
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 && replacement === '') return;
  assert.ok(a >= 0 && b > a, `v110407 function boundary: ${path}`);
  write(path, source.slice(0,a) + replacement + source.slice(b));
}

const archive = 'lib/local-db/safetyArchive.js';
patch(archive, "import { getOwnerOpDb, OWNER_OP_DB_NAME } from './dexie.js';",
  "import { getOwnerOpDb, OWNER_OP_DB_NAME } from './dexie.js';\nimport { recordedDeviceInventory } from './deviceInventory.js';");
replaceFunction(archive, 'export async function buildDeviceSafetyInventory(', '\nexport async function buildDeviceSafetyArchive(', `export async function buildDeviceSafetyInventory(state = {}, businessStore = {}) {
  const db = getOwnerOpDb();
  if (!db) throw new Error('IndexedDB is not available. The device inventory could not be verified.');
  const tables = await tableInventory(db);
  const databaseRecords = ['duty_events_local','log_days_local','inspections_local','documents_local','document_links_local']
    .reduce((total, name) => total + (tables[name]?.count || 0), 0);
  return {
    ...recordedDeviceInventory(state, businessStore),
    complete:true,
    generatedAt:new Date().toISOString(), databaseName:OWNER_OP_DB_NAME,
    localStorageEntries:localStorageRows().length,
    dexieTables:tables, databaseRecords,
    dexieRows:Object.values(tables).reduce((sum, row) => sum + row.count, 0),
    documentBlobRows:tables.document_blobs?.count || 0,
    documentBlobBytes:tables.document_blobs?.binaryBytes || 0,
    snapshotRows:tables.app_snapshots?.count || 0,
  };
}
`);

const app = 'source/src/app/App.jsx';
patch(app, 'addTeamDriver, importedLogbookIntegrity, normalizeTeamDriverState, switchTeamDriver',
  'addTeamDriver, importedLogbookIntegrity, normalizeTeamDriverState, switchTeamDriver, updateActiveTeamDriverName');
// v110405's legacy anchor was inside a compatibility comment, not the live normalizer.
patch(app, 'function normalizeState(s) {\n  const before = applyRouteRemovals(upgradeVerifiedLegacyCertifications(s));',
  'function normalizeState(s) {\n  s = normalizeTeamDriverState(s);\n  const before = applyRouteRemovals(upgradeVerifiedLegacyCertifications(s));');
patch(app,
  "setState(s => ({ ...s, driverProfile:{ ...(s.driverProfile || {}), name:value }, roadGuardTabRequest:{ tab:'form', at:Date.now() } }));",
  "setState(s => ({ ...updateActiveTeamDriverName(s, value), roadGuardTabRequest:{ tab:'form', at:Date.now() } }));");
// Historical/day Form overrides stay scoped to the day. Only profile-scope edits rename the team entry.
patch(app,
  '      next = applyDayFormEdit(s, next, payload, s.activeDay);',
  '      next = applyDayFormEdit(s, next, payload, s.activeDay);\n      if (!logDayEdit && payload.driverName !== undefined && s.activeDay === localDayKey(new Date(), getHomeTerminalTimeZone(s))) next = updateActiveTeamDriverName(next, payload.driverName);');
patch(app, 'const integrity = importedLogbookIntegrity(imported, restored);',
  'const integrity = importedLogbookIntegrity(meta.sourceState || imported, restored);');
patch(app, "${first?.day || 'a log day'} lost duty events during restore validation.",
  "${first?.day || first?.driverId || 'a logbook'} has missing or changed records. Your current data was not replaced.");

const backup = 'source/src/modules/backup/BackupLogsScreen.jsx';
patch(backup, "import { prepareBackupFile, sharePreparedBackupFile } from '../../../../lib/local-db/backupFile.js';",
  "import { prepareBackupFile, sharePreparedBackupFile } from '../../../../lib/local-db/backupFile.js';\nimport { assertSafeDeviceImport, hasMeaningfulDeviceData } from '../../../../lib/local-db/deviceInventory.js';");
replaceFunction(backup, 'function hasMeaningfulDeviceData(', '\nfunction validSafetyMeta(', '');
patch(backup, '  const fileInputRef = useRef(null);', '  const latestStateRef = useRef(state);\n  latestStateRef.current = state;\n  const importInProgressRef = useRef(false);\n  const fileInputRef = useRef(null);');
patch(backup, '  const restoreUnlocked = Boolean(lastSafetyExport) || (Boolean(safetyInventory) && !deviceHasUserData);',
  '  const restoreUnlocked = safetyInventory?.complete === true && !safetyError && (Boolean(lastSafetyExport) || !deviceHasUserData);');
patch(backup, "      setSafetyError(error?.message || 'Could not read the local PWA database.');",
  "      setSafetyInventory(null);\n      setSafetyError(error?.message || 'Could not read the local PWA database.');");
patch(backup, '    if (stored.inventory) setSafetyInventory(current => current || stored.inventory);',
  '    // A saved archive inventory is historical; it cannot classify this device as empty.');
replaceFunction(backup, '  async function importFile(file) {', '\n  return (', `  async function importFile(file) {
    if (!file || importInProgressRef.current || busy) return;
    importInProgressRef.current = true;
    setBusy(true);
    setStatus('Checking this device and the selected backup…');
    async function checkCurrentDevice() {
      // readBusinessStore is intentionally forgiving for display; replacement must fail closed.
      const rawBusiness = window.localStorage.getItem('owner-op-road-ready-business-v1');
      if (rawBusiness) JSON.parse(rawBusiness);
      let inventory;
      try {
        inventory = await buildDeviceSafetyInventory(latestStateRef.current, readBusinessStore());
      } catch (error) {
        setSafetyInventory(null);
        setSafetyError(error?.message || 'Could not check this device.');
        assertSafeDeviceImport(null, null);
      }
      setSafetyInventory(inventory);
      const verifiedSafety = readStoredSafetyExport();
      assertSafeDeviceImport(inventory, verifiedSafety);
      return inventory;
    }
    try {
      const inventory = await checkCurrentDevice();
      const payload = JSON.parse(await file.text());
      if (payload?.kind === 'owner_op_road_ready_device_safety_archive') {
        throw new Error('Choose the readable all-data JSON exported from the other device. Keep the Device Safety Backup as your protected copy.');
      }
      const extracted = extractFullBackupV105(payload);
      if (!extracted?.state) throw new Error('This file does not contain Road Ready log data.');
      if (typeof onImportBackup !== 'function') throw new Error('Import is unavailable. No data was replaced.');
      const sum = fullBackupSummaryV105(extracted.state, extracted.businessStore || {});
      const message = [
        'IMPORT Road Ready data from this file?', '', ...summaryLines(sum), '',
        hasMeaningfulDeviceData(inventory)
          ? 'Current local data will be replaced. Keep the verified Device Safety Backup from this device.'
          : 'This device has no recorded Road Ready history. The other device’s records will be loaded here.',
      ].join('\\n');
      if (!window.confirm(message)) { setStatus('Import cancelled. Your current data is unchanged.'); return; }
      await checkCurrentDevice();
      if (onBuildBackup) {
        await onBuildBackup(buildFullBackupPayloadV105(latestStateRef.current, readBusinessStore(), {
          appVersion:CURRENT_APP_VERSION, source:'automatic_pre_import_safety_v105',
        }));
      }
      const repairedImportStateV107 = repairRoadReadyStateV107(structuredClone(extracted.state), { nowDay:localDayKey(), repairNavigation:true, source:'full_backup_import_v107' });
      const repairedBusinessV107 = repairBusinessStoreV107(extracted.businessStore || readBusinessStore(), repairedImportStateV107, { nowDay:localDayKey() });
      const repairedPayloadV107 = { ...payload, state:repairedImportStateV107, businessStore:repairedBusinessV107 };
      // Rescan after file parsing, confirmation and backup writes, immediately before replacement.
      await checkCurrentDevice();
      await onImportBackup(repairedPayloadV107, {
        filename:file.name, summary:sum, schemaVersion:extracted.schemaVersion,
        sourceState:extracted.state,
      });
      writeBusinessStore(repairedBusinessV107);
      setStatus('All data restored from ' + file.name + '.');
    } catch (error) {
      setStatus(error?.message || 'Import failed.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      importInProgressRef.current = false;
      setBusy(false);
    }
  }
`);
patch(backup, '<p>{deviceHasUserData', "<p>{safetyError ? 'The device scan could not be completed. Import stays locked until the scan succeeds.' : !safetyInventory ? 'Checking all drivers and local records…' : deviceHasUserData");
patch(backup, '>Import Road Ready backup</button>', '>Import from another device</button>');
patch(backup, "`${summary.logDays || 0} total log day(s)`,", "`${summary.driverCount || 1} driver logbook(s)`,\n    `${summary.logDays || 0} total log day(s)`,");

const fullBackup = 'source/src/modules/backup/fullBackupV105.js';
patch(fullBackup, "import { sealActiveDriverLogbook } from '../../core/team/teamLogbook.js';",
  "import { sealActiveDriverLogbook } from '../../core/team/teamLogbook.js';\nimport { recordedDeviceInventory } from '../../../../lib/local-db/deviceInventory.js';");
patch(fullBackup, '    businessDocuments:normalizedBusiness.documents.length,',
  '    businessDocuments:normalizedBusiness.documents.length,\n    ...recordedDeviceInventory(state, normalizedBusiness),\n    signatures:recordedDeviceInventory(state, normalizedBusiness).signedLogs,');

const VERSION = '110.4.7', BUILD = 'v110407-team-import-safety', stamp = new Date().toISOString();
for (const path of ['release-version.json','public/app-version.json']) {
  const value = JSON.parse(read(path));
  Object.assign(value, { version:VERSION, build:BUILD, force:false, label:'v110.4.7 Team backup protection', releasedAt:stamp, updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes:['Check every driver and all business records before importing from another device.', 'Keep legacy co-driver names and profile name edits.', 'Validate event identities and recorded details for every imported driver.'] });
  write(path, JSON.stringify(value,null,2)+'\n');
}
for (const path of ['package.json','package-lock.json']) {
  const value = JSON.parse(read(path)); value.version = VERSION;
  if (value.packages?.['']) value.packages[''].version = VERSION;
  write(path, JSON.stringify(value,null,2)+'\n');
}
for (const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let value = read(path);
  for (const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]) value = value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);
  write(path,value);
}
for (const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']) write(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for (const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']) write(path,read(path).replaceAll("'110.4.6'","'"+VERSION+"'").replaceAll("'v110406-rate-route-locations'","'"+BUILD+"'"));
const locks = JSON.parse(read('module-locks.v1.json')); locks.release = VERSION;
write('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.4.7 all-driver backup and import protection installed');
