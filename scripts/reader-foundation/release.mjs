import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const VERSION='110.4.77';
export const BUILD_PREFIX='v110477-home-records';
const PREVIOUS_VERSION='110.4.70';
const PREVIOUS_BUILD='v110470-single-device-ipad';
export const RELEASE_NOTES=Object.freeze([
  'Home Settings receives taps, Logbook opens the day list, and tools return to the screen that opened them.',
  'Files, load folders and billing use the same reconciled saved documents and operational delivery status.',
  'Record links open the selected log date; saved co-driver logs remain visible without changing the active driver.',
  'Drive displays the actual OFF, SB, ON or D status and opens today’s log.',
  'An unlinked shipment opens its own pickup log and offers rate confirmation capture without guessing a broker load.',
  'Original files, recorded duty times, mileage, signatures and financial values are retained.',
]);

const TEXT_FILES=[
  'source/src/core/update/appUpdate.js',
  'public/sw.js',
  'source/src/modules/home/HomeScreen.jsx',
  'source/src/shared/ui/ToolsSheet.jsx',
  'lib/owner-op-cloud/cloudMirrorV110450.js',
  'lib/owner-op-cloud/recordSyncV110451.js',
  'scripts/test-duty-graph-continuity.mjs',
  'scripts/test-editor-grips-v110355.mjs',
  'scripts/verify-log-integrity-v1051.mjs',
  'scripts/test-document-continuity-integration-v110375.mjs',
];
export const RELEASE_FILES=Object.freeze([
  'release-version.json','public/app-version.json','package.json','package-lock.json',
  'module-locks.v1.json',...TEXT_FILES,
]);

// Vercel describes the actual deployed merge, not the earlier pull-request head.
// Never silently fall back from malformed provider metadata to an unrelated SHA.
export function releaseSourceCommit({root=process.cwd(),env=process.env}={}){
  let commit;
  if(env.VERCEL_GIT_COMMIT_SHA)commit=env.VERCEL_GIT_COMMIT_SHA;
  else if(env.GITHUB_SHA)commit=env.GITHUB_SHA;
  else {
    assert.ok(!env.VERCEL&&!env.GITHUB_ACTIONS,'Reader release requires the deployment commit SHA in CI');
    commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  }
  commit=String(commit).trim();
  assert.match(commit,/^[a-f0-9]{40}$/i,'Reader release sourceCommit must be a full Git SHA');
  return commit.toLowerCase();
}

export function applyReaderRelease({root=process.cwd(),env=process.env,now=new Date()}={}){
  const sourceCommit=releaseSourceCommit({root,env});
  const build=`${BUILD_PREFIX}-${sourceCommit.slice(0,12)}`;
  const before=new Map(RELEASE_FILES.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
  const json=file=>JSON.parse(before.get(file));
  const previous=json('release-version.json');
  for(const file of ['release-version.json','public/app-version.json','package.json','package-lock.json']){
    assert.ok([PREVIOUS_VERSION,'110.4.72','110.4.73','110.4.74','110.4.75','110.4.76',VERSION].includes(json(file).version),`Reader release requires fully materialized ${PREVIOUS_VERSION} runtime: ${file}`);
  }
  assert.match(before.get('source/src/modules/scan/SmartScanSheetV105.jsx')||fs.readFileSync(path.join(root,'source/src/modules/scan/SmartScanSheetV105.jsx'),'utf8'),/analysisWithProjection\(/,'Install the Reader foundation before finalizing its release');
  const previousBuild=previous.build;
  assert.ok(previousBuild===PREVIOUS_BUILD||/^v110472-load-picker-pod-[a-f0-9]{12}$/.test(previousBuild)||/^v110473-current-load-consistency-[a-f0-9]{12}$/.test(previousBuild)||/^v110474-document-reading-repair-[a-f0-9]{12}$/.test(previousBuild)||/^v110475-delivery-closeout-[a-f0-9]{12}$/.test(previousBuild)||/^v110476-delivery-context-[a-f0-9]{12}$/.test(previousBuild)||new RegExp(`^${BUILD_PREFIX}-[a-f0-9]{12}$`).test(previousBuild),'Reader release predecessor build is not recognized');
  const sameRelease=previous.version===VERSION&&previous.build===build&&previous.sourceCommit===sourceCommit;
  const releasedAt=sameRelease&&previous.releasedAt?previous.releasedAt:now.toISOString();
  const metadata={version:VERSION,build,force:false,label:`v${VERSION} Home and connected records`,sourceCommit,notes:[...RELEASE_NOTES],releasedAt,updatedAt:releasedAt};
  const after=new Map(before);
  const setJSON=(file,value)=>after.set(file,JSON.stringify(value,null,2)+'\n');
  for(const file of ['release-version.json','public/app-version.json'])setJSON(file,{...json(file),...metadata});
  for(const file of ['package.json','package-lock.json']){
    const value=json(file);value.version=VERSION;
    if(value.packages?.[''])value.packages[''].version=VERSION;
    setJSON(file,value);
  }
  const locks=json('module-locks.v1.json');locks.release=VERSION;setJSON('module-locks.v1.json',locks);
  for(const file of TEXT_FILES){
    let text=before.get(file).replaceAll(PREVIOUS_VERSION,VERSION).replaceAll(previous.version,VERSION).replaceAll(PREVIOUS_BUILD,build).replaceAll(previousBuild,build);
    if(file==='source/src/shared/ui/ToolsSheet.jsx'){
      text=text.replace(/Log Tools · v\d+\.\d+\.\d+/g,'Log Tools · v{CURRENT_APP_VERSION}');
      assert.ok(text.includes('Log Tools · v{CURRENT_APP_VERSION}'),'Reader release ToolsSheet version anchor changed');
    }
    after.set(file,text);
  }
  assert.ok(after.get('source/src/core/update/appUpdate.js').includes(`const FALLBACK_APP_VERSION = '${VERSION}';`),'Reader release app version anchor changed');
  assert.ok(after.get('source/src/core/update/appUpdate.js').includes(`const FALLBACK_APP_BUILD = '${build}';`),'Reader release app build anchor changed');
  assert.ok(after.get('public/sw.js').includes(`const OWNER_OP_SW_VERSION = '${VERSION}';`),'Reader release service-worker version anchor changed');
  assert.ok(after.get('public/sw.js').includes(`const OWNER_OP_SW_BUILD = '${build}';`),'Reader release service-worker build anchor changed');
  assert.ok(after.get('source/src/modules/home/HomeScreen.jsx').includes(`v${VERSION}</footer>`),'Reader release Home version anchor changed');
  // Validate every input before writing. Only release stamps/UI labels change in
  // the cloud modules; account access, sync settings and module hashes stay intact.
  for(const [file,text] of after)if(text!==before.get(file))fs.writeFileSync(path.join(root,file),text);
  return metadata;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const release=applyReaderRelease();
  console.log(`PASS — Reader ${release.version} (${release.build}), nonforced, source ${release.sourceCommit}`);
}
