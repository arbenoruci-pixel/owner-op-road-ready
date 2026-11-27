import test from 'node:test';
import assert from 'node:assert/strict';
import {saveMaintenanceReceipt,listMaintenanceReceipts} from '../../app/operator/maintenanceReceipts.js';
import {submitMaintenance} from '../../app/operator/step3Actions.js';

const operatorId='ac011000-0000-4000-8000-000000000001';
const key='ab011000-0000-4000-8000-000000000003';
const details={mode:'total_only',payer:'driver',assetType:'trailer',totalCents:3406,totalConfirmed:true,lines:[]};
function form() {
  const value=new FormData();
  Object.entries({date:'2026-01-02',category:'service',unit:'410',description:'Seal replaced',amount:'wrong draft text'}).forEach(([k,v])=>value.set(k,v));
  return value;
}
test('one RPC sends the original and the reviewed cents, paper lines and payer together',async()=>{
  const bytes=Buffer.from('%PDF-1.7\n'+ 'Synthetic invoice'.repeat(10000));
  const file=new Blob([bytes],{type:'application/pdf'});
  Object.defineProperty(file,'name',{value:'reviewed.pdf'});
  let calls=0;
  const client={rpc(name,body) {
    calls++;
    assert.equal(name,'rr_lease_save_maintenance_receipt');
    assert.deepEqual(body.p_receipt,details);
    assert.equal(body.p_record.amount_cents,3406);
    assert.equal(body.p_record.unit,'410');
    assert.equal(body.p_file_base64.includes('\n'),false);
    assert.deepEqual(Buffer.from(body.p_file_base64,'base64'),bytes);
    assert.equal(body.p_allow_possible_duplicate,calls===2);
    return {data:{status:calls===1?'possible_duplicate':'saved',recordId:key,recordDate:'2026-01-02'}};
  }};
  assert.equal((await saveMaintenanceReceipt(client,operatorId,key,form(),file,details)).status,'possible_duplicate');
  assert.equal((await saveMaintenanceReceipt(client,operatorId,key,form(),file,details,{allowPossibleDuplicate:true})).status,'saved');
  assert.equal(calls,2);
});
test('the manual API keeps its existing amount parser and UUID response',async()=>{
  const f=form();f.set('amount','34.06');
  const client={rpc(name,body) {
    assert.equal(name,'rr_lease_step3_save_maintenance');
    assert.equal(body.p_record.amount_cents,3406);
    assert.equal(body.p_file_base64,null);
    return {data:key};
  }};
  assert.equal(await submitMaintenance(client,operatorId,key,f,null),key);
});
test('stable history pagination retains old rows with no itemization',async()=>{
  const records=Array.from({length:202},(_,i)=>({id:i,receipt:i===0?null:details}));
  const offsets=[];
  const client={rpc(name,args) {
    assert.equal(name,'rr_lease_maintenance_receipt_history');assert.equal(args.p_operator_id,operatorId);
    return {range(a,b) { offsets.push(a);return {data:records.slice(a,b+1)}; }};
  }};
  assert.deepEqual(await listMaintenanceReceipts(client,operatorId),records);
  assert.deepEqual(offsets,[0,200]);
});
