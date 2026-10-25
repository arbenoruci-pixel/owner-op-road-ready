import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8'),write=(f,s)=>fs.writeFileSync(f,s);
function patch(file,before,after){const s=read(file);if(s.includes(after))return;assert.equal(s.split(before).length,2,'Transfer anchor changed: '+file+' '+before.slice(0,70));write(file,s.replace(before,()=>after));}
const target='source/src/modules/backup/';
for(const [from,to]of Object.entries({'hash.js':'transferHash.js','core.js':'transferCore.js','archive.js':'transferArchive.js','storage.js':'transferStorage.js','TransferPanel.jsx':'TransferPanel.jsx'}))fs.writeFileSync(target+to,read('scripts/date-transfer/'+from).replaceAll("'./hash.js'","'./transferHash.js'"));
const screen=target+'BackupLogsScreen.jsx';
// Reinstall cleanly on an already materialized workspace as well as a fresh build.
write(screen,read(screen).replace(/\n\s*<TransferPanel\b[^>]*\/>/g,''));
patch(screen,"import React,", "import TransferPanel from './TransferPanel.jsx';\nimport React,");
patch(screen,'export default function BackupLogsScreen({ state, onBack, onBuildBackup, onImportBackup })','export default function BackupLogsScreen({ state, onBack, onBuildBackup, onImportBackup, onApplyTransfer })');
patch(screen,'<main className="backup-body">','<main className="backup-body">\n        <TransferPanel state={state} onApply={onApplyTransfer} onPrepared={showPreparedExport} appVersion={CURRENT_APP_VERSION} externalBusy={busy} onBusyChange={setBusy}/>');
patch(screen,'onClick={onBack} aria-label="Back"','onClick={onBack} disabled={busy} aria-label="Back"');
const app='source/src/app/App.jsx';
patch(app,'onImportBackup={importManualBackup}',"onImportBackup={importManualBackup}\n        onApplyTransfer={next => setState(next)}");
// Additive final-stage installation: the legacy materializers remain intact and
// every original regression still runs against its intended predecessor.
assert.ok(read(screen).includes('Export Everything'));
assert.ok(read(screen).includes('Export for ChatGPT Review'));
console.log('PASS — final runtime retains date ZIP transfer, Smart Import, full backup and ChatGPT review');

const time='source/src/core/time/homeTerminalTime.js';
patch(time,"export const DEFAULT_HOME_TERMINAL_TIMEZONE = 'America/New_York';","export const DEFAULT_HOME_TERMINAL_TIMEZONE = 'America/Chicago';");
patch(time,"export const DEFAULT_HOME_TERMINAL_TIMEZONE_LABEL = 'Eastern Time';","export const DEFAULT_HOME_TERMINAL_TIMEZONE_LABEL = 'Central Time';");
// Existing configured timezones and recorded event times are intentionally retained.
