import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='scripts/build-v110.mjs';
let source=fs.readFileSync(path,'utf8');
const call="steps.push('finalize-editor-graph-v110354.mjs');";
if(!source.includes(call)){
  const anchor="const program=original.replace(anchor,steps.map(script=>`run(process.execPath,['scripts/${script}']);`).join('\\n')+'\\n'+anchor);";
  assert.equal(source.split(anchor).length-1,1,'Production build insertion anchor changed');
  source=source.replace(anchor,call+'\n'+anchor);
  fs.writeFileSync(path,source);
}
console.log('PASS — v110.3.54 editor graph cleanup scheduled after all existing materializers');