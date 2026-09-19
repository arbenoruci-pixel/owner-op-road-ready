import './v110376/install.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const VERSION='110.3.76';
const BUILD='v110376-state-boundary-isolation';
const read=path=>fs.readFileSync(path,'utf8');

const tests=spawnSync(process.execPath,['scripts/v110376/test-state-boundaries.mjs'],{stdio:'inherit'});
if(tests.error) throw tests.error;
assert.equal(tests.status,0,'v110.3.76 state-boundary regressions must pass');

for(const path of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(read(path));
  Object.assign(value,{
    version:VERSION,
    build:BUILD,
    force:false,
    label:'v110.3.76 Log/load/GPS state isolation',
    releasedAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:[
      'Historical Logbook Form fields read only recorded day/route evidence and never inherit the global current load.',
      'Scanner/current-load metadata saves cannot rewrite duty events, route-linked log evidence, current physical location or certifications without explicit day-Form scope.',
      'GPS reverse geocoding no longer reports Census county subdivisions as cities; state-only results require a close same-state fallback or manual city confirmation.',
      'Existing duty times, signed attestations, mileage values, document originals and route records are preserved.'
    ]
  });
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}

for(const path of ['package.json','package-lock.json']) {
  const value=JSON.parse(read(path));
  value.version=VERSION;
  if(value.packages?.['']) value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}

for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let value=read(path);
  for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]) {
    const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');
    assert.equal([...value.matchAll(pattern)].length,1,`${path} ${key}`);
    value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path,value);
}

for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']) {
  fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
}

for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs']) {
  fs.writeFileSync(path,read(path)
    .replaceAll("'110.3.75'","'"+VERSION+"'")
    .replaceAll("'v110375-document-continuity-integrated'","'"+BUILD+"'"));
}

const continuity='scripts/test-document-continuity-integration-v110375.mjs';
if(fs.existsSync(continuity)) {
  fs.writeFileSync(continuity,read(continuity)
    .replaceAll("'110.3.75'","'"+VERSION+"'")
    .replaceAll("'v110375-document-continuity-integrated'","'"+BUILD+"'"));
}

const locks=JSON.parse(read('module-locks.v1.json'));
locks.release=VERSION;
locks.files['source/src/modules/logbook/DayLogScreen.jsx']=crypto.createHash('sha256').update(read('source/src/modules/logbook/DayLogScreen.jsx')).digest('hex');
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');

console.log('PASS — 110.3.76 isolates Logbook day evidence, load metadata and GPS locality without rewriting stored driver records');
