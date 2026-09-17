import {fixture} from '../v110367/fixture.mjs';
export const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Test City',state:'NY',source:'manual',note:'',description:'',reasons:[],...extra});
export function sequenceFixture() {
 const s=fixture();s.eventsByDay={};s.routeLegsByDay={};s.activeDay='2026-09-17';
 const refs=['97155','001','324','8494'],trailers=['L827217','16060','904','511865'];
 refs.forEach((ref,i)=>{
  const day=`2026-09-${13+i}`,id='pickup-'+ref;
  s.eventsByDay[day]=[row('before-'+ref,'D',0,600),row(id,'ON',600,630,{note:'Hook / Pickup Trailer',shippingDocs:ref,hookedTrailer:trailers[i]}),row('after-'+ref,'D',630,1440)];
  s.routeLegsByDay[day]=[{id:'route-'+ref,day,pickupDay:day,pickupEventId:id,pickupMin:600,shippingDocs:ref,toCity:'Destination '+ref,toState:'WI',status:'open',kind:'loaded'}];
 });
 s.eventsByDay['2026-09-17']=[row('overnight','D',0,16),row('sleep','SB',16,646),row('pretrip','ON',646,666,{note:'Pre-trip inspection'}),row('drive','D',666,900),row('delivery-current','ON',900,930,{note:'Drop Load / Trailer',shippingDocs:'8494',droppedTrailer:'511865'}),row('empty','D',930,1440)];
 s.eventsByDay['2026-09-18']=[row('next-day','OFF',0,1440)];
 return s;
}
