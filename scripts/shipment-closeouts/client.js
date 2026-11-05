'use client';
import {useEffect,useState} from 'react';
import {cloudClient} from './client.js';
const EMPTY=Object.freeze([]),PREFIX='road-ready-shipment-reviews-v1:';
// Read-only, account-scoped metadata. Signed days and active-device ownership
// are not written or taken over while receiving a completion confirmation.
export function startShipmentReviewSync(client,{storage,emit,online=()=>true}){
 let stopped=false,generation=0,uid='',controller=null,busy=false;
 const cached=id=>{try{const value=JSON.parse(storage.getItem(PREFIX+id)||'[]');return Array.isArray(value)?value:EMPTY;}catch{return EMPTY;}};
 async function refresh(){
  if(stopped||!uid||!online()||busy)return;
  busy=true;const owner=uid,version=generation,abort=new AbortController();controller=abort;
  const timeout=setTimeout(()=>abort.abort(),10000);
  try{
   const rows=[];
   for(let offset=0;;offset+=500){
    const {data,error}=await client.from('road_ready_shipment_reviews').select('id,driver_id,pickup_event_id,pickup_day,shipment_reference,status,basis,confirmed_at').eq('user_id',owner).order('confirmed_at').order('id').range(offset,offset+499).abortSignal(abort.signal);
    if(error)throw error;rows.push(...(data||[]));if(!data||data.length<500)break;
   }
   if(stopped||generation!==version||uid!==owner)return;
   try{storage.setItem(PREFIX+owner,JSON.stringify(rows));}catch{}
   emit(rows);
  }catch{/* Keep the last confirmed account copy while offline; retry on resume. */}
  finally{clearTimeout(timeout);if(generation===version){busy=false;controller=null;}}
 }
 function sessionChanged(session){
  const next=session?.user?.id||'';if(next===uid)return;
  generation++;controller?.abort();busy=false;uid=next;emit(next?cached(next):EMPTY);
  // Supabase auth callbacks must return before starting another client request.
  if(next)queueMicrotask(refresh);
 }
 const subscription=client.auth.onAuthStateChange((_event,session)=>{if(!stopped)sessionChanged(session);});
 const initialGeneration=generation;
 client.auth.getSession().then(({data})=>{if(!stopped&&generation===initialGeneration)sessionChanged(data?.session);}).catch(()=>{});
 return {refresh,stop(){stopped=true;generation++;controller?.abort();subscription.data.subscription.unsubscribe();}};
}
export function useShipmentCompletionReviews(){
 const [rows,setRows]=useState(EMPTY);
 useEffect(()=>{
  const client=cloudClient();if(!client)return;
  const sync=startShipmentReviewSync(client,{storage:localStorage,emit:next=>setRows(old=>JSON.stringify(old)===JSON.stringify(next)?old:next),online:()=>navigator.onLine!==false});
  const resume=()=>{if(document.visibilityState!=='hidden')void sync.refresh();};
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  const timer=setInterval(resume,90000);
  return()=>{clearInterval(timer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);sync.stop();};
 },[]);
 return rows;
}
