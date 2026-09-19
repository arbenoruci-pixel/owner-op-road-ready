import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
const prefix='scripts/v110378/';
const packs=['ui-edits','integrity-edits','tests-edits','new-core','new-components','new-activities','new-style'];
// Exact outputs of the following mobile/interaction stages; arbitrary edits still fail.
const completedHashes={
  "source/src/shared/duty/DutyForm.jsx": "f685f85503672acc18a8d7bbca2fa5a4757171c8f8fc96f486b1ce129579266a",
  "source/src/modules/editor/EditEventSheet.jsx": "8e918d372a82485c550118b14a301f784031496509dfb7e236bdf4a20eb9a787",
  "scripts/browser-midnight-prefix-v110319.mjs": "983449ff39dec1f6152b2008163b4280bc87153a3b7522a062b6b07b23d65433",
  "scripts/browser-motive-override-v11023.mjs": "41c5666ba455109d41021a6133e0fcd8f4fb95ed70325c5a00b5ff19dff94fe0",
  "source/src/shared/duty/dutyForm.css": "e1400b74e43f75cc1b799747c3ef1ba2dd9164ed7b34e676147083a38e32b23c"
};
const prepared=[],seen=new Set();
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));
for(const name of packs){
 const entries=JSON.parse(fs.readFileSync(prefix+name+'.json','utf8'));
 for(const [file,change] of Object.entries(entries)){
  assert.ok(/^(source\/src\/|app\/|scripts\/browser-)/.test(file)&&!file.split('/').includes('..')&&!path.isAbsolute(file),'Unsafe patch target');
  assert.ok(!seen.has(file),'Duplicate patch target '+file);seen.add(file);
  const source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
  if(source!==null&&(hash(source)===change.after||hash(source)===completedHashes[file]))continue;
  assert.equal(source===null?null:hash(source),change.before,'Exact 110.3.77 baseline changed: '+file);
  if(locks.files[file])assert.equal(hash(source),locks.files[file],'Protected prepatch hash differs: '+file);
  let next=change.text;
  if(next===undefined){
   assert.equal(typeof source,'string');const lines=source.match(/[^\n]*\n|[^\n]+$/g)||[];
   let cursor=lines.length;
   for(const edit of [...change.edits].sort((a,b)=>b.from-a.from)){
    assert.ok(Number.isInteger(edit.from)&&Number.isInteger(edit.to)&&edit.from>=0&&edit.from<=edit.to&&edit.to<=cursor,'Invalid or overlapping range '+file);
    lines.splice(edit.from,edit.to-edit.from,edit.text);cursor=edit.from;
   }
   next=lines.join('');
  }
  assert.equal(hash(next),change.after,'Result checksum mismatch: '+file);
  prepared.push({file,next});
 }
}
// Check every baseline/result before writing any file. No user data is read.
for(const {file,next} of prepared){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,next);}
const day='source/src/modules/logbook/DayLogScreen.jsx';
locks.files[day]=hash(fs.readFileSync(day,'utf8'));
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — shared Duty Form and recorded-pickup identity guards installed with exact checksums');
