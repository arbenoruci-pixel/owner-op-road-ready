import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Fixed, reviewed outputs only. Never derive accepted hashes from the runtime.
// Provenance: v110444 pickup word boundaries; v110455 checklist preservation;
// v110435/v110445 DayLog display/team pickup; v110469 insert continuity;
// v110381 insert fixture and test-support/install-legacy-cloud-fixtures.mjs.
export function installDutyCompatibility(root=process.cwd()) {
  const read=file=>fs.readFileSync(path.join(root,file),'utf8');
  const reviewed=JSON.parse(read('scripts/test-support/reviewed-duty-hashes.json'));
  for(const [file,expected] of Object.entries(reviewed)) {
    assert.equal(createHash('sha256').update(read(file)).digest('hex'),expected,'Reviewed final duty runtime changed: '+file);
  }
  const serialized=JSON.stringify(reviewed);
  const edits=[
    ['scripts/v110378/install.mjs','const prepared=[],seen=new Set();',`Object.assign(completedHashes,${serialized});\nconst prepared=[],seen=new Set();`],
    ['scripts/v110378/finish-mobile.mjs'," const source=fs.readFileSync(file,'utf8');",` const source=fs.readFileSync(file,'utf8');\n if(hash(source)===${serialized}[file])return;`],
    ['scripts/v110378/finish-interaction.mjs'," const source=fs.readFileSync(path,'utf8');if(hash(source)===after)return;",` const source=fs.readFileSync(path,'utf8');if(hash(source)===after||hash(source)===${serialized}[path])return;`],
  ];
  // Validate every reviewed output and every installer anchor before any write.
  const prepared=edits.map(([file,before,after])=>{
    const source=read(file);
    if(source.includes(after))return [file,source];
    assert.equal(source.split(before).length,2,'Duty compatibility installer anchor changed: '+file);
    return [file,source.replace(before,()=>after)];
  });
  for(const [file,text] of prepared)if(read(file)!==text)fs.writeFileSync(path.join(root,file),text);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  installDutyCompatibility();
  console.log('PASS — exact reviewed duty outputs retain strict legacy rerun validation');
}
