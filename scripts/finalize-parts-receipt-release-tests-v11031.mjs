import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='scripts/test-duty-graph-continuity.mjs';
let source=fs.readFileSync(path,'utf8');
const before="assert.equal(meta.version,'110.3.0');assert.equal(meta.build,'v110300-live-archive-evidence');assert.equal(meta.force,false);";
const after="assert.equal(meta.version,'110.3.1');assert.equal(meta.build,'v110301-parts-receipt-reader');assert.equal(meta.force,false);";
if(!source.includes(after)){
  assert.equal(source.split(before).length-1,1,'110.3.1 standalone graph release assertion changed');
  source=source.replace(before,after);
  fs.writeFileSync(path,source);
}
console.log('PASS — continuous graph contract follows 110.3.1 release identity without changing Logbook behavior');
