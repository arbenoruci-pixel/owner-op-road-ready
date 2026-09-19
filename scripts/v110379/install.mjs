import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
const prepared=[];
for(const [file,change] of Object.entries(JSON.parse(fs.readFileSync('scripts/v110379/ui-edits.json','utf8')))) {
 assert.ok(['source/src/app/App.jsx','source/src/modules/status/StatusWorkflowSheet.jsx'].includes(file));
 const source=fs.readFileSync(file,'utf8');if(hash(source)===change.after)continue;
 assert.equal(hash(source),change.before,'Unexpected 110.3.78 handoff baseline: '+file);
 const lines=source.match(/[^\n]*\n|[^\n]+$/g)||[];let cursor=lines.length;
 for(const edit of [...change.edits].sort((a,b)=>b.from-a.from)) {
  assert.ok(Number.isInteger(edit.from)&&Number.isInteger(edit.to)&&edit.from>=0&&edit.from<=edit.to&&edit.to<=cursor);
  lines.splice(edit.from,edit.to-edit.from,edit.text);cursor=edit.from;
 }
 const next=lines.join('');assert.equal(hash(next),change.after);prepared.push([file,next]);
}
const helper='source/src/core/timeline/ongoingOnDutyV110379.js', helperText=fs.readFileSync('scripts/v110379/ongoingOnDuty.js','utf8');
if(fs.existsSync(helper))assert.equal(hash(fs.readFileSync(helper,'utf8')),hash(helperText),'Unexpected handoff helper edits');
prepared.push([helper,helperText]);
for(const[file,next]of prepared){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,next);}
console.log('PASS — ongoing ON-duty updates installed without modifying timeline/route engines');
