import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyReaderRelease,releaseSourceCommit,RELEASE_FILES,RELEASE_NOTES,VERSION,BUILD_PREFIX} from './release.mjs';

const read=file=>fs.readFileSync(file,'utf8');
const SHA='1234567890abcdef1234567890abcdef12345678';
const OTHER_SHA='abcdef1234567890abcdef1234567890abcdef12';
const fixtureFiles=[...RELEASE_FILES,'source/src/modules/scan/SmartScanSheetV105.jsx'];

// Exercise the actual fully materialized files, never the older tracked baseline.
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-release-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const file of fixtureFiles){
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
    fs.copyFileSync(file,path.join(root,file));
  }
  return root;
}
const contents=root=>new Map(fixtureFiles.map(file=>[file,read(path.join(root,file))]));

test('release metadata identifies the precise deployment commit, ahead of a PR SHA',()=>{
  assert.equal(releaseSourceCommit({env:{VERCEL_GIT_COMMIT_SHA:SHA,GITHUB_SHA:OTHER_SHA}}),SHA);
  assert.equal(releaseSourceCommit({env:{GITHUB_SHA:OTHER_SHA}}),OTHER_SHA);
  assert.throws(()=>releaseSourceCommit({env:{VERCEL_GIT_COMMIT_SHA:'short',GITHUB_SHA:OTHER_SHA}}),/full Git SHA/);
  assert.throws(()=>releaseSourceCommit({env:{VERCEL:'1'}}),/deployment commit SHA/);
  assert.throws(()=>releaseSourceCommit({env:{GITHUB_ACTIONS:'true'}}),/deployment commit SHA/);
});

test('release synchronizes all materialized metadata without modifying sync or auth behavior',t=>{
  const root=fixture(t),before=contents(root);
  const metadata=applyReaderRelease({root,env:{VERCEL_GIT_COMMIT_SHA:SHA},now:new Date('2026-10-14T04:00:00Z')});
  assert.equal(metadata.version,VERSION);assert.equal(metadata.force,false);assert.equal(metadata.sourceCommit,SHA);
  assert.equal(metadata.build,`${BUILD_PREFIX}-${SHA.slice(0,12)}`);
  for(const file of ['release-version.json','public/app-version.json']){
    const actual=JSON.parse(read(path.join(root,file)));
    for(const [key,value] of Object.entries(metadata))assert.deepEqual(actual[key],value,file+' / '+key);
    assert.deepEqual(actual.notes,RELEASE_NOTES);
  }
  for(const file of ['package.json','package-lock.json'])assert.equal(JSON.parse(read(path.join(root,file))).version,VERSION);
  assert.equal(JSON.parse(read(path.join(root,'package-lock.json'))).packages[''].version,VERSION);
  const oldLocks=JSON.parse(before.get('module-locks.v1.json')),locks=JSON.parse(read(path.join(root,'module-locks.v1.json')));
  assert.equal(locks.release,VERSION);assert.deepEqual({...locks,release:oldLocks.release},oldLocks);
  const normalize=text=>text.replaceAll('110.4.70','RELEASE').replaceAll('110.4.72','RELEASE').replaceAll('110.4.73','RELEASE').replaceAll('110.4.74','RELEASE').replaceAll('110.4.75','RELEASE').replaceAll(VERSION,'RELEASE');
  for(const file of ['lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js']){
    assert.equal(normalize(read(path.join(root,file))),normalize(before.get(file)),'Only diagnostic release stamps may change: '+file);
  }
  assert.equal(read(path.join(root,'source/src/modules/scan/SmartScanSheetV105.jsx')),before.get('source/src/modules/scan/SmartScanSheetV105.jsx'));
  for(const file of ['source/src/core/update/appUpdate.js','public/sw.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/test-document-continuity-integration-v110375.mjs']){
    assert.ok(read(path.join(root,file)).includes(metadata.build),file);
    assert.ok(!read(path.join(root,file)).includes('v110470-single-device-ipad'),file);
  }
  assert.ok(read(path.join(root,'source/src/shared/ui/ToolsSheet.jsx')).includes('Log Tools · v{CURRENT_APP_VERSION}'));
});

