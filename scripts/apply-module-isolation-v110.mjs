import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function once(src,before,after,label){ if(src.includes(after))return src; if(src.split(before).length!==2)throw new Error('Isolation patch anchor changed: '+label); return src.replace(before,after); }
const appPath='source/src/app/App.jsx';let app=read(appPath);
if(!app.includes('MODULE_ISOLATION_V110')){
 app=app.replace("from '../modules/logbook/certificationFingerprintV1032.js'", "from '../modules/logbook/certificationV110.js'");
 app="'use client';\n// MODULE_ISOLATION_V110\nimport { createCertificationRecord, upgradeVerifiedLegacyCertifications } from '../modules/logbook/certificationV110.js';\nimport { runExternalCommand, preserveRecordedDays } from '../modules/logbook/public-api.js';\n"+app;
 // The old normalizer remains a proposal engine, not the owner of historical RODS.
 app=once(app,'function normalizeState(s) {',`function normalizeState(s) {
  const before = upgradeVerifiedLegacyCertifications(s);
  const proposed = normalizeStateLegacyV110(structuredClone(before));
  return reconcileCertificationStatusesV1032(preserveRecordedDays(before, proposed, localDayKey(new Date(), getHomeTerminalTimeZone(before))));
}
function normalizeStateLegacyV110(s) {`,'normalize');
 const start=app.indexOf('function clearMetadataOnlyRecertification(state = {}) {');
 const end=app.indexOf('\nfunction normalizeState(',start);
 if(start<0||end<0)throw new Error('Certification cleanup boundary changed');
 app=app.slice(0,start)+`function clearMetadataOnlyRecertification(state = {}) {
  return reconcileCertificationStatusesV1032(state);
}`+app.slice(end);
 app=once(app,'return reconcileCertificationStatusesV1032(normalizeState(corrected));',"return normalizeState(preserveRecordedDays(saved, corrected, localDayKey(new Date(), getHomeTerminalTimeZone(saved))));",'startup history');
 const external=[
  ["repairKnownRateConMissionV10965(repairCompletedLoadCommandV10958(repairRoadReadyStateV107(applySmartDocumentLinkV103(current, payload), { nowDay:localDayKey(), source:'smart_document_link_v107' })))",'documents','payload'],
  ["repairLogIntegrityV1051(repairRoadReadyFoundationV105(repairKnownRateConMissionV10965(applyVaultDocumentCommitV105(current, payload)), { source:'document_commit_v105' }), { source:'document_commit_v1051' })",'documents','payload']
 ];
 for(const [expression,source,payload] of external) { const before=`setState(current => ${expression});`; const expected=expression.includes('applySmartDocumentLinkV103')?2:1; if(app.split(before).length!==expected+1)throw new Error('Document boundary count changed'); app=app.replaceAll(before,`setState(current => runExternalCommand(current, draft => ${expression.replaceAll('current','draft')}, '${source}', ${payload}));`); }
 app=once(app,"import { applyLoadGuideActionV108 } from '../modules/loads/loadGuideActionV108.js';",`import { applyLoadGuideActionV108 as legacyLoadGuideActionV108 } from '../modules/loads/loadGuideActionV108.js';
const applyLoadGuideActionV108 = (state, detail) => runExternalCommand(state, draft => legacyLoadGuideActionV108(draft, detail), 'loads', detail);`,'loads boundary');
 // Capture exactly the state accepted by the functional update, including an
 // immutable attestation context. Keep old attestations for audit/review.
 app=once(app,'const certifiedFingerprintV1032 = certificationFingerprintV1032(s, day);',`const certificationV110 = createCertificationRecord(s, day, { driverName });
        const certifiedFingerprintV1032 = certificationV110.certifiedFingerprint;`,'single sign');
 app=once(app,'certifiedSnapshotAt:Date.now(),','certifiedSnapshotAt:Date.now(),\n              ...certificationV110,','single sign record');
 // Immediate durable write, with an explicit error on failure. The snapshot
 // writer clones at invocation and serializes writes for the same key.
 const singleStart=app.indexOf('  function signLogDay('), singleEnd=app.indexOf('\n  function certify(',singleStart);
 let single=app.slice(singleStart,singleEnd);
 single=once(single,'        return {\n          ...s,','        const signedStateV110 = {\n          ...s,','sign state');
 single=once(single,"          certifyStatus:{ ...s.certifyStatus, [day]:'Certified' },\n        };",`          certifyStatus:{ ...s.certifyStatus, [day]:'Certified' },
        };
        saveAppSnapshot(APP_STATE_KEY, signedStateV110).catch(() => window.alert?.('Signature storage failed. Keep this app open and export a backup before closing.'));
        return signedStateV110;`,'durable single sign');
 app=app.slice(0,singleStart)+single+app.slice(singleEnd);
 app=once(app,'certifiedSnapshotAt:now,\n        };',`certifiedSnapshotAt:now,
          ...createCertificationRecord(s, day, { driverName:existingSignature.driverName || s.driverProfile?.name || 'Driver', now }),
        };`,'batch record');
 app=once(app,'      return reconcileCertificationStatusesV1032({ ...s, signatureByDay, certifyStatus });',`      const signedStateV110 = reconcileCertificationStatusesV1032({ ...s, signatureByDay, certifyStatus });
      saveAppSnapshot(APP_STATE_KEY, signedStateV110).catch(() => window.alert?.('Signature storage failed. Keep this app open and export a backup before closing.'));
      return signedStateV110;`,'durable batch');
 fs.writeFileSync(appPath,app);
}
let signing=read('source/src/modules/logbook/signing.js');signing=signing.replace("from './certificationFingerprintV1032.js'","from './certificationV110.js'");fs.writeFileSync('source/src/modules/logbook/signing.js',signing);
let local=read('lib/local-db/appState.js');local=once(local,'const stateAtCall = state;','const stateAtCall = structuredClone(state);','snapshot immutability');fs.writeFileSync('lib/local-db/appState.js',local);
let core=read('lib/owner-op-cloud/core.js');core=once(core,'snapshot.profileAtBackup = profileFromState(state);','snapshot.profileAtBackup = state.signatureByDay?.[day]?.certificationContext?.profileAtBackup || profileFromState(state);','historical cloud profile');fs.writeFileSync('lib/owner-op-cloud/core.js',core);
let migration=read('lib/owner-op-cloud/migration.js');
if(!migration.includes("from './verifiedStorageV110.js'"))migration="'use client';\nimport { uploadVerified } from './verifiedStorageV110.js';\n"+migration;
const oldUpload=`      const upload = await cloudClient().storage.from(BUCKET).upload(storagePath, blob, {
        upsert: false,
        contentType: mime,
        cacheControl: '0',
      });
      if (upload.error && !/already exists|duplicate|resource exists/i.test(String(upload.error.message || upload.error))) throw upload.error;`;
