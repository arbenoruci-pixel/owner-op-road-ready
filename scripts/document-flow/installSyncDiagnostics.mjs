import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='lib/owner-op-cloud/accountSyncV110455.js';
let source=fs.readFileSync(path,'utf8');
function patch(before,after){if(source.includes(after))return;assert.equal(source.split(before).length,2,'Sync diagnostics anchor: '+before);source=source.replace(before,()=>after);}
patch("async function checked(q)",fs.readFileSync('scripts/document-flow/syncDiagnostics.js','utf8')+'\nasync function checked(q)');
patch('const local=await capture(scope),saved=tabBase;',"const local=await accountStep('Reading device records',()=>capture(scope)),saved=tabBase;");
patch('local.encoded=await encodedRecords(local,opts,scope);',"local.encoded=await accountStep('Preparing saved files',()=>encodedRecords(local,opts,scope));");
patch('if(changed)await install(merge.records,local,nextBase,uid,check,scope);',"if(changed)await accountStep('Receiving saved records',()=>install(merge.records,local,nextBase,uid,check,scope));");
patch('await check();const value=await decode(v,opts,new Map());',"await check();const value=await accountStep('Downloading saved original',()=>decode(v,opts,new Map()));");
patch('await db.account_receive_staging.put(row);',"await accountStep('Saving received file checkpoint',()=>db.account_receive_staging.put(row));");
patch("await db.sync_meta.put({key:'account-sync-v110455:pending',value:{uid,base,oldState:local.state,oldBusiness:local.business,oldLocals:local.locals},updated_at:now});","await accountStep('Saving recovery checkpoint',()=>db.sync_meta.put({key:'account-sync-v110455:pending',value:{uid,base,oldState:local.state,oldBusiness:local.business,oldLocals:local.locals},updated_at:now}));");
patch('localStorage.setItem(key,serialized);installedLocals.set(key,serialized);',"await accountStep('Saving load and document index',()=>localStorage.setItem(key,serialized));installedLocals.set(key,serialized);");
patch("await db.transaction('rw',[db.app_snapshots,db.sync_meta,db.account_receive_staging,...Object.keys(TABLE_KEYS).map(k=>db.table(k))],async()=>{","await accountStep('Installing verified records',()=>db.transaction('rw',[db.app_snapshots,db.sync_meta,db.account_receive_staging,...Object.keys(TABLE_KEYS).map(k=>db.table(k))],async()=>{");
patch("await db.sync_meta.delete('account-sync-v110455:pending');\n  });","await db.sync_meta.delete('account-sync-v110455:pending');\n  }));");
fs.writeFileSync(path,source);
