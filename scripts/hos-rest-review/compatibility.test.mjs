import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {installDutyCompatibility} from '../test-support/install-duty-compatibility.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rest-review-compatibility-'));
const hash=text=>createHash('sha256').update(text).digest('hex');
const write=(file,text)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);};
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const manifest='scripts/test-support/reviewed-duty-hashes.json';
const target='source/src/modules/logbook/eventEditingV110.js';
const installers=['install','finish-mobile','finish-interaction'].map(name=>`scripts/v110378/${name}.mjs`);
try {
  write(target,'reviewed predecessor');
  const previous={[target]:hash(read(target))};write(manifest,JSON.stringify(previous));
  write(installers[0],'const completedHashes={};\nconst prepared=[],seen=new Set();');
  write(installers[1]," const source=fs.readFileSync(file,'utf8');");
  write(installers[2]," const source=fs.readFileSync(path,'utf8');if(hash(source)===after)return;");
  installDutyCompatibility(root);
  write(target,'reviewed midnight projection');
  const current={[target]:hash(read(target))};write(manifest,JSON.stringify(current));
  installDutyCompatibility(root,{previousReviewed:previous});
  assert.equal(read(target),'reviewed midnight projection');
  const updated=installers.map(read);
  for(const source of updated) {
    assert.ok(source.includes(JSON.stringify(current)));
    assert.ok(!source.includes(JSON.stringify(previous)));
  }
  installDutyCompatibility(root);
  assert.deepEqual(installers.map(read),updated);
  console.log('PASS — a reviewed compatibility revision replaces all three exact guards and repeats without writes');
  write(target,read(target)+'\n/* unreviewed */');
  assert.throws(()=>installDutyCompatibility(root,{previousReviewed:previous}),/Reviewed final duty runtime changed/);
  assert.deepEqual(installers.map(read),updated);
  console.log('PASS — unreviewed runtime edits still fail before changing any installer');
} finally {fs.rmSync(root,{recursive:true,force:true});}
