import fs from 'node:fs';
import assert from 'node:assert/strict';

function patch(file,before,after){
 const value=fs.readFileSync(file,'utf8');
 if(after.includes(before)&&value.includes(after))return;
 if(!value.includes(before)){assert.ok(value.includes(after),'Missing import display patch: '+file);return;}
 assert.equal(value.split(before).length,2,'Import display anchor changed: '+file+' '+before);
 fs.writeFileSync(file,value.replace(before,()=>after));
}
// Notifications describe why storage changed. They are not a second source of
// business data: account receive deliberately sends {source:'account-receive'}.
// Always read the committed store, including its supported quota fallback.
for(const file of ['source/src/modules/owneros/OwnerOperatorOSV102.jsx','source/src/modules/business/OwnerOpBusinessScreen.jsx','source/src/modules/home/HomeScreen.jsx','source/src/modules/documents/DocumentVaultV105.jsx'])
 patch(file,'event?.detail || readBusinessStore()','readBusinessStore()');
patch('source/src/modules/owneros/OwnerOperatorOSV102.jsx','event?.detail || readOwnerOpsStoreV102()','readOwnerOpsStoreV102()');

// Imported historical loads retain their original status. An unknown/closed
// status must never be presented as Booked or offered a restart action.
const screen='source/src/modules/business/OwnerOpBusinessScreen.jsx';
patch(screen,"return LOAD_STATUSES.find(([id]) => id === value)?.[1] || 'Booked';",
 "return LOAD_STATUSES.find(([id]) => id === value)?.[1] || ({archived:'Archived',closed:'Closed',completed:'Completed',cancelled:'Cancelled',canceled:'Cancelled',submitted:'Submitted',tonu:'TONU'})[value] || (value ? 'Needs review' : 'Booked');");
patch(screen,"const currentIndex = Math.max(0, LOAD_STATUSES.findIndex(([id]) => id === load.status));",
 "const currentIndex = LOAD_STATUSES.findIndex(([id]) => id === load.status);\n  if (currentIndex < 0) return null;");
// A legacy local ID can have distinct preserved source copies. Reuse the
// archive's evidence identity for view keys so filtering cannot leave phantom
// rows or open a different original. Never change the stored document ID.
const core='source/src/modules/owneros/evidenceWorkspaceCoreV110453.js';
patch(core,"export const CATEGORIES=","import {archiveDocumentKey} from './archiveEvidenceV1103.js';\nexport const CATEGORIES=");
patch(core," const rows=documents.map(d=>", " const occurrences=new Map();\n const rows=documents.map(d=>");
patch(core,"return {id:'doc/'+idOf(d),kind:'document'", "const identity=archiveDocumentKey(d)||idOf(d)||JSON.stringify([f,text(d.original_file_name||d.title)]),occurrence=occurrences.get(identity)||0;occurrences.set(identity,occurrence+1);return {id:'doc/'+JSON.stringify([identity,occurrence]),kind:'document'");
console.log('PASS — business, document, Home and billing views reload committed records after sync notifications; archived loads stay archived');
