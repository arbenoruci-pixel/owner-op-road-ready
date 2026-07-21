import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'source/src/core/compliance/preTripContinuity.js');
const RELEASE_VERSION = '109.2.7';
const RELEASED_AT = '2026-07-21T02:55:00.000Z';

function read(target) {
  return fs.readFileSync(target, 'utf8');
}

function write(target, content) {
  fs.writeFileSync(target, content);
}

function writeJson(relativePath, transform) {
  const target = path.join(ROOT, relativePath);
  const value = JSON.parse(read(target));
  transform(value);
  write(target, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceFileText(relativePath, pattern, replacement, label) {
  const target = path.join(ROOT, relativePath);
  const before = read(target);
  const after = before.replace(pattern, replacement);
  if (after === before && !before.includes(replacement)) {
    throw new Error(`v109.2.7 version target missing: ${label}`);
  }
  if (after !== before) write(target, after);
}

function patchPreTripResetEngine() {
  const before = read(TARGET);
  if (before.includes('function resetEventActivityText(event = {})')) return false;

  const start = before.indexOf('function isPreTripEvent(event = {})');
  const end = before.indexOf('\n\nfunction dayEvents', start);
  if (start < 0 || end < 0) {
    throw new Error('v109.2.7 could not locate reset-engine isPreTripEvent');
  }

  const replacement = `function resetEventActivityText(event = {}) {\n  const reasons = Array.isArray(event?.reasons) ? event.reasons : [];\n  return [...reasons, event?.note || '', event?.description || '']\n    .map(value => String(value || '').trim())\n    .filter(Boolean)\n    .join(' · ');\n}\n\nfunction isPreTripEvent(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(resetEventActivityText(event));\n}`;

  const after = `${before.slice(0, start)}${replacement}${before.slice(end)}`;
  if (!after.includes('test(resetEventActivityText(event))')) {
    throw new Error('v109.2.7 reset-engine PTI reason patch verification failed');
  }
  write(TARGET, after);
  return true;
}

async function verifyExactUserCase() {
  const stamp = Date.now();
  const preTripModule = await import(`${pathToFileURL(TARGET).href}?v10927=${stamp}`);
  const dotTarget = path.join(ROOT, 'source/src/core/dot/dotOfficerCheckEngine.js');
  const dotModule = await import(`${pathToFileURL(dotTarget).href}?v10927=${stamp}`);

  const prev = '2026-07-16';
  const day = '2026-07-17';
  const eventsByDay = {
    [prev]: [
      { id:'prev_drive', status:'D', startMin:0, endMin:907, city:'St. Cloud', state:'MN', note:'Driving' },
      { id:'prev_sb', status:'SB', startMin:907, endMin:1440, city:'St. Cloud', state:'MN', note:'Sleeper Berth' },
    ],
    [day]: [
      { id:'sb_reset', status:'SB', startMin:0, endMin:228, city:'St. Cloud', state:'MN', note:'Sleeper Berth' },
      {
        id:'pti_unload',
        status:'ON',
        startMin:228,
        endMin:246,
        city:'St. Cloud',
        state:'MN',
        note:'Delivery / Unloading',
        description:'',
        reasons:['Delivery / Unloading', 'Pre-trip inspection'],
        shippingDocs:'391912',
        loadNo:'391912',
        destination:'Rice, MN',
      },
      { id:'drive_after_pti', status:'D', startMin:246, endMin:281, city:'St. Cloud', state:'MN', note:'Driving started', manualMiles:564 },
      { id:'delivery', status:'ON', startMin:281, endMin:324, city:'Rice', state:'MN', note:'Delivery / Unloading · Delivered 391912', shippingDocs:'391912', loadNo:'391912' },
      { id:'off', status:'OFF', startMin:324, endMin:339, city:'Rice', state:'MN', note:'Off Duty' },
    ],
  };

  const requirement = preTripModule.preTripRequirementForDriving(eventsByDay, day, 246);
  if (!requirement.required) throw new Error('v109.2.7 regression: 12h41 rest was not detected');
  if (!requirement.satisfied || requirement.preTripEvent?.id !== 'pti_unload') {
    throw new Error('v109.2.7 regression: PTI + Unloading did not satisfy the reset requirement');
  }
  if (preTripModule.missingPreTripRequirementsForDay(eventsByDay, day).length !== 0) {
    throw new Error('v109.2.7 regression: reset engine still reports missing PTI');
  }

  const state = {
    activeDay:day,
    eventsByDay,
    inspectionByDay:{ [day]:{ complete:true, sourceEventId:'pti_unload', sourceStartMin:228, sourceEndMin:246 } },
    signatureByDay:{},
    certifyStatus:{ [day]:'Needs signature' },
    manualMilesByDay:{ [day]:564 },
    routeLegsByDay:{},
    loadInfo:{ loadNo:'391912', shippingDocs:'391912', sourceEventId:'pti_unload', sourceEventDay:day },
    driverProfile:{ name:'Arben Oruci' },
    carrierName:'Narta Express LLC',
    mainOfficeAddress:'Willowbrook, IL',
    driver:{ truck:'228', trailer:'7005' },
    currentTrailer:'7005',
    currentLocation:{ city:'Rice', state:'MN' },
  };
  const dot = dotModule.buildDotOfficerCheck(state, day);
  const falseResetIssue = (dot.issues || []).find(issue => /pretrip_after_10h_rest_review/i.test(String(issue.id || issue.code || '')));
  if (falseResetIssue) throw new Error('v109.2.7 regression: DOT Check still asks for PTI before Driving');

  console.log('PASS — v109.2.7 12h41 rest + PTI/Unloading 3:48–4:06 satisfies Driving at 4:06');
}

function finalizeRelease() {
  writeJson('package.json', pkg => { pkg.version = RELEASE_VERSION; });
  const lockPath = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    writeJson('package-lock.json', lock => {
      lock.version = RELEASE_VERSION;
      if (lock.packages?.['']) lock.packages[''].version = RELEASE_VERSION;
    });
  }

  replaceFileText(
    'source/src/core/update/appUpdate.js',
    /const FALLBACK_APP_VERSION = '[^']+';/,
    `const FALLBACK_APP_VERSION = '${RELEASE_VERSION}';`,
    'app fallback version',
  );
  replaceFileText(
    'public/sw.js',
    /const OWNER_OP_SW_VERSION = '[^']+';/,
    `const OWNER_OP_SW_VERSION = '${RELEASE_VERSION}';`,
    'service worker version',
  );

  writeJson('public/app-version.json', release => {
    release.version = RELEASE_VERSION;
    release.appVersion = RELEASE_VERSION;
    release.codeVersion = RELEASE_VERSION;
    release.build = 'v109.2.7-reset-engine-pti-reasons';
    release.releasedAt = RELEASED_AT;
    release.updatedAt = RELEASED_AT;
    release.publishedAt = RELEASED_AT;
    release.label = 'v109.2.7 DOT Reset PTI Recognition Fix';
    release.notes = [
      'The 10-hour reset engine now recognizes Pre-trip inspection stored in an ON DUTY reasons array.',
      'A combined Pre-trip inspection plus Delivery / Unloading event immediately before Driving satisfies the reset requirement.',
      'Removes the false DOT Check pre-trip review without changing duty times, statuses, or stored logbook data.',
    ];
  });
}

const changed = patchPreTripResetEngine();
await verifyExactUserCase();
finalizeRelease();
console.log(`Applied v${RELEASE_VERSION}: resetEngineChanged=${changed}`);
