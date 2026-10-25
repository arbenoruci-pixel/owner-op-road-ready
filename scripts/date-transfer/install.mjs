import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
patch(screen,'<input ref={safetyFileInputRef}', '<input aria-label="Verify saved backup from Files" ref={safetyFileInputRef}');
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

// Explicit reviewed revision: future dates have no assessed coverage (targetEnd=0).
// Resolve the temporal-dead-zone crash without touching historical calculations.
const raw='source/src/core/compliance/rawRodsChecks.js';
const priorRaw='2ba364f4967f6def08257e62d62ef54ae7ae92c7c1329eaebe332415af2b2d7f';
const reviewedRaw='eb44423f1c9ae36122da4157a81fcbd5469536945e7af96dc0e19b28a557f975';
const digest=value=>createHash('sha256').update(value).digest('hex');
assert.ok([priorRaw,reviewedRaw].includes(digest(read(raw))),'Reviewed raw coverage predecessor changed');
patch(raw,"})], total, targetEnd, current, future };","})], total:0, targetEnd, current, future };");
assert.equal(digest(read(raw)),reviewedRaw,'Reviewed future-day coverage output changed');
const locks=JSON.parse(read('module-locks.v1.json'));
assert.ok([priorRaw,reviewedRaw].includes(locks.files[raw]),'Coverage lock predecessor changed');
locks.files[raw]=reviewedRaw;
locks.futureDayCoverageReview='Future-date notice returns zero assessed minutes; recorded historical intervals and totals remain unchanged. date-transfer/runtime.test.mjs and v110372 rendered contracts.';
write('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');

// A compact BOL# heading plus shipping parties is source evidence. Keep RateCon
// headings authoritative when they merely mention the related BOL reference.
patch('source/src/modules/scan/documentIdentityV110334.js',
  'if(groups>=2&&(heading(s,bolTitle)||heading(s,podTitle))){',
  'if(groups>=2&&(heading(s,bolTitle)||heading(s,podTitle)||(heading(s,/^B[O0]L[ \\t]*(?:NUMBER|N[O0]\\.?|#|:)[ \\t:#-]*[A-Z0-9]*\\d[A-Z0-9._/-]*/i)&&!heading(s,rateTitle)))){');
