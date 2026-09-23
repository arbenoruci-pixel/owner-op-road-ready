import fs from 'node:fs';

const VERSION='110.4.5';
const BUILD='v110405-team-logbook-import';
const stamp=new Date().toISOString();

function patch(path,before,after){
  let source=fs.readFileSync(path,'utf8');
  if(source.includes(after)) return;
  if(!source.includes(before)) throw new Error('v110405 anchor changed: '+path);
  source=source.replace(before,after);
  fs.writeFileSync(path,source);
}

for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{
    version:VERSION,
    build:BUILD,
    force:false,
    label:'v110.4.5 Team logbook + phone import',
    releasedAt:stamp,
    updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:[
      'Keep separate duty logs, signatures and inspections for team drivers on one device.',
      'Allow a fresh iPad to import the readable all-data backup directly from the phone.',
      'Validate every non-empty imported log day before replacing local state.'
    ]
  });
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}

for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  value.version=VERSION;
  if(value.packages?.['']) value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}

for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=fs.readFileSync(path,'utf8');
  for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]]){
    value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path,value);
}

for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  fs.writeFileSync(path,fs.readFileSync(path,'utf8')
    .replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION)
    .replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
}

for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']){
  fs.writeFileSync(path,fs.readFileSync(path,'utf8')
    .replaceAll("'110.4.4'","'"+VERSION+"'")
    .replaceAll("'v110404-simple-documents'","'"+BUILD+"'"));
}

const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));
locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');

