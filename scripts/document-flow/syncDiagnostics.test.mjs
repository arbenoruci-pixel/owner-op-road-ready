import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('scripts/document-flow/syncDiagnostics.js','utf8');
const step=new Function(source+';return accountStep;')();
test('reports the innermost failed persistence operation and preserves the original error',async()=>{
 const original=new DOMException('QuotaExceededError','QuotaExceededError');
 await assert.rejects(()=>step('Receiving archive',()=>step('Saving received file checkpoint',()=>{throw original;})),error=>{
  assert.equal(error.message,'Saving received file checkpoint: QuotaExceededError');
  assert.equal(error.name,'QuotaExceededError');assert.equal(error.cause,original);return true;
 });
});
test('priority and device security errors retain their exact control flags',async()=>{
 for(const flag of ['deferred','deviceRevoked']){
  const original=Object.assign(Error('Stop'),{[flag]:true});
  await assert.rejects(()=>step('Saving files',()=>{throw original;}),error=>error===original);
 }
 assert.equal(await step('Saving files',()=>7),7);
});
