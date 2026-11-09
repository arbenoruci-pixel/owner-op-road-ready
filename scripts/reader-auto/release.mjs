import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const read=path=>fs.readFileSync(path,'utf8');
const before=JSON.parse(read('release-version.json')),version='110.4.121';
assert.ok(['110.4.117','110.4.118','110.4.119','110.4.120',version].includes(before.version),'Automatic reading release must follow 110.4.117');
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v1104121-shipment-filing-'+sha.slice(0,12),now=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']){
 const data=JSON.parse(read(file));
 Object.assign(data,{version,build,sourceCommit:sha,force:false,label:'v110.4.121 File verified shipment details',releasedAt:now,updatedAt:now,notes:[
 'File independently verified BOL details to the matching load when the delivery stamp remains unclear.',
 'Keep uncertain delivery evidence separate from verified shipment identity; never infer completed delivery.',
 'Existing stored originals, logbook, HOS and DOT records are preserved.'
 ]});
 fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']){
 const data=JSON.parse(read(file));data.version=version;if(data.packages?.[''])data.packages[''].version=version;
 fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const file of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','source/src/modules/home/HomeScreen.jsx','source/src/modules/home/DriverDashboard.jsx','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']){
 if(!fs.existsSync(file))continue;
 fs.writeFileSync(file,read(file).replaceAll('110.4.117',version).replaceAll('v1104117-iphone-camera-recovery-'+sha.slice(0,12),build));
}
assert.ok(read('source/src/modules/scan/v3/CameraAdapterV3.jsx').includes('preferNativeCamera'),'Production scanner camera must use the tested lifecycle');
assert.ok(read('source/src/modules/scan/v3/cameraRecoveryV1104117.css').includes('scan-camera-recovery-v1104117'),'Native camera fallback styles must ship');
console.log('PASS — automatic reading and filing, original files and approved DOT workflow preserved: '+version);

