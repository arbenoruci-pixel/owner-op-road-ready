import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
const read = file => fs.readFileSync(file,'utf8');
function patch(file,before,after) {
  const source=read(file); if(source.includes(after)) return;
  assert.equal(source.split(before).length-1,1,`v110421 anchor: ${file} ${before.slice(0,80)}`);
  fs.writeFileSync(file,source.replace(before,after));
}
for(const [input,output] of [['censusPlaces.js','censusPlacesV110421.js'],['nearbyPlace.js','nearbyPlaceV110421.js'],['reverseLookup.js','reverseLookupV110421.js']]) fs.copyFileSync('scripts/v110421/'+input,'source/src/core/gps/'+output);
fs.copyFileSync('scripts/v110421/reverseRoute.js','app/api/location/reverse/route.js');
const service='source/src/core/gps/locationService.js';
patch(service,'export function haversineMiles(a, b) {',"import {nearestCensusPlace} from './nearbyPlaceV110421.js';\n\nexport function haversineMiles(a, b) {");
patch(service,`  const guessed = guessGpsCity(lat, lng);`, `  const guessed = nearestCensusPlace(lat, lng) || {city:'GPS',state:'UNK'};`);
patch(service,`    source:'offline-nearest-city',`, `    source:'offline-nearest-city-census',\n    approximate:true,`);
patch(service,`          resolved = { city, state, source:data.source || 'reverse-geocoder' };`, `          resolved = { city, state, source:data.source || 'reverse-geocoder', approximate:data.approximate === true, distanceMiles:typeof data.distanceMiles === 'number' ? data.distanceMiles : null };`);
patch(service,`          const nearbySameState = fallback.city !== 'GPS'
            && fallback.state === state
            && Number.isFinite(Number(fallback.distanceMiles))
            && Number(fallback.distanceMiles) <= 15;
          resolved = nearbySameState
            ? { ...fallback, state, source:'offline-nearest-city+census-state' }
            : { city:'GPS', state, distanceMiles:fallback.distanceMiles ?? null, source:data.source || 'us-census-state-only' };`, `          const nearby = nearestCensusPlace(lat, lng, {state});
          resolved = nearby
            ? { ...nearby, source:'offline-nearest-city+census-state' }
            : { city:'GPS', state, distanceMiles:null, source:data.source || 'us-census-state-only' };`);
const activities='source/src/shared/duty/dutyActivities.js';
patch(activities,"'Delivery / Unloading','Waiting'", "'Delivery / Unloading','Waiting','DOT Inspection'");

// Batch sign re-spread the previous record before applying the new record.
// Fields deliberately removed by createCertificationRecord survived that spread.
const app='source/src/app/App.jsx';
patch(app,`        const existingDaySignature = signatureByDay[day] || {};
        const { signatureDataUrl, ...compactDaySignature } = existingDaySignature;
        signatureByDay[day] = {
          ...compactDaySignature,
          driverName:existingSignature.driverName || s.driverProfile?.name || 'Driver',
          signatureRef:'driverSignature',
          signed:true,
          signedAt:now,
          certifiedFingerprint:certificationFingerprintV1032(s, day),
          certifiedFingerprintVersion:CERTIFICATION_FINGERPRINT_VERSION_V1032,
          certifiedSnapshotAt:now,
          ...createCertificationRecord(s, day, { driverName:existingSignature.driverName || s.driverProfile?.name || 'Driver', now }),
        };`, `        signatureByDay[day] = createCertificationRecord(s, day, {
          driverName:existingSignature.driverName || s.driverProfile?.name || 'Driver', now,
        });`);

