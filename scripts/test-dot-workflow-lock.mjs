import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {verifyDotWorkflowLock} from './verify-dot-workflow-lock.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dot-lock-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const lock=JSON.parse(fs.readFileSync(new URL('../dot-workflow-lock.v1.json',import.meta.url),'utf8'));
  for(const phase of ['source','runtime'])for(const file of Object.keys(lock[phase])) {
    const value='Approved fixture: '+file;
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),value);
    lock[phase][file]=crypto.createHash('sha256').update(value).digest('hex');
  }
  const manifest=path.join(root,'dot-workflow-lock.v1.json');
  fs.writeFileSync(manifest,JSON.stringify(lock));
  return {root,lock,manifest};
}

test('unchanged source and generated runtime pass; verification never rewrites the baseline',t=>{
  const {root,manifest}=fixture(t),before=fs.readFileSync(manifest,'utf8');
  assert.ok(verifyDotWorkflowLock({root,phase:'source'})>0);
  assert.ok(verifyDotWorkflowLock({root,phase:'runtime'})>0);
  assert.equal(fs.readFileSync(manifest,'utf8'),before);
});
test('editing the wizard or deleting a wallet source stops the build without accepting new hashes',t=>{
  const {root,manifest}=fixture(t),before=fs.readFileSync(manifest,'utf8');
  fs.appendFileSync(path.join(root,'scripts/inspection-package/InspectionWizard.jsx'),'changed');
  fs.rmSync(path.join(root,'scripts/inspection-package/wallet.js'));
  assert.throws(()=>verifyDotWorkflowLock({root}),error=>error.message.includes('InspectionWizard.jsx (changed)')&&error.message.includes('wallet.js (missing)')&&error.message.includes("Arben's agreement"));
  assert.equal(fs.readFileSync(manifest,'utf8'),before);
});
test('a later installer changing the final officer renderer is caught even when source inputs match',t=>{
  const {root}=fixture(t);
  fs.appendFileSync(path.join(root,'source/src/modules/cloud/Inspector.jsx'),'changed by installer');
  assert.ok(verifyDotWorkflowLock({root,phase:'source'})>0);
  assert.throws(()=>verifyDotWorkflowLock({root,phase:'runtime'}),/Inspector.jsx \(changed\)/);
});
test('dropping protected scope, malformed hashes and bypass modes fail closed',t=>{
  const {root,lock,manifest}=fixture(t);
  const missing=structuredClone(lock);delete missing.runtime['lib/owner-op-cloud/inspectionWallet.js'];
  fs.writeFileSync(manifest,JSON.stringify(missing));
  assert.throws(()=>verifyDotWorkflowLock({root}),/Incomplete DOT runtime lock/);
  lock.source['AGENTS.md']='accept-current';fs.writeFileSync(manifest,JSON.stringify(lock));
  assert.throws(()=>verifyDotWorkflowLock({root}),/Invalid DOT lock entry/);
  assert.throws(()=>verifyDotWorkflowLock({root,phase:'unlock'}),/Unknown DOT lock phase/);
});
