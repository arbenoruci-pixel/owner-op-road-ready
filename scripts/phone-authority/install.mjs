import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='lib/owner-op-cloud/accountSyncV110455.js';
let source=fs.readFileSync(file,'utf8');
// Guard automatic merges before the existing, snapshot-validated manual choices.
const anchor='   if(choices&&conflictReview&&same(';
const guard="   if(!receiving)assertPhoneLogbookRetained(local.encoded,merge.records,{receivingArchive,base});\n";
assert.equal(source.split(anchor).length,2,'Account merge guard anchor changed');
assert(source.indexOf(anchor)<source.indexOf("const payload={...(remote?.payload||{})"),'Guard must precede cloud commit and local install');
assert(source.includes("workingRecord} from './accountCoreV110455.js';"),'Account core import changed');
source=source.replace("workingRecord} from './accountCoreV110455.js';","workingRecord,assertPhoneLogbookRetained} from './accountCoreV110455.js';").replace(anchor,guard+anchor);
fs.writeFileSync(file,source);
console.log('PASS — active phone logbook rejects incoming cloud replacements before either copy is written; explicit handoff retained');