patch(
  'source/src/app/App.jsx',
  "import DayTransferSheet from '../modules/backup/DayTransferSheet.jsx';",
  "import DayTransferSheet from '../modules/backup/DayTransferSheet.jsx';\nimport TeamDriverBar from '../modules/logbook/TeamDriverBar.jsx';"
);
patch(
  'source/src/app/App.jsx',
  "import { normalizeLoadInfoFromRouteLegs, normalizeRoadReadyState } from '../core/routes/routeNormalization.js';",
  "import { normalizeLoadInfoFromRouteLegs, normalizeRoadReadyState } from '../core/routes/routeNormalization.js';\nimport { addTeamDriver, importedLogbookIntegrity, normalizeTeamDriverState, switchTeamDriver } from '../core/team/teamLogbook.js';"
);
patch(
  'source/src/app/App.jsx',
  "  const routeNormalized = normalizeRoadReadyState(normalized);",
  "  const routeNormalized = normalizeRoadReadyState(normalizeTeamDriverState(normalized, today));"
);
patch(
  'source/src/app/App.jsx',
  `  async function importManualBackup(payload = {}, meta = {}) {
    const imported = payload?.state || payload?.appState || payload;
    if (!imported || typeof imported !== 'object' || (!imported.eventsByDay && !imported.signatureByDay && !imported.inspectionByDay)) {
      throw new Error('Backup file is missing log data.');
    }
    const restored = normalizeState({
      ...imported,
      view:'logbook',
      activeDay:localDayKey(),
      sheet:null,
      selectMode:false,
      selectedIds:[],
      roadGuardTabRequest:null,
      _restoredBackupMeta:{
        importedAt:new Date().toISOString(),
        filename:meta?.filename || '',
        sourceVersion:payload?.appVersion || '',
        schemaVersion:payload?.schemaVersion || '',
      },
    });
    await saveAppSnapshot(APP_STATE_KEY, restored);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('owner-op-road-ready-last-import-meta-v1', JSON.stringify(restored._restoredBackupMeta));
      }
    } catch {}
    lastEventsByDayRef.current = restored.eventsByDay || {};
    lastInspectionByDayRef.current = restored.inspectionByDay || {};
    setState(restored);
  }`,
  `  async function importManualBackup(payload = {}, meta = {}) {
    const imported = payload?.state || payload?.appState || payload;
    if (!imported || typeof imported !== 'object' || (!imported.eventsByDay && !imported.signatureByDay && !imported.inspectionByDay)) {
      throw new Error('Backup file is missing log data.');
    }
    const sourceDays = Object.keys(imported.eventsByDay || {}).sort();
    const latestSourceDay = sourceDays[sourceDays.length - 1] || localDayKey();
    const restored = normalizeState({
      ...imported,
      view:'logbook',
      activeDay: imported.activeDay || latestSourceDay,
      sheet:null,
      selectMode:false,
      selectedIds:[],
      roadGuardTabRequest:null,
      _restoredBackupMeta:{
        importedAt:new Date().toISOString(),
        filename:meta?.filename || '',
        sourceVersion:payload?.appVersion || '',
        schemaVersion:payload?.schemaVersion || '',
        latestSourceDay,
      },
    });
    const integrity = importedLogbookIntegrity(imported, restored);
    if (!integrity.ok) {
      const first = integrity.missing[0];
      throw new Error(\`Import stopped safely: \${first?.day || 'a log day'} lost duty events during restore validation.\`);
    }
    restored._restoredBackupMeta = {
      ...(restored._restoredBackupMeta || {}),
      importedEventDays:integrity.sourceEventDays,
      importedEvents:integrity.sourceEvents,
    };
    await saveAppSnapshot(APP_STATE_KEY, restored);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('owner-op-road-ready-last-import-meta-v1', JSON.stringify(restored._restoredBackupMeta));
      }
    } catch {}
    lastEventsByDayRef.current = restored.eventsByDay || {};
    lastInspectionByDayRef.current = restored.inspectionByDay || {};
    setState(restored);
    return restored._restoredBackupMeta;
  }

  function addTeamDriverToLogbook(name) {
    setState(s => {
      const day = localDayKey(new Date(), getHomeTerminalTimeZone(s));
      const next = addTeamDriver(s, name, day);
      lastEventsByDayRef.current = next.eventsByDay || {};
      lastInspectionByDayRef.current = next.inspectionByDay || {};
      return next;
    });
  }

  function switchActiveTeamDriver(driverId) {
    setState(s => {
      const day = localDayKey(new Date(), getHomeTerminalTimeZone(s));
      const next = switchTeamDriver(s, driverId, day);
      lastEventsByDayRef.current = next.eventsByDay || {};
      lastInspectionByDayRef.current = next.inspectionByDay || {};
      return next;
    });
  }`
);
patch(
  'source/src/app/App.jsx',
  "      {updateBanner}\n      <LogbookHomeScreen",
  "      {updateBanner}\n      <TeamDriverBar\n        state={state}\n        onAddDriver={addTeamDriverToLogbook}\n        onSwitchDriver={switchActiveTeamDriver}\n      />\n      <LogbookHomeScreen"
);
patch(
  'source/src/app/App.jsx',
  "      {updateBanner}{undoBar}\n      <DayLogScreen",
  "      {updateBanner}{undoBar}\n      <TeamDriverBar\n        state={state}\n        onAddDriver={addTeamDriverToLogbook}\n        onSwitchDriver={switchActiveTeamDriver}\n      />\n      <DayLogScreen"
);

patch(
  'source/src/modules/backup/fullBackupV105.js',
  "import { normalizeBusinessStore } from '../business/businessStore.js';",
  "import { normalizeBusinessStore } from '../business/businessStore.js';\nimport { sealActiveDriverLogbook } from '../../core/team/teamLogbook.js';"
);
patch(
  'source/src/modules/backup/fullBackupV105.js',
  `export function compactRoadReadyStateV105(state = {}) {
  const normalized = normalizeRoadReadyState({
    ...state,`,
  `export function compactRoadReadyStateV105(state = {}) {
  const normalized = normalizeRoadReadyState({
    ...sealActiveDriverLogbook(state),`
);

