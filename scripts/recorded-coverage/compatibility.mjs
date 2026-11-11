import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// These two reviewed outputs deliberately supersede the older duty installer
// outputs. Keep its exact byte checks and all unknown-edit rejection tests.
const changes=[
  ['source/src/modules/logbook/DayLogScreen.jsx','ca8577bc89e632085c180038875524caee4eaf02b458af2b28e35973b83e6629','58ec537e1732dc13eb1f06ca9f0e9c270cd38d18e8a49e1cd36449de1b78752b'],
  ['source/src/modules/logbook/eventEditingV110.js','29a415229d2f5493a47fe04b00714fb37be9e5665981b47168d04a8c77eb19ab','e21061950b1ed45e8c9cb037f98e4d1168155a9bf6fcdfb034378a501000017e'],
];
for(const [file,,expected] of changes)assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,'Reviewed recorded-time output changed: '+file);
const prepared=['install','finish-mobile','finish-interaction'].map(stage=>{
  const file=`scripts/v110378/${stage}.mjs`;
  let source=fs.readFileSync(file,'utf8');
  for(const [target,before,after] of changes) {
    if(source.includes(`"${target}":"${after}"`))continue;
    assert.equal(source.split(`"${target}":"${before}"`).length,2,'Exact duty compatibility predecessor: '+target);
    source=source.replace(`"${target}":"${before}"`,`"${target}":"${after}"`);
  }
  return [file,source];
});
for(const [file,source] of prepared)fs.writeFileSync(file,source);
console.log('PASS — reviewed recorded endpoints retain strict duty installer rerun guards');
