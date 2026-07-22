import fs from 'node:fs';

const VERSION = '109.5.3';
const BUILD = 'v10953-undo-startup-isolation';
const APP_PATH = 'source/src/app/App.jsx';
const TOOLS_PATH = 'source/src/shared/ui/ToolsSheet.jsx';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceFunction(source, name, nextName, replacement) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`\n\nfunction ${nextName}`, start);
  if (start < 0 || end < 0) throw new Error(`v109.5.3 function boundary missing: ${name} -> ${nextName}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

let app = read(APP_PATH);

app = replaceFunction(
  app,
  'undoDataFingerprint',
  'carryoverNoteForStatus',
  `function undoableStateSnapshot(state = {}) {
  return {
    eventsByDay:state.eventsByDay || {},
    routeLegsByDay:state.routeLegsByDay || {},
    loadInfo:state.loadInfo || {},
    manualMilesByDay:state.manualMilesByDay || {},
    currentStatus:state.currentStatus || '',
    currentReason:state.currentReason || '',
    currentLocation:state.currentLocation || {},
    equipment:state.equipment || {},
    currentTrailer:state.currentTrailer || '',
  };
}

function undoDataFingerprint(state = {}) {
  return JSON.stringify(undoableStateSnapshot(state));
}`,
);

app = app.replace(
  '  const undoSuppressRef = useRef(false);\n  const undoTimerRef = useRef(null);',
  '  const undoSuppressRef = useRef(false);\n  const undoUserGestureAtRef = useRef(0);\n  const undoTimerRef = useRef(null);',
);
if (!app.includes('const undoUserGestureAtRef = useRef(0);')) throw new Error('v109.5.3 gesture ref target missing');

app = app.replace(
  '      undoPreviousStateRef.current = initial;\n      undoFingerprintRef.current = undoDataFingerprint(initial);',
  '      undoPreviousStateRef.current = undoableStateSnapshot(initial);\n      undoFingerprintRef.current = undoDataFingerprint(initial);',
);
if (!app.includes('undoPreviousStateRef.current = undoableStateSnapshot(initial);')) throw new Error('v109.5.3 hydration baseline target missing');

const effectStartMarker = `  React.useEffect(() => {\n    if (!offlineHydrated) return;\n    const previousEventsByDay = lastEventsByDayRef.current; const previousInspectionByDay = lastInspectionByDayRef.current; const nextFingerprint = undoDataFingerprint(state);`;
const effectStart = app.indexOf(effectStartMarker);
if (effectStart < 0) throw new Error('v109.5.3 Undo persistence effect start missing');
const effectEndMarker = `  }, [state, offlineHydrated]);`;
const effectEnd = app.indexOf(effectEndMarker, effectStart);
if (effectEnd < 0) throw new Error('v109.5.3 Undo persistence effect end missing');
const effectEndExclusive = effectEnd + effectEndMarker.length;

const replacementEffects = `  React.useEffect(() => {
    if (!offlineHydrated) return undefined;
    const markUserGesture = () => { undoUserGestureAtRef.current = Date.now(); };
    window.addEventListener('pointerdown', markUserGesture, true);
    window.addEventListener('keydown', markUserGesture, true);
    return () => {
      window.removeEventListener('pointerdown', markUserGesture, true);
      window.removeEventListener('keydown', markUserGesture, true);
    };
  }, [offlineHydrated]);

  React.useEffect(() => {
    if (!offlineHydrated) return;
    const previousEventsByDay = lastEventsByDayRef.current;
    const previousInspectionByDay = lastInspectionByDayRef.current;

    // Startup, migration and metadata cleanup are system work. Normalize them
    // before Undo observes the state so refresh can never create an Undo entry.
    const cleanedState = clearMetadataOnlyRecertification(state);
    if (cleanedState !== state) {
      undoPreviousStateRef.current = undoableStateSnapshot(cleanedState);
      undoFingerprintRef.current = undoDataFingerprint(cleanedState);
      undoUserGestureAtRef.current = 0;
      setState(cleanedState);
      return;
    }

    const nextUndoSnapshot = undoableStateSnapshot(state);
    const nextFingerprint = JSON.stringify(nextUndoSnapshot);
    if (undoPreviousStateRef.current && nextFingerprint !== undoFingerprintRef.current) {
      const recentUserGesture = Date.now() - Number(undoUserGestureAtRef.current || 0) <= 2000;
      if (undoSuppressRef.current) {
        undoSuppressRef.current = false;
      } else if (recentUserGesture) {
        undoHistoryRef.current = [...undoHistoryRef.current.slice(-9), undoPreviousStateRef.current];
        setUndoNotice({ text:'Change saved', at:Date.now() });
        if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
        undoTimerRef.current = window.setTimeout(() => setUndoNotice(null), 10000);
      }
      undoPreviousStateRef.current = nextUndoSnapshot;
      undoFingerprintRef.current = nextFingerprint;
      undoUserGestureAtRef.current = 0;
    } else if (!undoPreviousStateRef.current) {
      undoPreviousStateRef.current = nextUndoSnapshot;
      undoFingerprintRef.current = nextFingerprint;
    }

    saveAppSnapshot(APP_STATE_KEY, state).catch(() => {});
    if (previousEventsByDay) queueDutyEventDiffs(previousEventsByDay, state.eventsByDay || {}).catch(() => {});
    if (previousInspectionByDay) queueInspectionDiffs(previousInspectionByDay, state.inspectionByDay || {}).catch(() => {});
    lastEventsByDayRef.current = state.eventsByDay || {};
    lastInspectionByDayRef.current = state.inspectionByDay || {};
  }, [state, offlineHydrated]);`;

app = `${app.slice(0, effectStart)}${replacementEffects}${app.slice(effectEndExclusive)}`;

const undoBefore = `    setState({ ...previous, sheet:null, selectedEventId:null, selectMode:false, selectedIds:[] });`;
const undoAfter = `    setState(current => ({
      ...current,
      ...previous,
      // Inspection acknowledgements, signatures and certification are separate
      // compliance records. A log/route Undo can never roll them backward.
      inspectionByDay:current.inspectionByDay || {},
      signatureByDay:current.signatureByDay || {},
      certifyStatus:current.certifyStatus || {},
      driverSignature:current.driverSignature || null,
      sheet:null,
      selectedEventId:null,
      selectMode:false,
      selectedIds:[],
    }));`;
if (!app.includes(undoBefore)) throw new Error('v109.5.3 whole-state Undo target missing');
app = app.replace(undoBefore, undoAfter);
write(APP_PATH, app);

let tools = read(TOOLS_PATH);
tools = tools.replace(
  "Restore the log, route, inspection, or status state from before the latest change.",
  "Restore the latest manual log, route, equipment, or status change. Inspection and signature records stay protected.",
);
write(TOOLS_PATH, tools);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.5.3 Undo Startup Isolation',
  force:true,
  notes:[
    'Refresh, hydration, migration and automatic repair can no longer create a Change saved / Undo entry.',
    'Undo history is created only immediately after a real user gesture changes log, route, status or equipment data.',
    'Undo restores only the undoable operational fields and cannot roll back inspection sheets, signatures or certification.',
    'Keeps the multi-reason Pre-trip inspection recognition and visible Home version label.'
  ]
}, null, 2)}\n`);

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

