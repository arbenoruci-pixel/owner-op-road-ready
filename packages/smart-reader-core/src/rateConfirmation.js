// Rate confirmations keep stop context inside one observation. A generic STOP
// is only proposed as delivery for a single-pick, single-stop layout; every
// unproven section-derived value still needs confirmation against its source.
import {isDocumentParty} from './fieldGuards.js';
import {nativeStopEvidence} from './nativeStopEvidence.js';

const pickup=/^\s*(?:PICK(?:\s*UP)?|SHIPPER)(?:\s*[:#]?\s*\d+)?\s*:?\s*$/i;
const delivery=/^\s*(?:DELIVERY|DELIVER|DROP(?:\s*OFF)?|CONSIGNEE)(?:\s*[:#]?\s*\d+)?\s*:?\s*$/i;
const stop=/^\s*STOP\s*[:#]?\s*\d+\s*:?\s*$/i;
const numberedPickup=/^\s*PICK(?:\s*UP)?\s*[:#]?\s*\d+\s*:?\s*$/i;
const street=/^\s*\d+[A-Z]?(?:[-/]\d+)?\s+\S/i;
const city=/^\s*[A-Z][A-Z .'-]*,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i;
const appointment=/\bAPPOINTMENT\s*:?\s*(.+?)\s*$/id;
const appointmentDate=/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.](?:\d{4}|\d{2})|\d{1,2}[- ](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[- ]\d{4})\b/gid;
const partyNoise=/^(?:PICK(?:\s*UP)?|DELIVERY|STOP|SHIPPER|CONSIGNEE|ADDRESS|LOCATION|CONTACT|PHONE|TEL|FAX|APPOINTMENT|CHECK\s*IN|INSTRUCTIONS|PLEASE|NOTE|HOURS|RECEIVING\s+HOURS)\b/i;
const boilerplate=/\b(?:SIGNATURE|SIGNED|LATE\s+FEE|DETENTION|TONU|LAYOVER|INSURANCE|PAYMENT\s+TERMS|SEND\s+INVOICE|DOCUMENT\s+REF)\b/i;

function cityAfter(lines,index){
  const address=lines[index],next=lines[index+1];
  if(city.test(next?.text||''))return next;
  // Positioned PDF rows keep a right-hand appointment separate from the
  // street. Skip only that same-row cell when locating the city underneath.
  const tail=lines[index+2],a=address?.box,b=next?.box,c=tail?.box;
  return a&&b&&c&&appointment.test(next.text)&&b.x>a.x+a.width
    &&Math.abs(b.y-a.y)<Math.max(a.height,b.height)&&city.test(tail.text)
    &&Math.abs(c.x-a.x)<.03&&c.y>a.y&&c.y-a.y<.05?tail:null;
}

function sections(lines) {
  const markers=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    let kind=pickup.test(line.text)?'pickup':delivery.test(line.text)?'delivery':stop.test(line.text)?'stop':null;
    if(!kind)continue;
    // Forms can print PICK 1 immediately above a PICK UP placeholder.
    const previous=markers.at(-1);
    if(kind==='pickup'&&previous?.kind==='pickup'&&numberedPickup.test(previous.line.text)
      &&/^\s*PICK\s*UP\s*$/i.test(line.text)&&lines.slice(previous.index+1,i).every(l=>!l.text.trim()))continue;
    markers.push({kind,line,index:i});
  }
  const simple=markers.length===2&&markers[0].kind==='pickup'&&markers[1].kind==='stop';
  return markers.map((marker,i)=>({...marker,rawKind:marker.kind,nextMarker:markers[i+1]?.line,
    allLines:lines.slice(marker.index+1,markers[i+1]?.index??lines.length),kind:marker.kind==='stop'?(simple?'delivery':'stop'):marker.kind,
    lines:lines.slice(marker.index+1,markers[i+1]?.index??lines.length).filter(l=>l.text.trim()).slice(0,7)}));
}

const range=(line,end=line.text.length)=>{
  let start=0;
  while(start<end&&/\s/.test(line.text[start]))start++;
  while(end>start&&/\s/.test(line.text[end-1]))end--;
  return {line,start,end};
};

export function rateSectionMatches(page,spec){
  const matches=[];
  for(const observation of page.observations){
    const blocks=sections(observation.lines);
    for(const section of blocks){
    if(section.kind!==spec.rateSection)continue;
    const proof=nativeStopEvidence(observation,section,blocks);
    const support=line=>proof&&[proof.address,proof.time,proof.name].includes(line)
      ?{supportMethod:'native_stop_block',extraLabelLines:proof.labels}
      :{issue:'layout_needs_review'};
    for(let i=0;i<section.lines.length;i++){
      const line=section.lines[i];
      if(boilerplate.test(line.text))break;
      const appt=appointment.exec(line.text);
      if(spec.ratePart==='appointment'&&appt){
        const [start,end]=appt.indices[1];
        matches.push({observation,line,start,end,labelLine:section.line,...support(line)});
      }
      if(spec.ratePart==='date'&&appt){
        // Keep both endpoints: a window spanning days must not become one date.
        for(const date of appt[1].matchAll(appointmentDate)){
          const [a,b]=date.indices[1],offset=appt.indices[1][0];
          matches.push({observation,line,start:offset+a,end:offset+b,labelLine:section.line,...support(line)});
        }
      }
      if(spec.ratePart==='party'&&i===0&&isDocumentParty(line.text)&&!partyNoise.test(line.text.trim())
        &&!street.test(line.text)&&!city.test(line.text)&&!appointment.test(line.text)
        &&street.test(section.lines[i+1]?.text||'')&&cityAfter(section.lines,i+1)){
        matches.push({...range(line),observation,labelLine:section.line,...support(line),
          extraLabelLines:[...(proof?.labels||[]),section.lines[i+1],cityAfter(section.lines,i+1)]});
      }
      if(spec.ratePart==='address'&&street.test(line.text)){
        const match=range(line,appt?appt.index:line.text.length),next=cityAfter(section.lines,i);
        if(!next)continue;
        const tail=range(next);
        matches.push({...match,observation,labelLine:section.line,...support(line),
          joinedValue:line.text.slice(match.start,match.end)+', '+next.text.slice(tail.start,tail.end),
          continuation:tail,continuationKind:'address'});
      }
    }
  }
  }
  return matches;
}

// Requiring a heading, an explicit total, and both stop roles avoids treating
// invoice instructions such as "attach rate confirmation" as the document.
export const rateConfirmationProfile={
  id:'rate_confirmation',label:'Rate confirmation',joinPages:false,
  heading:/^\s*(?:(?:PRO|LOAD|ORDER)\s*(?:NUMBER\b|NO\b\.?|#|:)\s*[:#]?\s*[A-Z0-9][A-Z0-9._/-]*\s+)?(?:CARRIER\s+)?(?:RATE\s*(?:CONFIRMATION|CON)|LOAD\s+CONFIRMATION)(?:\s+(?:FOR\s+)?(?:LOAD|PRO|ORDER|PO)\s*(?:NUMBER\b|NO\b\.?|#|:)\s*[:#]?\s*[A-Z0-9][A-Z0-9._/-]*)?\s*$/i,
  signals:[/^\s*(?:TOTAL\s+(?:RATE|CARRIER\s+(?:PAY|RATE))|CARRIER\s+PAY|ALL[ -]IN\s+RATE|RATE\s*\(\$\))(?=\s|:)/i,/^\s*(?:PICK(?:\s*UP)?|SHIPPER|ORIGIN|LOAD AT)\b/i,/^\s*(?:DELIVERY|DELIVER|DROP|CONSIGNEE|DESTINATION|STOP)\b/i],
  identity:'loadNumber',
  fields:{
    loadNumber:{label:'Load / PRO number',kind:'identifier',required:true,nativeCell:'loadNumber',
      pattern:/^\s*(?:PRO|LOAD|ORDER)\s*(?:NUMBER\b|NO\b\.?|ID\b|#|:)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]*)(?=\s*(?:$|\||(?:CARRIER\s+)?RATE\s*(?:CONFIRMATION|CON)\s*$))/id},
    totalRate:{label:'Total carrier rate',kind:'amount',required:true,nativeCell:'totalRate',
      pattern:/^\s*(?:TOTAL\s+(?:RATE|CARRIER\s+(?:PAY|RATE))|CARRIER\s+PAY|ALL[ -]IN\s+RATE|RATE\s*\(\$\))\s*:?\s+([$€£]?\s*\d[\d.,]*(?:\s+(?:USD|EUR|GBP|CAD|AUD|CHF))?)\s*$/id},
    broker:{label:'Broker',kind:'party',required:false,rateParty:'broker',pattern:/^\s*BROKER(?: NAME)?\s*:\s*(.+?)\s*$/id},
    carrier:{label:'Carrier',kind:'party',required:false,rateParty:'carrier',pattern:/^\s*CARRIER(?: NAME)?\s*:\s*(.+?)\s*$/id},
    shipper:{label:'Shipper',kind:'party',required:false,rateSection:'pickup',ratePart:'party',pattern:/^\s*(?:SHIPPER|SHIP FROM)\s*:\s*(.+?)\s*$/id},
    consignee:{label:'Consignee',kind:'party',required:false,rateSection:'delivery',ratePart:'party',pattern:/^\s*(?:CONSIGNEE|SHIP TO)\s*:\s*(.+?)\s*$/id},
    pickupDate:{label:'Pickup date',kind:'date',required:false,rateSection:'pickup',ratePart:'date',pattern:/^\s*PICK\s*UP DATE\s*:\s*(.+?)\s*$/id},
    deliveryDate:{label:'Delivery date',kind:'date',required:false,rateSection:'delivery',ratePart:'date',pattern:/^\s*DELIVERY DATE\s*:\s*(.+?)\s*$/id},
    equipment:{label:'Equipment',kind:'text',required:false,nativeCell:'equipment',
      pattern:/^\s*(?:SIZE\s*&\s*TYPE|EQUIPMENT(?:\s+TYPE)?)\s*:\s*(.+?)(?=\s+(?:DESCRIPTION|MILES)\s*:|$)/id},
    miles:{label:'Miles',kind:'text',required:false,nativeCell:'miles',pattern:/\bMILES\s*:\s*(\d[\d,.]*)\s*$/id},
    weight:{label:'Weight',kind:'weight',required:false,nativeCell:'weight',pattern:/\bWEIGHT\s*:\s*(\d[\d,.]*(?:\s+(?:LB|LBS|KG|KGS))?)\s*$/id},
    unitNumber:{label:'Unit number (as written)',kind:'identifier',required:false,displayWhenFound:true,
      pattern:/\bUNIT\s*(?:NUMBER\b|NO\b\.?|#|:)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]*)(?=\s|$)/id},
    vin:{label:'VIN',kind:'vin',required:false,displayWhenFound:true,
      pattern:/\bVIN\s*(?:NUMBER\b|NO\b\.?|#|:)\s*[:#]?\s*([A-Z0-9]{17})(?=\s|$)/id},
    podRequirement:{label:'POD requirement',kind:'text',required:false,displayWhenFound:true,
      pattern:/^\s*(POD\s+must\s+be\s+provided\b.*?)\s*$/id},
    lateFeeTerms:{label:'Late-fee clause',kind:'text',required:false,displayWhenFound:true,
      pattern:/^\s*((?:[$€£]\s*\d[\d.,]*\s+PER\s+DAY\s+LATE\s+FEE|LATE\s+FEE)\b.*?)\s*$/id},
    detentionTerms:{label:'Detention clause',kind:'text',required:false,displayWhenFound:true,
      pattern:/^\s*(DETENTION\b\s*[:\-–—]?\s*[$€£]\s*\d.*?)\s*$/id},
    billingEmail:{label:'Invoice recipient (from document)',kind:'text',required:false,displayWhenFound:true,
      pattern:/^\s*SEND\s+INVOICE\s+TO\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*$/id},
    pickupAddress:{label:'Pickup address',kind:'text',required:true,rateSection:'pickup',ratePart:'address'},
    pickupAppointment:{label:'Pickup appointment',kind:'text',required:true,rateSection:'pickup',ratePart:'appointment'},
    deliveryAddress:{label:'Delivery address',kind:'text',required:true,rateSection:'delivery',ratePart:'address'},
    deliveryAppointment:{label:'Delivery appointment',kind:'text',required:true,rateSection:'delivery',ratePart:'appointment'},
  },
};