// Model each supported predecessor from the materialized runtime. A clean
// production build reaches .70; already-installed Reader releases reach .72/.73.
for(const [version,build] of [
  ['110.4.70','v110470-single-device-ipad'],
  ['110.4.72',`v110472-load-picker-pod-${OTHER_SHA.slice(0,12)}`],
  ['110.4.73',`v110473-current-load-consistency-${OTHER_SHA.slice(0,12)}`],
  ['110.4.74',`v110474-document-reading-repair-${OTHER_SHA.slice(0,12)}`],
  ['110.4.75',`v110475-delivery-closeout-${OTHER_SHA.slice(0,12)}`],
])test(`release upgrades ${version} without forcing an update and remains idempotent`,t=>{
  const root=fixture(t),previous=JSON.parse(read(path.join(root,'release-version.json')));
  for(const file of RELEASE_FILES){
    const target=path.join(root,file);
    fs.writeFileSync(target,read(target).replaceAll(previous.build,build).replaceAll(previous.version,version));
  }
  for(const file of ['release-version.json','public/app-version.json']){
    const target=path.join(root,file),value=JSON.parse(read(target));
    value.force=true;value.sourceCommit=OTHER_SHA;
    value.releasedAt='2026-10-13T04:00:00.000Z';value.updatedAt=value.releasedAt;
    fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n');
  }
  const metadata=applyReaderRelease({root,env:{VERCEL_GIT_COMMIT_SHA:SHA},now:new Date('2026-10-14T04:00:00Z')});
  assert.equal(metadata.version,VERSION);assert.equal(metadata.force,false);
  assert.equal(metadata.build,`${BUILD_PREFIX}-${SHA.slice(0,12)}`);
  assert.equal(metadata.releasedAt,'2026-10-14T04:00:00.000Z');
  for(const file of ['release-version.json','public/app-version.json','package.json','package-lock.json']){
    assert.equal(JSON.parse(read(path.join(root,file))).version,VERSION,file);
  }
  assert.ok(read(path.join(root,'source/src/core/update/appUpdate.js')).includes(`const FALLBACK_APP_VERSION = '${VERSION}';`));
  assert.ok(read(path.join(root,'source/src/core/update/appUpdate.js')).includes(metadata.build));
  assert.ok(read(path.join(root,'public/sw.js')).includes(`const OWNER_OP_SW_VERSION = '${VERSION}';`));
  assert.ok(read(path.join(root,'public/sw.js')).includes(metadata.build));
  assert.ok(read(path.join(root,'source/src/modules/home/HomeScreen.jsx')).includes(`v${VERSION}</footer>`));
  const released=contents(root);
  applyReaderRelease({root,env:{VERCEL_GIT_COMMIT_SHA:SHA},now:new Date('2026-10-15T04:00:00Z')});
  assert.deepEqual(contents(root),released);
});

test('release reruns are idempotent and a different commit receives a distinct build identity',t=>{
  const root=fixture(t),env={VERCEL_GIT_COMMIT_SHA:SHA};
  applyReaderRelease({root,env,now:new Date('2026-10-14T04:00:00Z')});const initial=contents(root);
  applyReaderRelease({root,env,now:new Date('2026-10-15T04:00:00Z')});assert.deepEqual(contents(root),initial);
  const next=applyReaderRelease({root,env:{VERCEL_GIT_COMMIT_SHA:OTHER_SHA},now:new Date('2026-10-15T04:00:00Z')});
  assert.equal(next.sourceCommit,OTHER_SHA);assert.equal(next.build,`${BUILD_PREFIX}-${OTHER_SHA.slice(0,12)}`);
  assert.equal(next.releasedAt,'2026-10-15T04:00:00.000Z');
  assert.ok(read(path.join(root,'public/sw.js')).includes(next.build));
});

test('unmaterialized or inconsistent release input is rejected before writes',t=>{
  const root=fixture(t),file=path.join(root,'package.json'),value=JSON.parse(read(file));value.version='97.3.0';fs.writeFileSync(file,JSON.stringify(value));
  const before=contents(root);
  assert.throws(()=>applyReaderRelease({root,env:{VERCEL_GIT_COMMIT_SHA:SHA}}),/fully materialized/);
  assert.deepEqual(contents(root),before);
});

test('an unrecognized predecessor build is rejected before writes',t=>{
  const root=fixture(t),file=path.join(root,'release-version.json'),value=JSON.parse(read(file));
  value.build='v110473-unrecognized-1234567890ab';fs.writeFileSync(file,JSON.stringify(value));
  const before=contents(root);
  assert.throws(()=>applyReaderRelease({root,env:{VERCEL_GIT_COMMIT_SHA:SHA}}),/predecessor build/);
  assert.deepEqual(contents(root),before);
});

test('CI runs pending-reading browser coverage first and retains its failure artifacts',()=>{
  const workflow=read('.github/workflows/owned-reader.yml').split('  app-integration:')[1];
  assert.ok(workflow,'App integration job exists');
  const command='          node scripts/reader-foundation/browser-pending-readings.mjs\n';
  assert.equal(workflow.split(command).length,2,'Pending-reading regression is an unconditional, gating command');
  assert.ok(workflow.indexOf(command)<workflow.indexOf('          node scripts/v110404/browser.mjs\n'));
  assert.match(workflow,/uses: actions\/upload-artifact@v4\s+if: always\(\)/);
  assert.ok(workflow.includes('            browser-test-results/pending-reader/\n'));
});

test('the current runtime exposes this nonforced release consistently',()=>{
  const meta=JSON.parse(read('public/app-version.json'));
  assert.equal(meta.version,VERSION,'Run reader-foundation/release.mjs after installation, before verification');
  assert.equal(meta.force,false);assert.match(meta.sourceCommit,/^[a-f0-9]{40}$/);
  assert.equal(meta.build,`${BUILD_PREFIX}-${meta.sourceCommit.slice(0,12)}`);
  assert.equal(JSON.parse(read('release-version.json')).sourceCommit,meta.sourceCommit);
  assert.ok(read('source/src/core/update/appUpdate.js').includes(`const FALLBACK_APP_BUILD = '${meta.build}';`));
  assert.ok(read('public/sw.js').includes(`const OWNER_OP_SW_BUILD = '${meta.build}';`));
});
