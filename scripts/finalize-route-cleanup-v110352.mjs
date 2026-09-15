import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const VERSION='110.3.52',BUILD='v110352-route-cleanup';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){
  const source=read(path);
  if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,'Route delete anchor: '+path);
  fs.writeFileSync(path,source.replace(before,after));
}
fs.copyFileSync('scripts/v110352/logbookLoadCleanup.js','source/src/core/routes/logbookLoadCleanup.js');
fs.copyFileSync('scripts/v110350/routeLegDeletion.js','source/src/core/routes/routeLegDeletion.js');
const routeDelete='source/src/core/routes/routeLegDeletion.js';
fs.writeFileSync(routeDelete,"import { cleanRouteCacheAfterRemoval } from './logbookLoadCleanup.js';\n"+read(routeDelete));
patch(routeDelete,'  return {\n    ...state,','  return cleanRouteCacheAfterRemoval(state, {\n    ...state,');
patch(routeDelete,'  };\n}\n','  });\n}\n');
const screen='source/src/modules/logbook/DayLogScreen.jsx';
const locks=JSON.parse(read('module-locks.v1.json'));
const hash=()=>crypto.createHash('sha256').update(read(screen)).digest('hex');
if(!read(screen).includes('routeLegDeleteRequest'))assert.equal(hash(),'5ce2a905fc4927a13bffc4d4f42dbdb17bf24701d08cd3257f7ec4d360058670','Reviewed route form baseline');
patch(screen,"import React, { useEffect, useMemo, useRef, useState } from 'react';",
  "import React, { useEffect, useMemo, useRef, useState } from 'react';\nimport { routeLegDeleteRequest } from '../../core/routes/routeLegDeletion.js';");
patch(screen,`    const targetDay = leg.day || state.activeDay;
    const routeLegsByDay = { ...(state.routeLegsByDay || {}) };
    routeLegsByDay[targetDay] = (routeLegsByDay[targetDay] || []).filter(item => item.id !== leg.id);
    onSaveLoad?.({ routeLegsByDay });`,
`    const request = routeLegDeleteRequest(state, leg);
    if (!request) {
      window.alert?.('This route could not be identified safely. Reopen the Form tab and try again.');
      return;
    }
    onSaveLoad?.({ deleteRouteLeg:request });`);
const app='source/src/app/App.jsx';
patch(app,"import React, { useMemo, useRef, useState } from 'react';",
  "import React, { useMemo, useRef, useState } from 'react';\nimport { deleteRouteLegFromState } from '../core/routes/routeLegDeletion.js';");
patch(app,`  function saveLoadInfo(payload = {}) {
    setState(s => {`,
`  function saveLoadInfo(payload = {}) {
    setState(s => {
      if (Object.prototype.hasOwnProperty.call(payload, 'deleteRouteLeg')) {
        const next = deleteRouteLegFromState(s, payload.deleteRouteLeg);
        return next === s ? s : reconcileCertificationStatusesV1032(next);
      }`);
patch(app,"import { deleteRouteLegFromState } from '../core/routes/routeLegDeletion.js';",
  "import { deleteRouteLegFromState } from '../core/routes/routeLegDeletion.js';\nimport { cleanupDeletedLogbookData } from '../core/routes/logbookLoadCleanup.js';");
