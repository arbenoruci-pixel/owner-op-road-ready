import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {syncLegacyReleaseAssertions} from './sync-release-assertions.mjs';
test('legacy labels stay current while behavioral assertions and independent release checks remain strict',()=>{
 const previous=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'release-check-'));
 const write=(file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),value);};
 const metadata={version:'110.4.72',build:'v110472-fixture',force:false};
 write('package.json',JSON.stringify({version:metadata.version}));
 write('source/src/core/update/appUpdate.js',"const FALLBACK_APP_VERSION = '110.4.72';\nconst FALLBACK_APP_BUILD = 'v110472-fixture';");
 write('public/sw.js',"const OWNER_OP_SW_VERSION = '110.4.72';\nconst OWNER_OP_SW_BUILD = 'v110472-fixture';");
 for(const file of ['release-version.json','public/app-version.json'])write(file,JSON.stringify(metadata));
 const fixture='scripts/test-duty-graph-continuity.mjs';
 write(fixture,"assert.equal(meta.version,'110.3.70');assert.equal(meta.build,'v110370-old');assert.equal(meta.force,false);\nassert.deepEqual(events,originalEvents);\n");
 try{
  process.chdir(root);syncLegacyReleaseAssertions(fixture);
  const text=fs.readFileSync(fixture,'utf8');
  assert.ok(text.includes("assert.equal(meta.version,'110.4.72')"));
  assert.ok(text.includes("assert.deepEqual(events,originalEvents);"));assert.ok(text.includes('assert.equal(meta.force,false)'));
  write('public/app-version.json',JSON.stringify({...metadata,version:'110.4.71'}));
  assert.throws(()=>syncLegacyReleaseAssertions(fixture));assert.equal(fs.readFileSync(fixture,'utf8'),text);
  write('public/app-version.json',JSON.stringify({...metadata,force:true}));assert.throws(()=>syncLegacyReleaseAssertions(fixture));
 }finally{process.chdir(previous);fs.rmSync(root,{recursive:true,force:true});}
});
