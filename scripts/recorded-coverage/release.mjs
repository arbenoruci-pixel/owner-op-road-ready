import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const version='110.4.123';
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v1104123-recorded-coverage-'+sha.slice(0,12), stamp=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']) {
  const meta=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.ok(['110.4.122',version].includes(meta.version));
  Object.assign(meta,{version,build,sourceCommit:sha,force:false,releasedAt:stamp,updatedAt:stamp,
    label:'Saved log coverage agrees across views',notes:[
      'Completed logs show saved endpoints and expose unrecorded time in Log Check.',
      'Signing requires coverage in the actual saved certification payload.',
      'Historical events, signatures, locations and miles are preserved.'
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
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('110.4.122',version));
}
console.log('PASS — recorded coverage release '+version+' / '+sha);
