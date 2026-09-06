import fs from 'node:fs';
const path='lib/owner-op-cloud/migration.js';
let code=fs.readFileSync(path,'utf8');
// The old once() helper considered the replacement a substring of its input,
// so it accidentally left the first-attempt-only missing-file error in place.
const before="if (!journal.supporting[key]?.missing) errors.push((doc.title || key) + ': local file bytes are missing');";
const after="errors.push((doc.title || key) + ': local file bytes are missing');";
if(code.includes(before)){
 if(code.split(before).length!==2)throw new Error('Migration missing-file guard anchor changed');
 code=code.replace(before,after);
}else if(!code.includes(after))throw new Error('Migration missing-file guard is absent');
// An unavailable local database must never be counted as a successful empty scan.
code=code.replace('if (!db) return [];',"if (!db) throw new Error('Local document database is unavailable; migration cannot be verified.');");
fs.writeFileSync(path,code);
console.log('PASS — missing file bytes remain blocking on every migration retry');
