// Historic materializers can restore the pre-workspace owner screen. Install
// the exact v110453 UI wiring before v110477 applies its navigation contract.
// Keep release stamps and account-sync installation in the original chain.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='source/src/modules/owneros/OwnerOperatorOSV102.jsx';
let source=fs.readFileSync(file,'utf8');
if(!source.includes("import EvidenceWorkspace from './EvidenceWorkspaceV110453.jsx';")){
 const installer=fs.readFileSync('scripts/finalize-evidence-workspace-v110453.mjs','utf8');
 const boundary="const VERSION='110.4.53',BUILD='v110453-evidence-workspace';";
 assert.equal(installer.split(boundary).length,2,'Exact workspace UI/release boundary');
 const ui=installer.split(boundary)[0].replace("import fs from 'node:fs';",'');
 // The checked repository installer validates every UI replacement anchor.
 new Function('fs',ui)(fs);
 source=fs.readFileSync(file,'utf8');
}
assert.ok(source.includes("if(tab==='documents')return <EvidenceWorkspace"),'Documents opens the records workspace');
assert.ok(source.includes("window.addEventListener('road-ready-evidence-filed',refreshBusiness);"),'Workspace filing refresh listener');
console.log('PASS — required evidence workspace exists before navigation installation');
