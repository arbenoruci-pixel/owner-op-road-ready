// Project verified source fields, preserving a multi-stop plan for separate review.
export function sourceRateStops(fields,proofs){
 const old=Array.isArray(fields.stops)?fields.stops:[];
 if(old.length>2||old.some(s=>!['pickup','delivery'].includes(s.type))||['pickup','delivery'].some(type=>old.filter(s=>s.type===type).length>1))return old;
 const stops=[];
 for(const [index,type] of ['pickup','delivery'].entries()){
  const party=type==='pickup'?'shipper':'consignee',cityKey=type==='pickup'?'origin':'destination';
  const keys=[party,type+'Address',cityKey,type+'Date',type+'Appointment'];
  if(!keys.some(k=>proofs[k]))continue;
  const cityState=fields[cityKey]||'',m=cityState.match(/^(.*),\s*([A-Z]{2})$/i);
  const previous=old.find(s=>s.type===type)||{};
  stops.push({...previous,id:previous.id||'source-'+type,type,sequence:previous.sequence??index+1,deliverySequence:previous.deliverySequence??(type==='delivery'?1:0),company:fields[party]||'',address:fields[type+'Address']||'',cityState,city:m?.[1]||'',state:m?.[2]||'',date:fields[type+'Date']||'',appointment:fields[type+'Appointment']||'',time:'',source:'reader_source',sourceFields:Object.fromEntries(keys.filter(k=>proofs[k]).map(k=>[k,proofs[k]]))});
 }
 return stops;
}
