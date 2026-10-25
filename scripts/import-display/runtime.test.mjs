import fs from 'node:fs';
import assert from 'node:assert/strict';
import {catalog,filterRows} from '../../source/src/modules/owneros/evidenceWorkspaceCoreV110453.js';
for(const file of ['source/src/modules/owneros/OwnerOperatorOSV102.jsx','source/src/modules/business/OwnerOpBusinessScreen.jsx','source/src/modules/home/HomeScreen.jsx','source/src/modules/documents/DocumentVaultV105.jsx']){
 const source=fs.readFileSync(file,'utf8');
 assert.ok(!source.includes('event?.detail || readBusinessStore()'),file+' must read committed business data');
}
assert.ok(!fs.readFileSync('source/src/modules/owneros/OwnerOperatorOSV102.jsx','utf8').includes('event?.detail || readOwnerOpsStoreV102()'));
const source=fs.readFileSync('source/src/modules/business/OwnerOpBusinessScreen.jsx','utf8');
assert.ok(source.includes("archived:'Archived'"));
assert.ok(source.includes('if (currentIndex < 0) return null;'));
const docs=[{local_id:'legacy-shared',sha256:'a'.repeat(64),document_type:'bol',load_no:'LOAD-A',original_file_name:'Pickup.pdf'},{local_id:'legacy-shared',sha256:'b'.repeat(64),document_type:'pod',load_no:'LOAD-B',original_file_name:'Delivery.pdf'}];
const original=structuredClone(docs),rows=catalog(docs),reversed=catalog([...docs].reverse());
assert.equal(new Set(rows.map(r=>r.id)).size,2,'Preserved source copies need distinct view keys');
for(const row of rows)assert.equal(reversed.find(r=>r.source===row.source).id,row.id,'Source identity survives reorder');
assert.deepEqual(filterRows(rows,{query:'LOAD-B'}).map(r=>r.source),[docs[1]]);
assert.equal(new Set(catalog([docs[0],docs[0],{}]).map(r=>r.id)).size,3,'Legacy duplicate or missing IDs cannot collide');
assert.deepEqual(docs,original,'View keys never mutate document identities');
console.log('PASS — final materialized display consumers retain the sync and historical-status repair');
