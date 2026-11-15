import test from 'node:test';import assert from 'node:assert/strict';
import {createManualLoad,setManualActive,markManualDelivered,activeFolderLoad,assertManualOriginal} from './core.js';
const old={id:'old',loadNo:'DONE-1',status:'delivered',gross:100,manualActive:true};
test('creating a manual folder retains documents and prior loads and selects only the new folder',()=>{
 const docs=[{id:'doc',sha256:'aaa'}],store={loads:[old],documents:docs};
 const next=createManualLoad(store,{loadNo:'NEXT-2',gross:'2,250.00'},'new',12);
 assert.equal(next.loads[0].gross,2250);assert.equal(next.loads[0].status,'booked');assert.equal(next.loads[0].manualActive,true);assert.equal(next.loads[1].manualActive,false);assert.equal(next.documents,docs);assert.equal(store.loads[0].manualActive,true);
 assert.throws(()=>createManualLoad(store,{loadNo:'DONE1'},'bad'),/already exists/);
});
test('manual active selection never revives closed loads or chooses arbitrarily among multiple open loads',()=>{
 const a={id:'a',loadNo:'A',status:'booked'},b={id:'b',loadNo:'B',status:'booked'},store={loads:[old,a,b]};
 assert.equal(activeFolderLoad(store.loads,null),null);
 assert.throws(()=>setManualActive(store,'old','DONE-1'),/closed/);
 const next=setManualActive(store,'b','B');assert.equal(activeFolderLoad(next.loads,null).id,'b');
 assert.throws(()=>setManualActive(store,'b','A'),/changed/);
});
test('closing a trip preserves missing paperwork and unrelated financial and driver fields',()=>{
 const a={id:'a',loadNo:'A',status:'booked',gross:1200,stops:[{address:'Original'}]},documents=[];
 const store={loads:[a,old],documents,unrelated:{retain:true}};
 const next=markManualDelivered(store,'a','A','2026-11-15',15);
 assert.equal(next.loads[0].status,'delivered');assert.equal(next.loads[0].actualDeliveryDate,'2026-11-15');assert.equal(next.loads[0].gross,1200);assert.equal(next.loads[0].stops,a.stops);assert.equal(next.documents,documents);assert.equal(next.loads[1],old);assert.equal(next.unrelated,store.unrelated);
});
test('manual filing requires the exact load, document date, explicit signed-POD check and prevents duplicate relocation',()=>{
 const store={loads:[{id:'a',loadNo:'A'}],documents:[{sha256:'known',loadNo:'OTHER'}]},args={id:'a',loadNo:'A',type:'pod',day:'2026-11-15',signed:true,sha256:'new'};
 assert.doesNotThrow(()=>assertManualOriginal(store,args));
 assert.throws(()=>assertManualOriginal(store,{...args,signed:false}),/signature/);
 assert.throws(()=>assertManualOriginal(store,{...args,sha256:'known'}),/already saved/);
 assert.throws(()=>assertManualOriginal(store,{...args,id:'other'}),/changed/);
 assert.throws(()=>assertManualOriginal(store,{...args,day:''}),/date/);
});
