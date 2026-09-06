import fs from 'node:fs';
const path='source/src/app/App.jsx';
let app=fs.readFileSync(path,'utf8');
if(!app.includes('SIGNATURE_COMMIT_PERSISTENCE_V110')){
 const write="saveAppSnapshot(APP_STATE_KEY, signedStateV110).catch(() => window.alert?.('Signature storage failed. Keep this app open and export a backup before closing.'));";
 if(app.split(write).length!==3)throw new Error('Expected exactly two legacy signature persistence calls');
 app=app.replaceAll(write,'// Durable persistence runs after the React commit.');
 const anchor='  const updateCheckInFlightRef = useRef(false);';
 if(app.split(anchor).length!==2)throw new Error('App hook anchor changed');
 app=app.replace(anchor,anchor+`

  // SIGNATURE_COMMIT_PERSISTENCE_V110: a discarded concurrent render must
  // never write its proposed state to IndexedDB. Snapshot writes are cloned
  // and serialized by appState.js after React has accepted this state.
  React.useLayoutEffect(() => {
    if (!offlineHydrated || !Object.values(state.signatureByDay || {}).some(sig => sig?.signed)) return;
    saveAppSnapshot(APP_STATE_KEY, state).then(savedAt => {
      if (!savedAt) throw new Error('Local database is unavailable');
      window.dispatchEvent(new CustomEvent('road-ready-signature-persisted', { detail:{ savedAt } }));
    }).catch(() => window.alert?.('Signature storage failed. Keep this app open and export a backup before closing.'));
  }, [state.signatureByDay, offlineHydrated]);
`);
 const first=app.indexOf('  function signLogDay('), last=app.indexOf('  function saveInspection(',first);
 if(first<0||last<0)throw new Error('Signing boundaries changed');
 let signing=app.slice(first,last);
 // Capture the gesture's time once; repeated pure updater evaluation produces
 // the same attestation rather than two differently timestamped proposals.
 signing=signing.replace('      setState(s => {','      const signingTimeV110 = Date.now();\n      setState(s => {');
 signing=signing.replace('    setState(s => {\n      let signatureByDay','    const batchSigningTimeV110 = Date.now();\n    setState(s => {\n      let signatureByDay');
 signing=signing.replace('const now = Date.now();','const now = batchSigningTimeV110;');
 signing=signing.replace('signatureDataUrl:latestSignature.dataUrl });','signatureDataUrl:latestSignature.dataUrl, now:signingTimeV110 });');
 // Single-day generated fields are overridden by the record but should be
 // deterministic too. Keep the two event-handler timestamp captures intact.
 signing=signing.replaceAll('savedAt: Date.now()','savedAt: signingTimeV110').replaceAll('signedAt: Date.now()','signedAt: signingTimeV110').replaceAll('certifiedSnapshotAt:Date.now()','certifiedSnapshotAt:signingTimeV110');
 app=app.slice(0,first)+signing+app.slice(last);
 fs.writeFileSync(path,app);
}
console.log('PASS — signature persistence is post-commit; updater evaluation has no storage side effects');
