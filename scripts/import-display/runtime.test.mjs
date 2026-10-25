import fs from 'node:fs';
import assert from 'node:assert/strict';
for(const file of ['source/src/modules/owneros/OwnerOperatorOSV102.jsx','source/src/modules/business/OwnerOpBusinessScreen.jsx','source/src/modules/home/HomeScreen.jsx','source/src/modules/documents/DocumentVaultV105.jsx']){
 const source=fs.readFileSync(file,'utf8');
 assert.ok(!source.includes('event?.detail || readBusinessStore()'),file+' must read committed business data');
}
assert.ok(!fs.readFileSync('source/src/modules/owneros/OwnerOperatorOSV102.jsx','utf8').includes('event?.detail || readOwnerOpsStoreV102()'));
const source=fs.readFileSync('source/src/modules/business/OwnerOpBusinessScreen.jsx','utf8');
assert.ok(source.includes("archived:'Archived'"));
assert.ok(source.includes('if (currentIndex < 0) return null;'));
console.log('PASS — final materialized display consumers retain the sync and historical-status repair');
