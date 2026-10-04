import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;if(s.split(b).length!==2)throw Error('Team pickup anchor changed: '+p);fs.writeFileSync(p,s.replace(b,()=>a));}
fs.copyFileSync('scripts/v110445/teamPickup.js','source/src/core/routes/teamPickupV110445.js');
const shipment='source/src/core/routes/shipmentCarryover.js';
patch(shipment,"import {newestRouteCopies}","import {pickupByReference,sameFreightReference} from './teamPickupV110445.js';\nimport {newestRouteCopies}");
patch(shipment,'  index.routes = routes;',`  index.routes = routes;
  index.freightReferences = state.freightReferencesV110445 || [];
  index.driverNames = new Map((state.teamDrivers || []).map(driver => [driver.id,driver.name]));`);
patch(shipment,'  if (direct || text(leg.pickupEventId) || !text(leg.loadGroupId) || !docs(leg)) return direct;',`  if (direct || text(leg.pickupEventId) || !docs(leg)) return direct;
  const referencePickup = pickupByReference(leg,index);
  if (referencePickup) return referencePickup;
  if (!text(leg.loadGroupId)) return null;`);
patch(shipment,'    if (reference && identity(reference) !== identity(docs(leg))) return false;', '    if (reference && !sameFreightReference(event,leg,index,pickup.day,true)) return false;');
patch(shipment,'    recordedPickup,\n    pickup:',`    recordedPickup,
    pickupDriverId:pickup?.driverId || '',
    pickupDriverName:index.driverNames?.get(pickup?.driverId) || '',
    pickup:`);
const routes='source/src/core/routes/routeNormalization.js';
patch(routes,"import {repairUnloadingPickups}","import {distinctRecordedRoutes} from './teamPickupV110445.js';\nimport {repairUnloadingPickups}");
patch(routes,'recordedRouteDayMembership, freightOriginForLeg','recordedRouteDayMembership, freightOriginForLeg, routeHistoryWindow');
patch(routes,'  return newestRouteCopies(all)\n    .filter', '  const visible = newestRouteCopies(all)\n    .filter');
patch(routes,"    .sort((a, b) => String(a.pickupDay || a.day).localeCompare(String(b.pickupDay || b.day)) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999));", "    .sort((a, b) => String(a.pickupDay || a.day).localeCompare(String(b.pickupDay || b.day)) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999));\n  return distinctRecordedRoutes(visible, historyIndex, routeHistoryWindow);");
const day='source/src/modules/logbook/DayLogScreen.jsx',beforeDay=read(day);
patch(day,'routeStatusForLogDay, freightOriginForLeg','routeStatusForLogDay, freightOriginForLeg, routeHistoryIndex, routeHistoryWindow');
patch(day,"  parts.push(!leg.pickupEventId && !leg.deliveryEventId && (leg.source === 'manual_form' || /^rate_confirmation_guide/.test(leg.source||'')) ? 'Plan · no pickup recorded' : routeStatusForLogDay(leg, day, state));",`  const freight = routeHistoryWindow(leg,routeHistoryIndex(state));
  parts.push(!freight.recordedPickup && !leg.pickupEventId && !leg.deliveryEventId && (leg.source === 'manual_form' || /^rate_confirmation_guide/.test(leg.source||'')) ? 'Plan · no pickup recorded' : routeStatusForLogDay(leg, day, state));
  if (freight.recordedPickup && freight.pickupDriverId !== state.activeDriverId && freight.pickupDriverName) parts.push('Pickup by ' + freight.pickupDriverName);`);
const app='source/src/app/App.jsx';
patch(app,"import {closeArchivedGuides}","import {freightReferenceCatalog} from '../core/routes/teamPickupV110445.js';\nimport {closeArchivedGuides}");
patch(app,'  const [offlineHydrated, setOfflineHydrated] = useState(false);',`  const [offlineHydrated, setOfflineHydrated] = useState(false);
  React.useEffect(()=>{
    if(!offlineHydrated)return;
    const refresh=()=>{
      const references=freightReferenceCatalog(readGuideStoreV110311());
      setState(current=>JSON.stringify(current.freightReferencesV110445||[])===JSON.stringify(references) ? current : {...current,freightReferencesV110445:references});
    };
    refresh();
    const names=[GUIDE_STORE_EVENT_V110312,'road-ready-library-imported','pageshow','focus'];
    names.forEach(name=>window.addEventListener(name,refresh));
    return()=>names.forEach(name=>window.removeEventListener(name,refresh));
  },[offlineHydrated]);`);
const locks=JSON.parse(read('module-locks.v1.json'));
if(![hash(beforeDay),hash(read(day))].includes(locks.files[day]))throw Error('Unexpected Logbook display baseline');
locks.files[day]=hash(read(day));
locks.teamPickupReviewV110445='Read-only team pickup/reference projection; no duty, mileage or signature edits';
const VERSION='110.4.45',BUILD='v110445-team-pickup';locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const p of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.45 Team pickup recognition',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Recognize recorded co-driver pickups on both driver forms.','Resolve saved BOL/load references with day and route checks.','Keep duty events, mileage and signatures with their original driver.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replaceAll('v110.4.44','v'+VERSION).replaceAll('V110.4.44','V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.44'","'"+VERSION+"'").replaceAll("'v110444-unloading-route'","'"+BUILD+"'"));
// Earlier release finalizers import these runtime modules before this patch.
// Run the regression in a fresh process so it verifies the materialized files.
execFileSync(process.execPath,['scripts/v110445/team-pickup.test.mjs'],{stdio:'inherit'});
console.log('PASS — team pickup reference recognition installed');
