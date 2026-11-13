import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const version='110.4.125';
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v1104125-phone-export-'+sha.slice(0,12), stamp=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']) {
  const meta=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.ok(['110.4.124',version].includes(meta.version));
  Object.assign(meta,{version,build,sourceCommit:sha,force:false,releasedAt:stamp,updatedAt:stamp,
    label:'Preserve phone logbook and export selected originals',notes:[
      'Date ZIP export scans metadata once and reads only selected originals.',
      'Active phone logbook rejects incoming cloud replacements; explicit device handoff remains available.',
      'Visible record counts, cancellation and storage timeouts prevent an endless preparation state.'
    ]});
  fs.writeFileSync(file,JSON.stringify(meta,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']) {
  const value=JSON.parse(fs.readFileSync(file,'utf8'));value.version=version;
  if(value.packages?.[''])value.packages[''].version=version;
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
for(const [file,prefix] of [['public/sw.js','OWNER_OP_SW'],['source/src/core/update/appUpdate.js','FALLBACK_APP']]) {
  let source=fs.readFileSync(file,'utf8');
  for(const [key,value] of [['VERSION',version],['BUILD',build]])source=source.replace(new RegExp(`const ${prefix}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${prefix}_${key} = '${value}';`);
  fs.writeFileSync(file,source);
}
for(const file of ['source/src/shared/ui/ToolsSheet.jsx','source/src/modules/home/HomeScreen.jsx','source/src/modules/home/DriverDashboard.jsx']) {
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('110.4.124',version));
}
// Keep release-identity assertions exact, following the existing release pipeline.
for(const file of ['lib/owner-op-cloud/cloudMirrorV110450.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']) {
  const source=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,source.replaceAll('110.4.124',version).replace(/v1104124-date-export-[a-f0-9]{12}/g,build));
}
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));
locks.release=version;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — phone authority and metadata export release '+version+' / '+sha);
