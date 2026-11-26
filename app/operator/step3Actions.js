// Shared form-to-RPC contract for UI and signed-session integration tests.
import { parseUSDCents } from '../../lib/rr-lease/intake-contract.js';
import { base64Bytes } from './dotCache.js';
const val=(f,k)=>String(f.get(k)??'').trim();
const id=x=>{if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x))throw Error('Select a valid record');return x};
async function call(client,name,args){const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message||'Request rejected');return data}
export async function submitTonu(client,loadId,form){
 if(!form.has('confirmCancellation'))throw Error('Confirm cancellation and original evidence');
 const date=val(form,'cancelledAt'),reason=val(form,'reason'),amount=parseUSDCents(val(form,'amount'));
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(date)||!Number.isFinite(Date.parse(date))||Date.parse(date)>Date.now())throw Error('Actual cancellation time and explicit offset required');
 if(amount<=0||!reason||reason.length>1000)throw Error('Exact positive amount and reason required');
 return call(client,'rr_lease_step3_approve_tonu',{p_load_id:id(loadId),p_document_id:id(val(form,'documentId')),p_amount_cents:amount,p_cancelled_at:date,p_reason:reason});
}
function miles(v){if(v==='')return null;if(!/^\d{1,8}$/.test(v))throw Error('Use whole odometer miles');return Number(v)}
export async function submitMaintenance(client,operatorId,requestId,form,file){
 const category=val(form,'category');
 if(!['PM','service','warranty','defect'].includes(category))throw Error('Select maintenance record type');
 const record={kind:'maintenance',record_date:val(form,'date'),unit:val(form,'unit')||null,description:val(form,'description'),vendor:val(form,'vendor')||null,expense_category:category,odometer:miles(val(form,'odometer')),next_service_odometer:miles(val(form,'nextOdometer')),next_service_date:val(form,'nextDate')||null,amount_cents:val(form,'amount')?parseUSDCents(val(form,'amount')):null};
 if(!record.description||!record.record_date||record.amount_cents<0)throw Error('Manual date and description are required');
 let data=null;if(file){if(file.size<1||file.size>3145728||!['application/pdf','image/jpeg','image/png'].includes(file.type))throw Error('Choose PDF/JPEG/PNG up to 3 MiB');data=base64Bytes(new Uint8Array(await file.arrayBuffer()));record.file_name=file.name;record.mime_type=file.type;}
 return call(client,'rr_lease_step3_save_maintenance',{p_operator_id:id(operatorId),p_request_id:id(requestId),p_record:record,p_file_base64:data});
}