migration=once(migration,oldUpload,'      await uploadVerified(cloudClient().storage.from(BUCKET), storagePath, blob, mime, fileSha, sha256);','verified binary upload');
migration=once(migration,"if (!journal.supporting[key]?.missing) errors.push((doc.title || key) + ': local file bytes are missing');","errors.push((doc.title || key) + ': local file bytes are missing');",'persistent missing bytes');
// Retry the diagnosed transport failure once per device after this release.
const requestCheck="  if (!request || !['pending','running'].includes(request.status)) return request || { status: 'none' };";
migration=once(migration,requestCheck,`  if (request?.status === 'error' && /No content provided/i.test(request.last_error || '')) {
    const journal = readJournal(session.user.id);
    if (!journal.binaryTransportRetryV110) {
      journal.binaryTransportRetryV110 = new Date().toISOString();
      writeJournal(session.user.id, journal);
      await markMigration('running');
      request.status = 'running';
    }
  }
${requestCheck}`,'bounded transport retry');
fs.writeFileSync('lib/owner-op-cloud/migration.js',migration);
let agent=read('source/src/modules/cloud/CloudBackupAgent.jsx');agent=once(agent,"await runAuthorizedFullMigration().catch(()=>null)","await runAuthorizedFullMigration().catch(()=>({status:'error'}))",'fail closed migration');agent=once(agent,"if(migration?.status==='pending'||migration?.status==='running')return;","if(['pending','running','error'].includes(migration?.status))return;",'migration status guard');fs.writeFileSync('source/src/modules/cloud/CloudBackupAgent.jsx',agent);
const VERSION='110.1.0', BUILD='v110100-module-isolation';
fs.writeFileSync('release-version.json',JSON.stringify({version:VERSION,build:BUILD,label:'Logbook isolation and verified document transport'},null,2)+'\n');
const meta=JSON.parse(read('public/app-version.json'));fs.writeFileSync('public/app-version.json',JSON.stringify({...meta,version:VERSION,build:BUILD,label:'Logbook isolation',force:false,notes:['Day-scoped signatures and preserved historical records.','Document and load commands cannot change Logbook records.','Binary document uploads require checksum readback.']},null,2)+'\n');
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let code=read(path);for(const [suffix,value] of [['VERSION',VERSION],['BUILD',BUILD]])code=code.replace(new RegExp(`const ${name}_${suffix}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${suffix} = '${value}';`);fs.writeFileSync(path,code);
}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){let s=read(p);s=s.replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION);fs.writeFileSync(p,s);}
console.log('PASS — v110.1 Logbook boundaries, stable certification and verified binary transport applied');
