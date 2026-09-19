import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
const prefix='scripts/v110378/';
const packs=['ui-edits','integrity-edits','tests-edits','new-core','new-components','new-activities','new-style'];
const prepared=[],seen=new Set();
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));
for(const name of packs){
 const entries=JSON.parse(fs.readFileSync(prefix+name+'.json','utf8'));
 for(const [file,change] of Object.entries(entries)){
  assert.ok(/^(source\/src\/|app\/|scripts\/browser-)/.test(file)&&!file.split('/').includes('..')&&!path.isAbsolute(file),'Unsafe patch target');
  assert.ok(!seen.has(file),'Duplicate patch target '+file);seen.add(file);
  const source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
  if(source!==null&&hash(source)===change.after)continue;
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