patch(app,"  function deleteEvent(id) {\n    setState(s => {\n      const baseEvents = continuousBaseForDay(s, s.activeDay);\n      const deleted = baseEvents.find(e => e.id === id) || null;\n      const evs = commitTimelineForDay(baseEvents.filter(e => e.id !== id), s.activeDay, s);\n      let loadInfo = s.loadInfo || {};\n      if (loadInfo.sourceEventId === id || deleted?.loadLinkId === id) {\n        const { sourceEventId, sourceEventReason, shippingDocs, loadNo, pickupCity, pickupState, deliveryCity, deliveryState, updatedAt, ...rest } = loadInfo;\n        loadInfo = { ...rest, shippingDocs:'', loadNo:'', pickupCity:'', pickupState:'', deliveryCity:'', deliveryState:'' };\n      }\n      const eventsByDay = { ...s.eventsByDay, [s.activeDay]: evs };\n      const routeLegsByDay = syncRouteLegTimes(removeOrUnlinkRouteLegForEvent(s.routeLegsByDay || {}, id), eventsByDay);\n      let next = { ...s, loadInfo, routeLegsByDay, eventsByDay, selectedEventId:null, sheet:null };\n      next = reconcilePreTripInspections(next, [s.activeDay]);\n      return markRecert(repairLogIntegrityV1051(repairRoadReadyFoundationV105(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(next, { source:'state_write_v1034' }), { source:'state_write_v1043' }), { source:'state_write_v105' }), { source:'state_write_v1051' }));\n    });\n  }\n","  function deleteEvent(id) {\n    setState(s => {\n      const day = s.activeDay;\n      const baseEvents = continuousBaseForDay(s, day);\n      if (!baseEvents.some(event => event.id === id)) return s;\n      // This explicit command removes the chosen row; unrelated duty records stay exact.\n      const remaining = baseEvents.filter(event => event.id !== id);\n      const events = (s.eventsByDay?.[day] || []).filter(event => event?.id !== id || event?.voided || isSyntheticEvent(event));\n      let next = { ...s, eventsByDay:{ ...s.eventsByDay, [day]:events }, selectedEventId:null, sheet:null };\n      next = cleanupDeletedLogbookData(s, next, {day,eventIds:[id],clearDay:remaining.length === 0});\n      next = reconcilePreTripInspections(next, [day]);\n      return markRecert(reconcileCertificationStatusesV1032(next));\n    });\n  }\n");
// Select the newest saved revision before filtering by day/status. Selecting
// after filtering could resurrect an older Pending copy or outdated mileage.
fs.copyFileSync('scripts/v110352/routeProjection.js','source/src/core/routes/routeProjectionV110352.js');
const routes='source/src/core/routes/routeNormalization.js';
patch(routes,"const EMPTY_MOVE_KIND = 'empty/reposition';","import { newestRouteCopies } from './routeProjectionV110352.js';\nconst EMPTY_MOVE_KIND = 'empty/reposition';");
patch(routes,"  return all\n    .filter(leg => !hiddenRouteStatusV105(leg.status))","  return newestRouteCopies(all)\n    .filter(leg => !hiddenRouteStatusV105(leg.status))\n    .filter(leg => !leg.logbookExcludedDaysV110352?.includes(day))");
patch(routes,"export function routeLegsForDayMiles(state = {}, day = '') {\n  return Object.entries(state.routeLegsByDay || {}).flatMap(([legDay, legs]) => (\n    (Array.isArray(legs) ? legs : []).map(leg => ({ ...leg, day: leg.day || legDay }))\n  ))\n    .filter(leg => primaryMilesDayForLeg(leg) === day)","export function routeLegsForDayMiles(state = {}, day = '') {\n  return newestRouteCopies(Object.entries(state.routeLegsByDay || {}).flatMap(([legDay, legs]) => (\n    (Array.isArray(legs) ? legs : []).map(leg => ({ ...leg, day: leg.day || legDay }))\n  )))\n    .filter(leg => primaryMilesDayForLeg(leg) === day)\n    .filter(leg => !leg.logbookExcludedDaysV110352?.includes(day))");
// The standard CI browser-isolation entry exercises the new route command too.
const browserTest='scripts/browser-isolation-v110.mjs';
const browserImport="await import('./browser-route-delete-v110350.mjs');";
if(!read(browserTest).includes(browserImport))fs.appendFileSync(browserTest,'\n'+browserImport+'\n');
// Reviewed form-only change. All other stable-module locks stay byte-identical.
locks.files[screen]=hash();locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.52 Reliable route deletion',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Delete the selected route across stored day buckets and its legacy mirror.','Clear day-owned route and load data after deleting the last real Logbook event.','Keep other-day evidence, original documents and signature records unchanged.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=read(path);
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.51');assert.equal(meta.build,'v110351-dot-signature-labels');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — v110.3.52 current-state route deletion installed');

await import('./test-logbook-load-cleanup-v110352.mjs');
await import('./test-route-authority-v110352.mjs');
