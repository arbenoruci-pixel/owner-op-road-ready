// A supported first page can supply review fields while unclassified attachment
// pages remain explicit, separate boundaries. No unknown page supplies a value.
export function primaryRateSelection(result){
  if(result?.engine!=='owned-smart-reader')return null;
  const rates=result.documents?.filter(doc=>doc.kind==='rate_confirmation')||[];
  if(rates.length!==1)return null;
  const primary=rates[0],fields=primary.fields||{};
  if(!['supported','confirmed'].includes(fields.loadNumber?.status)||!fields.loadNumber?.value
    ||!['supported','confirmed'].includes(fields.totalRate?.status))return null;
  const rest=result.documents.filter(doc=>doc!==primary);
  if(!rest.length||rest.some(doc=>doc.kind!=='unknown'||doc.identityStatus==='conflicting'))return null;
  const unknownIds=rest.flatMap(doc=>doc.pageIds);
  const identities=(result.pageIdentities||[]).filter(page=>unknownIds.includes(page.pageId));
  if(identities.some(page=>page.status==='conflicting'||(page.references?.rate_confirmation||[]).some(ref=>ref!==fields.loadNumber.value)))return null;
  return {primary,unassignedPageIds:unknownIds};
}

export function exactAppointmentTime(value=''){
  const match=/^\s*(\d{1,2}):([0-5]\d)\s*([AP]M)?(?:\s+(?:Apt|Appt|Appointment))?\s*$/i.exec(value);
  if(!match)return '';
  let hours=Number(match[1]);
  if(match[3]){if(hours<1||hours>12)return '';hours=hours%12+(match[3].toUpperCase()==='PM'?12:0);}
  if(hours>23)return '';
  return String(hours).padStart(2,'0')+':'+match[2];
}

// Legacy OCR guesses must not remain the operational route beside corrected
// source fields. Keep any unproven multi-stop proposal separately for review.
export function projectRateStops(fields,proofs,originalFields){
  const previous=Array.isArray(originalFields.stops)?originalFields.stops:[];
  const stops=[];
  for(const [sequence,role]of ['pickup','delivery'].entries()){
    const party=role==='pickup'?'shipper':'consignee',place=role==='pickup'?'origin':'destination';
    const sourceKeys=[party,place,role+'Address',role+'Date',role+'Appointment'];
    const supported=sourceKeys.filter(key=>proofs[key]);
    if(!supported.length)continue;
    const appointment=fields[role+'Appointment']||'',time=exactAppointmentTime(appointment);
    if(time)fields[role+'Time']=time;else delete fields[role+'Time'];
    const location=fields[place]||'';
    const city=/^(.+?),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/i.exec(location);
    // A complete labeled address is a useful route display when no separate
    // city cell is printed. Preserve it literally; never guess the city part.
    if(!location&&fields[role+'Address']&&proofs[role+'Address']){
      fields[place]=fields[role+'Address'];
      proofs[place]={...proofs[role+'Address'],sourceField:role+'Address'};
    }
    stops.push({type:role,sequence,company:fields[party]||'',address:fields[role+'Address']||'',
      cityState:location,city:city?.[1]||'',state:city?.[2]?.toUpperCase()||'',zip:city?.[3]||'',
      date:fields[role+'Date']||'',time,appointment,source:'reader_source',sourceFieldKeys:supported,
      needsReview:!fields[role+'Address']||!fields[role+'Date']||!appointment});
  }
  // A repeated role in the earlier parser is a possible multi-stop load. The
  // first/last aggregate fields cannot establish its full ordered itinerary.
  const multiple=previous.filter(stop=>stop.type==='pickup').length>1||previous.filter(stop=>stop.type==='delivery').length>1;
  if(multiple||stops.length!==2){
    if(previous.length)fields.readerPendingStopsV1=structuredClone(previous);
    fields.stops=[];fields.stopCount=0;
    fields.readerStopsReviewV1={required:true,reason:multiple?'multiple_stops_need_source_review':'incomplete_route',sourceStops:stops};
  }else{
    fields.stops=stops;fields.stopCount=stops.length;
    fields.readerStopsReviewV1={required:stops.some(stop=>stop.needsReview),reason:stops.some(stop=>stop.needsReview)?'missing_stop_details':null};
  }
  // These summaries were derived by the older parser and may contradict the
  // source. The route UI can derive its summary from the reviewed stops.
  delete fields.routeSummary;
  return fields;
}
