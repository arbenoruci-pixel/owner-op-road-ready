import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {installDutyCompatibility} from '../test-support/install-duty-compatibility.mjs';

const file='source/src/modules/editor/EditEventSheet.jsx';
const manifest='scripts/test-support/reviewed-duty-hashes.json';
const hash=source=>createHash('sha256').update(source).digest('hex');
const beforeHash='0eba613f1dd1aff4140fd9280fd9cb9fd0aeca7c8bc62305472ea6b5c2a3e194';
const afterHash='079c38d2394c72a9d362ed916d8090070ae08481795579db6e67d628d3ceab8f';
const source=fs.readFileSync(file,'utf8');
const previousReviewed=JSON.parse(fs.readFileSync(manifest,'utf8'));
for(const [target,expected] of Object.entries(previousReviewed)) {
  assert.equal(hash(fs.readFileSync(target,'utf8')),expected,'Reviewed duty runtime changed: '+target);
}
if(hash(source)!==afterHash) {
  assert.equal(hash(source),beforeHash,'Single BOL editor requires the reviewed midnight editor');
  const start=source.indexOf('  const sourceReference=');
  const end=source.indexOf('  return <DutyForm',start);
  assert.ok(start>=0&&end>start,'Recorded-reference helper boundary');
  let next=source.slice(0,start)+source.slice(end);
  const loadStart=next.indexOf('    load={(activityKind||shippingDocs||loadNo||bol||sourceConflict)?');
  const loadEnd=next.indexOf('\n    notes={',loadStart);
  assert.ok(loadStart>=0&&loadEnd>loadStart,'Recorded load-field boundary');
  // Only the visible form changes. Existing distinct load, shipping and
  // destination values remain in the unchanged sparse-save adapter.
  next=next.slice(0,loadStart)+`    load={(activityKind||shippingDocs||loadNo||bol)?<DutySection title="BOL #">
      <input aria-label="BOL #" value={bol} onChange={e=>setBol(e.target.value)} placeholder="BOL #" autoComplete="off"/>
    </DutySection>:null}`+next.slice(loadEnd);
  assert.equal(hash(next),afterHash,'Reviewed single-BOL output changed');
  fs.writeFileSync(file,next);
  fs.writeFileSync(manifest,JSON.stringify({...previousReviewed,[file]:afterHash},null,2)+'\n');
}
installDutyCompatibility(process.cwd(),{previousReviewed});
console.log('PASS — recorded load references display only the existing BOL field');
