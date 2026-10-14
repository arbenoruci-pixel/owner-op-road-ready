import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installDutyCompatibility} from './install-duty-compatibility.mjs';
const manifest='scripts/test-support/reviewed-duty-hashes.json';
const targets=Object.keys(JSON.parse(fs.readFileSync(manifest,'utf8')));
const installers=['install','finish-mobile','finish-interaction'].map(stage=>`scripts/v110378/${stage}.mjs`);
function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'duty-compatibility-'));
  for(const file of [manifest,...targets,...installers]) {
    const dest=path.join(dir,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);
  }
  return dir;
}
const snapshot=dir=>Object.fromEntries([...targets,...installers].map(file=>[file,fs.readFileSync(path.join(dir,file),'utf8')]));
test('fixed final compatibility is idempotent and never changes runtime targets',()=>{
  const dir=fixture();try {
    const before=snapshot(dir);installDutyCompatibility(dir);const installed=snapshot(dir);
    for(const file of targets)assert.equal(installed[file],before[file]);
    installDutyCompatibility(dir);assert.deepEqual(snapshot(dir),installed);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('every unknown final target fails before any installer or runtime is written',()=>{
  for(const file of targets) {
    const dir=fixture();try {
      fs.appendFileSync(path.join(dir,file),'\n/* unrecognized edit */\n');const before=snapshot(dir);
      assert.throws(()=>installDutyCompatibility(dir),/Reviewed final duty runtime changed/);
      assert.deepEqual(snapshot(dir),before);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
});
test('changed installer anchors fail before any installer is written',()=>{
  const dir=fixture();try {
    fs.writeFileSync(path.join(dir,installers[2]),'// unrecognized installer\n');const before=snapshot(dir);
    assert.throws(()=>installDutyCompatibility(dir),/Duty compatibility installer anchor changed/);
    assert.deepEqual(snapshot(dir),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
