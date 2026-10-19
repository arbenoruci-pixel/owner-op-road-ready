// These readers use explicit labels in the same source observation. In
// particular, a carrier's billing address is never a pickup address.
import {hasRateStructure,dateValue} from './rateVocabulary.js';
import {isDocumentParty} from './fieldGuards.js';

const labeled={
  shipper:/^\s*(?:PICK[ -]?UP(?:\s+(?:COMPANY|NAME))?)\s*:\s*(.+?)\s*$/id,
  consignee:/^\s*(?:DELIVERY(?:\s+(?:COMPANY|NAME))?)\s*:\s*(.+?)\s*$/id,
  pickupAddress:/^\s*PICK[ -]?UP\s+ADDRESS\s*:\s*(.+?)\s*$/id,
  deliveryAddress:/^\s*DELIVERY\s+ADDRESS\s*:\s*(.+?)\s*$/id,
  pickupCity:/^\s*PICK[ -]?UP\s+CITY(?:\s*\/\s*STATE)?\s*:\s*(.+?)\s*$/id,
  deliveryCity:/^\s*DELIVERY\s+CITY(?:\s*\/\s*STATE)?\s*:\s*(.+?)\s*$/id,
  pickupDate:/^\s*PICK[ -]?UP\s+DATE\s*:\s*(.+?)\s*$/id,
  documentDate:/^\s*(?:DOCUMENT|ISSUE)\s+DATE\s*:\s*(.+?)\s*$/id,
  pickupAppointment:/^\s*PICK[ -]?UP\s+(?:APPOINTMENT|APPT|TIME|WINDOW)\s*:\s*(.+?)\s*$/id,
  deliveryAppointment:/^\s*DELIVERY\s+(?:APPOINTMENT|APPT|TIME|WINDOW)\s*:\s*(.+?)\s*$/id,
  poNumber:/^\s*(?:P\.?\s*O\.?|PURCHASE\s+ORDER)\s*(?:NUMBER\b|NO\b\.?|#|:)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{1,39})\s*$/id,
};
const fullAddress=/^\d+[A-Z]?(?:[-/]\d+)?\s+.+\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i;
const clock=String.raw`(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[AP]M)?`;
const appointment=new RegExp(String.raw`^\s*(?:(?:Apt|Appt|Appointment)\s*)?(${clock}(?:\s*[-–—]\s*${clock})?(?:\s+(?:Apt|Appt|Appointment|FCFS))?)(?:\s+Note\s*:\s*\w+)?\s*$`,'id');
const title=/^\s*(TQL)\s+RATE\s+CONFIRMATION\s+FOR\s+PO\s*#\s*([A-Z0-9][A-Z0-9._/-]{1,39})\s*$/id;
const reference=/^\s*TQL\s+PO\s*#\s*([A-Z0-9][A-Z0-9._/-]{1,39})\s*$/id;
const sameRow=(a,b)=>a?.box&&b?.box&&Math.min(a.box.y+a.box.height,b.box.y+b.box.height)-Math.max(a.box.y,b.box.y)>=Math.min(a.box.height,b.box.height)*.45;
const strong=(line,native)=>native?(line.confidence==null||line.confidence>=.8):Number.isFinite(line.confidence)&&line.confidence>=.8;
const exact=line=>({line,start:line.text.indexOf(line.text.trim()),end:line.text.trimEnd().length});
const single=values=>values.length===1?values[0]:null;

export function rateLabeledMatches(page,spec){
  const key=spec.rateVocabulary,pattern=labeled[key];if(!pattern)return [];
  const matches=[];
  for(const observation of page.observations){
    if(!hasRateStructure(observation.lines))continue;
    for(const line of observation.lines){
      const found=pattern.exec(line.text);if(!found)continue;
      const value=found[1],issue=key.endsWith('Address')&&!fullAddress.test(value)?'incomplete_address'
        :key.endsWith('Appointment')&&!appointment.test(value)?'appointment_needs_review'
        :['shipper','consignee'].includes(key)&&(!isDocumentParty(value)||/^[\w .'-]+,\s*[A-Z]{2}(?:\s+\d{5})?$/i.test(value))?'party_needs_review':null;
      matches.push({observation,line,start:found.indices[1][0],end:found.indices[1][1],supportMethod:'explicit_rate_label',...(issue?{issue}:{})});
    }
  }
  return matches;
}

// A vendor title identifies this table family, while the actual printed
// column headings and source coordinates bind each value to its role. The
// native and OCR observations are checked separately; weak OCR stays pending.
export function carrierRateTableMatches(page,spec){
  const key=spec.rateVocabulary,matches=[];if(!key)return matches;
  for(const observation of page.observations){
    const native=observation.source==='pdf-text-layer';
    const heading=observation.lines.slice(0,20).find(line=>title.test(line.text));
    if(['loadNumber','poNumber'].includes(key)){
      for(const line of observation.lines){
        const h=title.exec(line.text),r=reference.exec(line.text),found=h||r;
        if(!found)continue;
        const index=h?2:1;
        matches.push({observation,line,start:found.indices[index][0],end:found.indices[index][1],supportMethod:'explicit_rate_po'});
      }
    }
    if(!heading||!hasRateStructure(observation.lines))continue;
    if(key==='broker'){
      const found=title.exec(heading.text);
      matches.push({observation,line:heading,start:found.indices[1][0],end:found.indices[1][1],supportMethod:'explicit_rate_broker'});
    }
    if(!observation.sourceImageId)continue;
    const lines=observation.lines.filter(line=>line.box&&line.text.trim());
    const push=(line,label,proof=[],range=exact(line))=>{
      const all=[heading,label,line,...proof].filter(Boolean);
      matches.push({observation,...range,labelLine:label,extraLabelLines:[heading,...proof],supportMethod:native?'native_labeled_rate_table':'ocr_labeled_rate_table',
        ...(!all.every(item=>strong(item,native))?{issue:'layout_needs_review'}:{})});
    };
    // Only a unique value immediately below its explicit table column.
    const below=(label,row,accept,maxDistance=.045)=>{
      const right=row.filter(other=>other.box.x>label.box.x+.005).sort((a,b)=>a.box.x-b.box.x)[0]?.box.x??1;
      const values=lines.filter(line=>line!==label&&line.box.y>label.box.y+label.box.height*.6&&line.box.y<label.box.y+maxDistance
        &&line.box.x>=label.box.x-.008&&line.box.x<right-.008&&accept(line));
      const first=values.sort((a,b)=>a.box.y-b.box.y)[0];
      return first&&single(values.filter(line=>sameRow(first,line)));
    };
    if(key==='carrier'){
      const block=single(lines.filter(line=>/^\s*CARRIER\s+CONTACT\s*$/i.test(line.text)));
      if(block){
        const name=single(lines.filter(line=>/^\s*Name\s*$/i.test(line.text)&&line.box.y>block.box.y&&line.box.y<block.box.y+.06));
        const row=name&&lines.filter(line=>sameRow(name,line));
        if(name&&row.some(line=>/^\s*MC\s*#\s*\/\s*DOT\s*#\s*$/i.test(line.text))&&row.some(line=>/^\s*Phone\s*$/i.test(line.text))){
          const value=below(name,row,line=>isDocumentParty(line.text)&&!/^\s*(?:Address|Dispatcher|Name|Phone|Terms)\s*$/i.test(line.text),.038);
          if(value)push(value,name,[block,...row]);
        }
      }
    }
    if(key==='equipment'){
      const label=single(lines.filter(line=>/^\s*Trailer\s+Type\s*$/i.test(line.text)));
      const row=label&&lines.filter(line=>sameRow(label,line));
      if(label&&row.some(line=>/^\s*Mode\s*$/i.test(line.text))&&row.some(line=>/^\s*Trailer\s+Size\s*$/i.test(line.text))){
        const value=below(label,row,line=>/^(?:(?:Dry|Refrigerated)\s+)?(?:Van|Reefer|Flatbed|Step Deck|Conestoga|Power Only)$/i.test(line.text.trim()));
        if(value)push(value,label,row);
      }
    }
    for(const role of ['pickup','delivery']){
      if(![role+'City',role+'Date',role+'Appointment'].includes(key))continue;
      const pattern=role==='pickup'?/^\s*Pick[ -]?up\s+Location\s*$/i:/^\s*Delivery\s+Location\s*$/i;
      const location=single(lines.filter(line=>pattern.test(line.text)));if(!location)continue;
      const row=lines.filter(line=>sameRow(location,line));
      const date=single(row.filter(line=>/^\s*Date\s*$/i.test(line.text))),time=single(row.filter(line=>/^\s*Time\s*$/i.test(line.text)));
      if(!date||!time||date.box.x<=location.box.x||time.box.x<=date.box.x)continue;
      const city=below(location,row,line=>/^[A-Z][A-Z .'-]*,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i.test(line.text.trim()));
      const day=below(date,row,line=>dateValue.test(line.text.trim()));
      const appt=below(time,row,line=>appointment.test(line.text));
      if(!city||!day||!appt||!sameRow(city,day))continue;
      // The appointment may wrap independently within its own time column.
      const proof=[location,date,time,city,day,appt];
      if(key===role+'City')push(city,location,proof);
      if(key===role+'Date')push(day,date,proof);
      if(key===role+'Appointment'){
        const found=appointment.exec(appt.text);
        push(appt,time,proof,{line:appt,start:found.indices[1][0],end:found.indices[1][1]});
      }
    }
  }
  return matches;
}

