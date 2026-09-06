import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('lib/owner-op-cloud/migration.js','utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
const storage=new Map(),calls=[];
let db={documents_local:{toArray:async()=>[{client_document_id:'fixture-document',title:'Synthetic file'}]},document_blobs:{where:()=>({equals:()=>({first:async()=>null})})}};
const context=vm.createContext({
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 getOwnerOpDb:()=>db,
 cloudSession:async()=>({user:{id:'fixture-user'}}),
 cloudClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='owner_op_migration_status_v1'?{status:'running',expected_summary:{}}:{}};}}),
 backupLocalData:async()=>({uploaded:0,remaining:0,errors:[]}),
 enableAutoBackup:()=>assert.fail('Incomplete migration must not enable automatic backup'),
 localState:()=>assert.fail('Missing original bytes must block snapshot completion'),
 setTimeout,Date,console,
});
vm.runInContext(source+'\nthis.testApi={uploadSupportingBatch,runAuthorizedFullMigration,supportingRows};',context);
for(let pass=1;pass<=2;pass++){
 await assert.rejects(()=>context.testApi.runAuthorizedFullMigration(),/local file bytes are missing/);
 assert.equal(calls.filter(c=>c.name==='owner_op_migration_mark_v1'&&c.args.p_status==='complete').length,0);
 assert.equal(calls.filter(c=>c.name==='owner_op_migration_mark_v1'&&c.args.p_status==='error').length,pass);
 console.log('PASS — missing original blocks completion on attempt '+pass);
}
assert.ok(JSON.parse(storage.get('owner-op-full-migration-v1:fixture-user')).supporting['fixture-document'].missing);
console.log('PASS — retry journal retained without suppressing error');
db=null;
await assert.rejects(()=>context.testApi.supportingRows(),/database is unavailable/);
console.log('PASS — unavailable local database fails closed');
assert.match(source,/uploadVerified\(/);
console.log('PASS — verified upload and checksum path remains enabled');