patch(
  'source/src/modules/backup/BackupLogsScreen.jsx',
  `function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (value < 1024) return \`\${value} B\`;
  if (value < 1024 * 1024) return \`\${(value / 1024).toFixed(1)} KB\`;
  return \`\${(value / 1024 / 1024).toFixed(2)} MB\`;
}`,
  `function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (value < 1024) return \`\${value} B\`;
  if (value < 1024 * 1024) return \`\${(value / 1024).toFixed(1)} KB\`;
  return \`\${(value / 1024 / 1024).toFixed(2)} MB\`;
}

function hasMeaningfulDeviceData(inventory = {}) {
  return [
    inventory.events,
    inventory.signedLogs,
    inventory.inspections,
    inventory.routeLegs,
    inventory.walletDocuments,
    inventory.logDocuments,
    inventory.fuelReceipts,
    inventory.businessLoads,
    inventory.businessDocuments,
    inventory.documentBlobRows,
  ].some(value => Number(value || 0) > 0);
}`
);
patch(
  'source/src/modules/backup/BackupLogsScreen.jsx',
  "  const summary = useMemo(() => fullBackupSummaryV105(state, businessStore), [state, businessStore.updatedAt]);",
  "  const summary = useMemo(() => fullBackupSummaryV105(state, businessStore), [state, businessStore.updatedAt]);\n  const deviceHasUserData = useMemo(() => hasMeaningfulDeviceData(safetyInventory || {}), [safetyInventory]);\n  const restoreUnlocked = Boolean(lastSafetyExport) || (Boolean(safetyInventory) && !deviceHasUserData);"
);
patch(
  'source/src/modules/backup/BackupLogsScreen.jsx',
  `    const verifiedSafety = lastSafetyExport || readStoredSafetyExport();
    if (!verifiedSafety) {
      setStatus('Restore is locked until a verified Device Safety Backup is created and saved from this device.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (!lastSafetyExport) setLastSafetyExport(verifiedSafety);`,
  `    const verifiedSafety = lastSafetyExport || readStoredSafetyExport();
    const requiresSafety = hasMeaningfulDeviceData(safetyInventory || {});
    if (requiresSafety && !verifiedSafety) {
      setStatus('This device already has Road Ready data. Create a verified Device Safety Backup here before importing another device.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (verifiedSafety && !lastSafetyExport) setLastSafetyExport(verifiedSafety);`
);
patch(
  'source/src/modules/backup/BackupLogsScreen.jsx',
  `      const message = [
        'RESTORE all Road Ready data from this file?',
        '',
        ...summaryLines(sum),
        '',
        'Current local app data will be replaced. A verified Device Safety Backup was created first and saved from this device.',
      ].join('\\n');`,
  `      const message = [
        'IMPORT Road Ready data from this file?',
        '',
        ...summaryLines(sum),
        '',
        requiresSafety
          ? 'Current local app data will be replaced. A verified Device Safety Backup protects this device first.'
          : 'This device has no meaningful Road Ready history, so the phone backup can be loaded directly.',
      ].join('\\n');`
);
patch(
  'source/src/modules/backup/BackupLogsScreen.jsx',
  `        <section className="backup-info-card">
          <b>Restore protection</b>
          <p>Restore stays locked until this device has a valid verified Device Safety Backup record. Returning from iPhone Files or reopening the PWA will not relock it.</p>
          <button type="button" className="backup-secondary" onClick={() => fileInputRef.current?.click()} disabled={busy || !lastSafetyExport}>Restore from readable backup</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json,.roadready" hidden onChange={event => importFile(event.target.files?.[0])} />
        </section>`,
  `        <section className="backup-info-card">
          <b>Import from phone / iPad</b>
          <p>{deviceHasUserData
            ? 'This device already has Road Ready records. Make the verified safety backup above before importing another device.'
            : 'Fresh device detected. You can import the readable all-data JSON from your phone directly.'}</p>
          <button type="button" className="backup-secondary" onClick={() => fileInputRef.current?.click()} disabled={busy || !restoreUnlocked}>Import Road Ready backup</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json,.roadready" hidden onChange={event => importFile(event.target.files?.[0])} />
        </section>`
);

patch(
  'app/layout.jsx',
  "import '../source/src/road-ready-2026.css';",
  "import '../source/src/road-ready-2026.css';\nimport '../source/src/team-driver-v110405.css';"
);

console.log('PASS — 110.4.5 team logbook and phone→iPad import installed');
