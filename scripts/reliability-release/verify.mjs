import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const protectedFiles=json('scripts/reliability-release/protected-contracts.json');
for(const [file,expected]of Object.entries(protectedFiles.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,'Protected access/integration contract changed: '+file);
for(const [file,expected]of Object.entries(protectedFiles.reviewedBusinessRoutes||{})){
 const code=fs.readFileSync(file,'utf8');
 assert.equal(crypto.createHash('sha256').update(code).digest('hex'),expected.after,'Reviewed document commit contract changed: '+file);
 const from=code.indexOf(expected.authorizationStart),to=code.indexOf(expected.authorizationEnd,from);
 assert.ok(from>=0&&to>from,'Document authorization boundary changed');
 assert.equal(crypto.createHash('sha256').update(code.slice(from,to)).digest('hex'),expected.authorizationSha256,'Document authorization prelude changed');
}
const revision=json('scripts/reliability-release/reviewed-locks.json');
for(const [file,expected]of Object.entries(revision.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected.after,'Reviewed stable-module revision changed: '+file);
for(const [file,expected]of Object.entries(revision.runtimeFiles||{}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,'Reviewed HOS implementation changed: '+file);
const release=json('release-version.json');assert.equal(release.version,'110.4.78');assert.equal(release.force,false);assert.equal(release.reviewBuild,true);
for(const file of ['public/app-version.json','public/reliability-review.json']){const value=json(file);for(const key of ['version','build','sourceCommit','force'])assert.equal(value[key],release[key],file+': '+key);}
assert.match(fs.readFileSync('app/reliability-preview/page.jsx','utf8'),/process\.env\.VERCEL_ENV==='production'\)notFound\(\)/);
assert.match(fs.readFileSync('app/page.jsx','utf8'),/process\.env\.VERCEL_ENV==='preview'\)redirect\('\/reliability-preview'\)/);
assert.ok(!fs.existsSync('app/reader-ui-test'),'Do not publish the local Reader test harness');
const require=createRequire(path.resolve('package.json')),babel=require('next/dist/compiled/babel/core');
const visit=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?visit(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const assets=visit('source/src').filter(file=>/\.[cm]?[jt]sx?$/.test(file));
for(const file of assets){const code=fs.readFileSync(file,'utf8');if(!/^['"]use client['"];?$/m.test(code))continue;const parsed=babel.parseSync(code,{filename:file,sourceType:'module',configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}});assert.ok(parsed.program.directives.some(d=>d.value.value==='use client'),'Next client directive ordering: '+file);}
function run(script,args=[]){const result=spawnSync(process.execPath,[script,...args],{stdio:'inherit',env:process.env});if(result.error)throw result.error;assert.equal(result.status,0,'Reliability gate failed: '+script);}
for(const file of ['scripts/reliability-sync/scheduler.test.mjs','scripts/reliability-sync/snapshot.test.mjs','scripts/reliability-hos/test.mjs','scripts/reliability-hos/test-runtime.mjs','packages/smart-reader-core/test/reliability-rate.test.mjs','scripts/reliability-reader/filingContext.test.mjs','scripts/reliability-reader/importOrder.test.mjs','scripts/reliability-reader/capture-contract.test.mjs','scripts/reliability-audit/core.test.mjs','scripts/verify-isolation-locks-v110.mjs'])run(file);
run('scripts/reliability-reader/server-contract.test.mjs',['.']);
run('scripts/reliability-reader/document-status.test.mjs',['.']);
console.log('PASS final access contracts, explicit stable-module revision, preview guards, client directives and reliability regression gates');

