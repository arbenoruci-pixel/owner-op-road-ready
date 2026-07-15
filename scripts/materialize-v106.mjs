import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.6.0';
const RELEASED_AT = '2026-07-15T20:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.6 missing ${label}`);
  return content.replace(before, after);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

const logbookPath = 'source/src/modules/logbook/LogbookHomeScreen.jsx';
let logbook = read(logbookPath);
if (!logbook.includes('onOpenTransfer')) {
  logbook = replaceOnce(
    logbook,
    `  onOpenDot,\n  onOpenStatus,\n}) {`,
    `  onOpenDot,\n  onOpenStatus,\n  onOpenTransfer,\n}) {`,
    'Logbook transfer prop'
  );
}
if (!logbook.includes('Export / Import all logs')) {
  logbook = replaceOnce(
    logbook,
    `        <div className="logbook-quick-actions-v988">\n          <button type="button" className="primary" onClick={() => onOpenDay?.(today)}>Open today</button>\n          <button type="button" onClick={onOpenUnsigned}>Unsigned</button>\n          <button type="button" onClick={onOpenDot}>DOT</button>\n        </div>`,
    `        <div className="logbook-quick-actions-v988">\n          <button type="button" className="primary" onClick={() => onOpenDay?.(today)}>Open today</button>\n          <button type="button" onClick={onOpenUnsigned}>Unsigned</button>\n          <button type="button" onClick={onOpenDot}>DOT</button>\n        </div>\n\n        <button type="button" className="logbook-transfer-card-v106" onClick={onOpenTransfer}>\n          <span><b>Export / Import all logs</b><em>Every day, event, signature, inspection, route, load guide and linked record.</em></span>\n          <strong>Open ›</strong>\n        </button>`,
    'Logbook transfer entry'
  );
}
write(logbookPath, logbook);

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
if (!app.includes('onOpenTransfer={()=>setState')) {
  app = replaceOnce(
    app,
    `        onOpenDot={()=>setState(s=>({ ...s, view:'dot', sheet:null }))}\n        onOpenStatus={()=>setState(s=>({ ...s, sheet:{ type:'status' } }))}`,
    `        onOpenDot={()=>setState(s=>({ ...s, view:'dot', sheet:null }))}\n        onOpenStatus={()=>setState(s=>({ ...s, sheet:{ type:'status' } }))}\n        onOpenTransfer={()=>setState(s=>({ ...s, view:'backup', sheet:null }))}`,
    'App Logbook transfer action'
  );
}
app = app.replace(
  `      <BackupLogsScreen\n        state={state}\n        onBack={()=>setState(s=>({ ...s, view:'logs', sheet:null }))}\n        onBuildBackup={buildManualBackup}\n        onImportBackup={importManualBackup}\n      />`,
  `      <BackupLogsScreen\n        state={state}\n        onBack={()=>setState(s=>({ ...s, view:'logbook', sheet:null }))}\n        onBuildBackup={buildManualBackup}\n        onImportBackup={importManualBackup}\n      />`
);
app = app.replace(
  `    const restored = normalizeState({\n      ...imported,\n      view:'logs',`,
  `    const restored = normalizeState({\n      ...imported,\n      view:'logbook',`
);
write(appPath, app);

const stylesPath = 'source/src/styles.css';
let styles = read(stylesPath);
styles = appendOnce(styles, '/* v100.6 full Logbook transfer */', `
/* v100.6 full Logbook transfer */
.logbook-transfer-card-v106{
  width:100%;
  min-height:76px;
  margin-top:10px;
  padding:13px 14px;
  border:1px solid #b8cdf8;
  border-radius:19px;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:12px;
  text-align:left;
  background:linear-gradient(145deg,#eef4ff 0%,#fff 70%);
  color:#172554;
  box-shadow:0 8px 22px rgba(37,99,235,.08);
}
.logbook-transfer-card-v106 span,
.logbook-transfer-card-v106 b,
.logbook-transfer-card-v106 em{display:block;min-width:0;}
.logbook-transfer-card-v106 b{font-size:14px;font-weight:1000;letter-spacing:-.015em;}
.logbook-transfer-card-v106 em{margin-top:4px;color:#5b6b88;font-size:10px;font-style:normal;font-weight:800;line-height:1.35;}
.logbook-transfer-card-v106 strong{white-space:nowrap;color:#2456d3;font-size:13px;font-weight:1000;}
`);
write(stylesPath, styles);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100.6-full-logbook-export-import',
  releasedAt:RELEASED_AT,
  notes:[
    'Adds Export / Import all logs directly inside the Logbook home.',
    'Exports every log day, raw duty event, signature, inspection, certification state, route leg, active-load record, driver guide, document link, fuel link, DOT wallet record and business record into one JSON file.',
    'Uses the iPhone share sheet when available so the backup can be saved to Files or uploaded for diagnosis.',
    'Creates an automatic private safety backup before replacing local data during import.',
    'Restores imported data into the Logbook view and keeps legacy Road Ready backup compatibility.',
    'Preserves the v100.5 active-load and signing-integrity repairs, Smart Document Type Arbitration, Driver Mission Guide, HOS, DOT and multi-event movement.'
  ],
  label:'v100.6 Full Logbook Export & Import',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyLogbook = read(logbookPath);
const verifyApp = read(appPath);
const verifyBackup = read('source/src/modules/backup/BackupLogsScreen.jsx');
const verifyUtility = read('source/src/modules/backup/fullBackupV105.js');
if (!verifyLogbook.includes('Export / Import all logs') || !verifyLogbook.includes('onOpenTransfer')) throw new Error('v100.6 Logbook transfer entry failed');
if (!verifyApp.includes("onOpenTransfer={()=>setState") || !verifyApp.includes("view:'logbook'")) throw new Error('v100.6 App transfer navigation failed');
if (!verifyBackup.includes('Export all days') || !verifyBackup.includes('Import all data')) throw new Error('v100.6 transfer screen failed');
if (!verifyUtility.includes('logbookIndexV105') || !verifyUtility.includes('businessStore')) throw new Error('v100.6 full backup payload failed');
console.log('v100.6 Full Logbook Export & Import materialized');
await import('./verify-full-backup-v105.mjs');
await import('./materialize-v107.mjs');
await import('./materialize-v108.mjs');
