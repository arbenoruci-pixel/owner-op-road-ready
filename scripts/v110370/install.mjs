import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,'Route removal anchor: '+path);fs.writeFileSync(path,s.replace(before,after));}
function prepend(path,line){const s=read(path);if(s.includes(line))return;fs.writeFileSync(path,s.startsWith("'use client';")?s.replace("'use client';","'use client';\n"+line):line+'\n'+s);}
fs.copyFileSync('scripts/v110370/routeRemoval.js','source/src/core/routes/routeRemovalV110370.js');
const deletion='source/src/core/routes/routeLegDeletion.js';
prepend(deletion,"import {rememberRouteRemoval} from './routeRemovalV110370.js';");
patch(deletion,'export function deleteRouteLegFromState(state = {}, request) {','function deleteRouteLegFromStateLegacy(state = {}, request) {');
const deleteWrapper='export function deleteRouteLegFromState(state = {}, request) { return rememberRouteRemoval(state,deleteRouteLegFromStateLegacy(state,request)); }';
if(!read(deletion).includes(deleteWrapper))fs.appendFileSync(deletion,'\n'+deleteWrapper+'\n');
const cleanup='source/src/core/routes/logbookLoadCleanup.js';
prepend(cleanup,"import {rememberRouteRemoval} from './routeRemovalV110370.js';");
patch(cleanup,'export function cleanupDeletedLogbookData(before = {}, after = {}, command = {}) {','function cleanupDeletedLogbookDataLegacy(before = {}, after = {}, command = {}) {');
const cleanupWrapper='export function cleanupDeletedLogbookData(before = {}, after = {}, command = {}) { return rememberRouteRemoval(before,cleanupDeletedLogbookDataLegacy(before,after,command)); }';
if(!read(cleanup).includes(cleanupWrapper))fs.appendFileSync(cleanup,'\n'+cleanupWrapper+'\n');
const routes='source/src/core/routes/routeNormalization.js';
prepend(routes,"import {applyRouteRemovals} from './routeRemovalV110370.js';");
for(const name of ['normalizeRouteLegs','routeLegsForDayCanonical','routeLegsForDayMiles']){
 const signature=name==='normalizeRouteLegs'?`export function ${name}(state = {}) {`:`export function ${name}(state = {}, day = '') {`;
 patch(routes,signature,signature+'\n  state = applyRouteRemovals(state);');
}
const editor='source/src/modules/logbook/eventEditingV110.js';
prepend(editor,"import {cleanupRouteChangesAfterEdit} from '../../core/routes/routeRemovalV110370.js';");
patch(editor,'  let next=result.state;','  let next=cleanupRouteChangesAfterEdit(state,result.state,command.day,{targetId:command.id||command.event?.id,restDayIntent:kind===\'insert\'||[\'status\',\'startMin\',\'endMin\'].some(key=>Object.hasOwn(command.patch||{},key))});');
const app='source/src/app/App.jsx';
prepend(app,"import {applyRouteRemovals} from '../core/routes/routeRemovalV110370.js';");
patch(app,'  const before = upgradeVerifiedLegacyCertifications(s);','  const before = applyRouteRemovals(upgradeVerifiedLegacyCertifications(s));');
patch(app,'return reconcileCertificationStatusesV1032(preserveRecordedDays(before, proposed, localDayKey(new Date(), getHomeTerminalTimeZone(before))));','return reconcileCertificationStatusesV1032(applyRouteRemovals(preserveRecordedDays(before, proposed, localDayKey(new Date(), getHomeTerminalTimeZone(before)))));');
patch(app,'  function markDayRecert(next, day = next.activeDay) {','  function markDayRecert(next, day = next.activeDay) {\n    next = applyRouteRemovals(next);');
patch(app,'function undoableStateSnapshot(state = {}) {\n  return {','function undoableStateSnapshot(state = {}) {\n  return {\n    logbookRouteRemovalsV110370:state.logbookRouteRemovalsV110370 || {},');
// The integration boundary must preserve deletion intent with its RODS owner.
const boundary='source/src/modules/logbook/public-api.js';
const locks=JSON.parse(read('module-locks.v1.json'));
const hash=path=>crypto.createHash('sha256').update(read(path)).digest('hex');
assert.equal(hash(boundary),locks.files[boundary],'Reviewed Logbook boundary baseline');
patch(boundary,"Object.freeze([...LOGBOOK_DAY_BUCKETS,'driverSignature'","Object.freeze([...LOGBOOK_DAY_BUCKETS,'logbookRouteRemovalsV110370','driverSignature'");
locks.files[boundary]=hash(boundary);fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
// 24:00 is the end of a complete log day; 23:59 leaves a minute of old duty.
const sheet='source/src/modules/editor/InsertEditEventSheet.jsx';
patch(sheet,'      end: toInput(1439),','      end: toInput(1440),');
patch(sheet,'status, startMin: 0, endMin: 1439, note:','status, startMin: 0, endMin: 1440, note:');
// Home uses the same explicit route exclusions as the Form and event labels.
const home='source/src/modules/home/currentHomeLoadV110369.js';
if(fs.existsSync(home))patch(home,"const active=(index.routes||[]).filter(leg=>!leg.noLoadDeclared", "const active=(index.routes||[]).filter(leg=>!leg.logbookExcludedDaysV110352?.includes(day)&&!leg.noLoadDeclared");
console.log('PASS — durable route deletion and explicit rest-day cleanup installed');
