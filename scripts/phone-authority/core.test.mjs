import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {recordsFrom,mergeRecords,same} from '../v110455/accountCore.js';
import {assertPhoneLogbookRetained} from './core.js';
const state={activeDriverId:'driver',teamDrivers:[{id:'driver',name:'Synthetic Driver'}],eventsByDay:{'2026-11-06':[{id:'event',startMin:0,endMin:1383,status:'SB'}]},signatureByDay:{'2026-11-06':{signed:true,signatureDataUrl:'saved-original',certifiedContent:{events:[{id:'event',startMin:0,endMin:1383,status:'SB'}]}}},certifyStatus:{'2026-11-06':'Certified'},dotWallet:{documents:{license:{attachmentDataUrl:'original-wallet'}}}};
const local=recordsFrom({state}),key=JSON.stringify(['day','driver','2026-11-06']);
test('cloud edit of an unchanged signed phone day cannot silently win the three-way merge',()=>{
 const remote=structuredClone(local);remote[key].eventsByDay[0].endMin=1440;
 const before=structuredClone({local,remote}),merged=mergeRecords(local,local,remote);
 assert.equal(merged.conflicts.length,0);assert.equal(merged.records[key].eventsByDay[0].endMin,1440,'This reproduces the prior automatic incoming change');
 assert.throws(()=>assertPhoneLogbookRetained(local,merged.records),/phone logbook is preserved/);
 assert.deepEqual({local,remote},before);assert.equal(local[key].eventsByDay[0].endMin,1383);assert.equal(local[key].signatureByDay.signatureDataUrl,'saved-original');
});
test('cloud deletion, extra days, wallet and identity changes are rejected on a populated phone',()=>{
 const variants=[];
 const missing=structuredClone(local);delete missing[key];variants.push(missing);
 const added=structuredClone(local);added[JSON.stringify(['day','driver','2026-11-07'])]=local[key];variants.push(added);
 for(const field of ['dotWallet','teamDrivers','homeTerminalTimeZone']){const r=structuredClone(local);r[JSON.stringify(['state',field])]={changed:true};variants.push(r);}
 for(const remote of variants)assert.throws(()=>assertPhoneLogbookRetained(local,mergeRecords(local,local,remote).records),e=>e.phoneAuthority===true);
});
test('local corrections remain uploadable; equal copies and non-logbook updates remain allowed',()=>{
 const base=structuredClone(local);base[key].eventsByDay[0].endMin=1200;
 const outgoing=mergeRecords(base,local,base);
 assert.doesNotThrow(()=>assertPhoneLogbookRetained(local,outgoing.records));assert(same(outgoing.records,local));
 const next={...local,[JSON.stringify(['business-setting','currency'])]:'USD'};
 assert.doesNotThrow(()=>assertPhoneLogbookRetained(local,next));
 assert.doesNotThrow(()=>assertPhoneLogbookRetained({},local));
});
test('final runtime enforces authority before writes and preserves explicit receiving',()=>{
 const source=fs.readFileSync('lib/owner-op-cloud/accountSyncV110455.js','utf8'),guard='if(!receiving&&!joining)assertPhoneLogbookRetained(local.encoded,merge.records);';
 assert(source.includes(guard));assert(source.indexOf(guard)<source.indexOf('const payload={...(remote?.payload||{})'));
 assert(source.indexOf(guard)<source.indexOf('if(changed)await install('));
 assert(source.includes('if(receiving)merge={records:remoteRecords,conflicts:[]};'));
 const share=fs.readFileSync('lib/owner-op-cloud/inspectionShare.js','utf8');
 assert(!/syncAccount\s*\(/.test(share),'DOT preparation must not sync account data');
 assert(share.includes('getState?.()'));assert(share.includes('assertInspectionUnchanged'));assert(share.includes('assertWalletUnchanged'));
});
