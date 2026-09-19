import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const VERSION='110.3.77';
const BUILD='v110377-fast-secure-session';
const read=path=>fs.readFileSync(path,'utf8');

const tests=spawnSync(process.execPath,['scripts/v110377/test-auth-startup.mjs'],{stdio:'inherit'});
if(tests.error) throw tests.error;
assert.equal(tests.status,0,'v110.3.77 secure-session startup regressions must pass');

for(const path of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(read(path));
  Object.assign(value,{
    version:VERSION,
    build:BUILD,
    force:false,
    label:'v110.3.77 Fast secure session startup',
    releasedAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:[
      'Recently approved devices open local Road Ready records immediately from the matching persisted secure-session identity.',
      'Supabase session restore and approval RPC checks are bounded by timeouts and revalidate in the background.',
      'A slow or unavailable auth network can no longer leave the app indefinitely on Checking secure session.',
      'Sign-out still clears the device approval; unapproved or expired devices never receive the fast path.'
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

for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']) {
  if(!fs.existsSync(path)) continue;
  fs.writeFileSync(path,read(path)
    .replaceAll("'110.3.76'","'"+VERSION+"'")
    .replaceAll("'v110376-state-boundary-isolation'","'"+BUILD+"'"));
}

const locks=JSON.parse(read('module-locks.v1.json'));
locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');

console.log('PASS — 110.3.77 approved-device startup is immediate and auth network checks are bounded');