const legacyVerifier = 'scripts/verify-v10943-auto-upright.mjs';
let verify = read(legacyVerifier);
verify = verify.replace(/assert\.equal\(release\.version, '[^']+'\);/, `assert.equal(release.version, '${VERSION}');`);
verify = verify.replace(/assert\.equal\(release\.build, '[^']+'\);/, `assert.equal(release.build, '${BUILD}');`);
verify = verify.replace(/assert\.equal\(packageJson\.version, '[^']+'\);/, `assert.equal(packageJson.version, '${VERSION}');`);
write(legacyVerifier, verify);

if (/undoableStateSnapshot[\s\S]*inspectionByDay/.test(app.slice(app.indexOf('function undoableStateSnapshot'), app.indexOf('function carryoverNoteForStatus')))) {
  throw new Error('v109.5.3 inspection leaked into Undo snapshot');
}
if (!app.includes('else if (recentUserGesture)')) throw new Error('v109.5.3 user gesture gate missing');
if (!app.includes('inspectionByDay:current.inspectionByDay || {}')) throw new Error('v109.5.3 inspection protection missing');
if (!app.includes('const cleanedState = clearMetadataOnlyRecertification(state);')) throw new Error('v109.5.3 cleanup-before-Undo missing');

console.log('PASS — v109.5.3 isolates startup repair from Undo and protects inspection/signature records');