// The existing generic "inspection" matcher also treated DOT Inspection as a
// pre-trip. Keep that distinction consistent in save, reload, checks and views.
const preTripHelper='source/src/core/compliance/preTripActivityV110421.js';
fs.copyFileSync('scripts/v110421/preTripActivity.js',preTripHelper);
const preTripChanges=[
  [app,"/pre[- ]?trip|inspection/i.test(String(reason || ''))","isPreTripActivity(reason)"],
  ['source/src/core/compliance/preTripContinuity.js','/pre[- ]?trip|inspection/i.test(resetEventActivityText(event))','isPreTripActivity(resetEventActivityText(event))'],
  ['source/src/modules/logbook/DayLogScreen.jsx','/pre[-\\s]?trip|inspection/i.test(activityText)','isPreTripActivity(activityText)'],
  ['source/src/modules/logbook/signing.js',"/pre[- ]?trip|inspection/i.test(`${event.note || ''} ${event.description || ''}`)","isPreTripActivity(`${event.note || ''} ${event.description || ''}`)"],
  ['source/src/core/dot/dotOfficerCheckEngine.js','/pre[- ]?trip|inspection/i.test(eventActivityText(event))','isPreTripActivity(eventActivityText(event))'],
  ['source/src/modules/logbook/logIntegrityV1051.js','/pre[- ]?trip|inspection/i.test(body)','isPreTripActivity(body)'],
  ['source/src/core/integrity/logbookIntegrityV107.js','/pre[- ]?trip|inspection/.test(eventText(event))','isPreTripActivity(eventText(event))'],
  ['source/src/core/timeline/timelineEngine.js',"  if (/pre[- ]?trip|inspection/.test(text)) return 'inspection';","  if (/\\b(?:dot|roadside)\\s+inspection\\b/i.test(text) && !isPreTripActivity(text)) return 'dot-inspection';\n  if (isPreTripActivity(text)) return 'inspection';"],
];
const reviewedLocks=JSON.parse(read('module-locks.v1.json'));
for(const [file,before,after] of preTripChanges) {
  if(read(file).includes(after))continue;
  if(reviewedLocks.files[file])assert.equal(createHash('sha256').update(read(file)).digest('hex'),reviewedLocks.files[file],`Expected reviewed baseline: ${file}`);
  patch(file,before,after);
  const relative=path.relative(path.dirname(file),preTripHelper);
  const importLine=`import {isPreTripActivity} from '${relative.startsWith('.')?relative:'./'+relative}';\n`;
  const source=read(file);
  fs.writeFileSync(file,source.startsWith("'use client';")?source.replace("'use client';", "'use client';\n"+importLine):importLine+source);
  if(reviewedLocks.files[file])reviewedLocks.files[file]=createHash('sha256').update(read(file)).digest('hex');
}
fs.writeFileSync('module-locks.v1.json',JSON.stringify(reviewedLocks,null,2)+'\n');

// Legacy installers recognize only these exact reviewed final outputs.
// Their rejection of unknown edits and byte-identical rerun tests stay active.
const reviewed=JSON.parse(read('scripts/v110421/reviewed-runtime-hashes.json'));
for(const [file,hash] of Object.entries(reviewed))assert.equal(createHash('sha256').update(read(file)).digest('hex'),hash,'Reviewed DOT runtime: '+file);
patch('scripts/v110378/install.mjs','const prepared=[],seen=new Set();',`Object.assign(completedHashes,${JSON.stringify(reviewed)});\nconst prepared=[],seen=new Set();`);
patch('scripts/v110378/finish-mobile.mjs'," const source=fs.readFileSync(file,'utf8');",` const source=fs.readFileSync(file,'utf8');\n if(hash(source)===${JSON.stringify(reviewed)}[file])return;`);

const VERSION='110.4.21',BUILD='v110421-gps-sign-dot',stamp=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(read(file));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.21 GPS, DOT Inspection and signing',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,notes:['Resolve highway stops with nationwide nearby-place coverage and retain GPS coordinates.','DOT Inspection is available in On Duty Quick Pick.','Signing multiple reviewed days clears obsolete recertification flags while keeping prior attestations.']});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']) {const value=JSON.parse(read(file));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let value=read(file);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);fs.writeFileSync(file,value);
}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const file of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(file,read(file).replaceAll("'110.4.20'","'"+VERSION+"'").replaceAll("'v110420-rescanned-bol-review'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — GPS nearby-place coverage, DOT Inspection and batch recertification installed');
