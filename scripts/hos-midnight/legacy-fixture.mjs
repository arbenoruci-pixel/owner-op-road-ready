import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Keep the legacy pending test's premise true with the July2026 pairing rules.
// Its earlier full sleeper reset is itself a valid partner. Start this synthetic
// history at work so that the later8h56SB is genuinely the first eligible rest.
// Every existing assertion and expected clock value is preserved verbatim.
const file='scripts/verify-split-sleeper-v966.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const before='c1d2a2fbfbbeaa3e3b8cd3fe3137ee7c119732045b7163d1add6d4ab06b84947';
const after='f7463dc2f6069200354a0d6aa13ea34e77c5d29c757f52043c01df7b2566f322';
let source=fs.readFileSync(file,'utf8');
if(hash(source)!==after) {
  assert.equal(hash(source),before,'Legacy split fixture predecessor changed');
  const prefix=`    { id:'d0', status:'D', startMin:0, endMin:20, city:'Youngstown', state:'OH', note:'Driving' },
    { id:'sb0', status:'SB', startMin:20, endMin:1025, city:'Hubbard', state:'OH', note:'Sleeper Berth' },
`;
  assert.equal(source.split(prefix).length,2,'Legacy pending fixture prefix must be unique');
  source=source.replace(prefix,()=>`    // UNPAIRED_SPLIT_FIXTURE_V1104108: no earlier eligible rest is recorded.
    // A preceding 10h+ rest could complete this pair under current guidance.
`);
  assert.equal(hash(source),after,'Legacy pending fixture transformation changed');
  fs.writeFileSync(file,source);
}
console.log('PASS — unpaired split fixture retains every existing assertion with no earlier eligible partner');
