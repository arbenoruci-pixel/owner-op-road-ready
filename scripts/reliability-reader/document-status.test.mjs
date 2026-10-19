import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.argv[2]||'/tmp/road-ready-review-runtime');
const {buildVaultDocumentV105}=await import(pathToFileURL(path.join(runtime,'source/src/modules/documents/documentFoundationV105.js')));
const {documentSyncLabel}=await import(pathToFileURL(path.join(runtime,'source/src/modules/scan/documentSyncLabel.js')));
const local={local_id:'synthetic-status-document',client_document_id:'synthetic-status-client',original_file_name:'synthetic.pdf',mime_type:'application/pdf',file_size_bytes:10,document_date:'2026-10-12',metadata_sync_state:'pending_account'};
function project(status,{pending=true,original=false}={}){return buildVaultDocumentV105({stored:{localDocument:{...local,original_sync_state:original?'synced':'',sync_state:status},cloud:{status,metadataPending:pending,scope:'original_and_requested_link'}},type:{id:'pod',label:'POD'},fields:{type:'pod',loadNo:'TEST-80173',date:'2026-10-12'},analysis:{},selectedLoadNo:'TEST-80173',documentDate:'2026-10-12',userConfirmed:true});}
for(const status of ['synced','original_synced']){
 const record=project(status);assert.equal(record.metadataSyncState,'pending_account');assert.equal(record.originalSyncState,'synced');assert.equal(record.cloudSyncScope,'original_and_requested_link');assert.equal(documentSyncLabel(record),'Cloud original saved · filing details pending');
}
assert.equal(documentSyncLabel(project('offline')),'Available offline');
assert.equal(documentSyncLabel(project('offline',{original:true})),'Cloud original saved · filing details pending');
assert.equal(documentSyncLabel({syncState:'synced'}),'Cloud original saved');
const component=fs.readFileSync(path.join(runtime,'source/src/modules/documents/DocumentVaultV105.jsx'),'utf8');assert.ok(component.includes('{documentSyncLabel(document)}'));assert.ok(!component.includes("? 'Cloud synced'"));
console.log('PASS — actual Vault projection and status renderer distinguish original availability from pending filing details for primary, alias, and offline review');
