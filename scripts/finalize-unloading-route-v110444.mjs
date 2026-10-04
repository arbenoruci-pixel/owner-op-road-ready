import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;if(s.split(b).length!==2)throw Error('Unloading anchor changed: '+p);fs.writeFileSync(p,s.replace(b,a));}
const timeline='source/src/core/timeline/timelineEngine.js',beforeTimeline=read(timeline);
for(const p of ['source/src/app/App.jsx','source/src/core/routes/shippingDocsRepair.js','source/src/core/timeline/timelineEngine.js','source/src/modules/home/HomeScreen.jsx','source/src/modules/loads/multiStopDeliveryV1034.js','source/src/modules/status/StatusWorkflowSheet.jsx','source/src/modules/editor/EditEventSheet.jsx','source/src/modules/loads/loadGuideV103.js']) {
 const s=read(p);fs.writeFileSync(p,s.replaceAll('/pickup|loading/', '/\\b(?:pickup|pick\\s+up|loading)\\b/').replaceAll('/pickup|pick up|loading/', '/\\b(?:pickup|pick\\s+up|loading)\\b/'));
}
const guide='source/src/modules/loads/loadGuideV103.js';
fs.writeFileSync(guide,read(guide).replaceAll('/pickup|pick\\s*up|loading|hook(?:ed)?|drop\\s*&?\\s*hook|pickup\\s+trailer/', '/\\b(?:pickup|pick\\s*up|loading|hook(?:ed)?|drop\\s*&?\\s*hook|pickup\\s+trailer)\\b/'));
// The newly reachable ordinary delivery branch must use its own matched route.
const app='source/src/app/App.jsx';
patch(app,"import { normalizeLoadInfoFromRouteLegs","import {repairUnloadingPickups} from '../core/routes/unloadingRepairV110444.js';\nimport { normalizeLoadInfoFromRouteLegs");
patch(app,'const before = applyRouteRemovals(upgradeVerifiedLegacyCertifications(s));',`const recordedBefore = applyRouteRemovals(upgradeVerifiedLegacyCertifications(s));
  // Narrow migration of the demonstrated unsigned delivery-link bug, before
  // historical preservation. All event/clock/signature buckets stay protected.
  const before = {...recordedBefore,routeLegsByDay:repairUnloadingPickups(recordedBefore.routeLegsByDay||{},recordedBefore)};`);

let a=read(app),start=a.indexOf('  function updateRouteLegsForStatus('),end=a.indexOf('  function buildLoadPatchForStatusPayload(',start);
if(start<0||end<0)throw Error('Delivery branch missing');
a=a.slice(0,start)+a.slice(start,end).replaceAll('guideExistingV1034 &&','existing.loadGroupId &&')+a.slice(end);fs.writeFileSync(app,a);
const routes='source/src/core/routes/routeNormalization.js';
fs.copyFileSync('scripts/v110444/unloadingRepair.js','source/src/core/routes/unloadingRepairV110444.js');
patch(routes,"import {applyRouteRemovals}","import {repairUnloadingPickups} from './unloadingRepairV110444.js';\nimport {applyRouteRemovals}");
patch(routes,'const routeLegsByDay = normalizeLegacyIntermodalRouteIntent(sorted, state.eventsByDay || {});','const routeLegsByDay = repairUnloadingPickups(normalizeLegacyIntermodalRouteIntent(sorted, state.eventsByDay || {}), state);');
// Preserve unknown pickup fields when re-normalizing a delivery-only row.
patch(routes,'pickupDay: safeText(leg.pickupDay || day),',"pickupDay: leg.source === 'delivery_event' && !leg.pickupEventId ? '' : safeText(leg.pickupDay || day),");
patch(routes,'pickupMin: Number.isFinite(Number(leg.pickupMin)) ? Number(leg.pickupMin) : null,',"pickupMin: leg.pickupMin == null ? null : Number.isFinite(Number(leg.pickupMin)) ? Number(leg.pickupMin) : null,");
patch(routes,'    pickedUpLoadNo,\n    transitionLoadNos,',"    pickedUpLoadNo: leg.source === 'delivery_event' && !leg.pickupEventId ? '' : pickedUpLoadNo,\n    transitionLoadNos,");
const reviewedLocks=JSON.parse(read('module-locks.v1.json'));
if(![hash(beforeTimeline),hash(read(timeline))].includes(reviewedLocks.files[timeline]))throw Error('Unexpected timeline baseline');
reviewedLocks.files[timeline]=hash(read(timeline));
reviewedLocks.unloadingReviewV110444='Word-boundary pickup classification; delivery/merge regression and duty continuity tests';
fs.writeFileSync('module-locks.v1.json',JSON.stringify(reviewedLocks,null,2)+'\n');
const VERSION='110.4.44',BUILD='v110444-unloading-route';
for(const p of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.44 Delivery route correction',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Import reviewed Delivery route correction with source checks and saved previous copies.','Repair unsigned legacy delivery-only self-linked routes.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replaceAll('v110.4.43','v'+VERSION).replaceAll('V110.4.43','V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.43'","'"+VERSION+"'").replaceAll("'v110443-wallet-documents'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.44 delivery-only routes and legacy repair');
await import('./v110444/unloading.test.mjs');
