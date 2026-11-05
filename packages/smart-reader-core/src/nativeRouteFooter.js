// Some digital rate confirmations print each stop's reference BELOW its
// address. Reading-order text interleaves the appointment, freight and carrier
// columns. Use the native cells in one bounded stop, retaining every quote.
import {hasRateStructure,dateValue} from './rateVocabulary.js';
import {isDocumentParty} from './fieldGuards.js';

const marker=/^\s*(Pickup|Delivery)\s*#\s*[A-Z0-9][A-Z0-9._/-]*\s*$/i;
const locality=/^([A-Z][A-Z .'-]*,\s*[A-Z]{2})\s+\d{5}(?:-\d{4})?$/id;
const street=/^\d+[A-Z]?(?:[-/]\d+)?\s+.*\b(?:ST(?:REET)?|RD|ROAD|AVE(?:NUE)?|DR(?:IVE)?|BLVD|BOULEVARD|WAY|LN|LANE|CT|COURT|PKWY|PARKWAY|HWY|HIGHWAY)\b[\w .'-]*$/i;
const clock='(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s*[AP]M)?';
const time=new RegExp('^'+clock+'(?:\\s*[-–—]\\s*'+clock+')?(?:\\s+(?:Apt|Appt|Appointment|FCFS))?$','i');
const right=l=>l.box.x+l.box.width;
const strong=l=>l.confidence==null||l.confidence>=.8;
const one=lines=>lines.length===1?lines[0]:null;
const range=line=>{const value=line.text.trim(),start=line.text.indexOf(value);return {line,start,end:start+value.length};};
const name=l=>isDocumentParty(l.text)&&!street.test(l.text.trim())&&!locality.test(l.text.trim())
 &&!dateValue.test(l.text.trim())&&!/^(?:Route|Equipment|Carrier|Rate|Total|Pickup|Delivery|Appointment|Qty|Weight|Handling|DOT|SCAC)\b/i.test(l.text.trim());

export function nativeFooterStops(page){
 const stops=[];
 for(const observation of page.observations){
  if(observation.source!=='pdf-text-layer'||!observation.sourceImageId||!hasRateStructure(observation.lines))continue;
  const lines=observation.lines.filter(l=>l.box&&l.text.trim());
  const markers=lines.filter(l=>marker.test(l.text)).sort((a,b)=>a.box.y-b.box.y);
  if(markers.length!==2||!/^Pickup/i.test(markers[0].text.trim())||!/^Delivery/i.test(markers[1].text.trim())
   ||!markers.every(strong)||Math.abs(markers[0].box.x-markers[1].box.x)>.015||markers[1].box.y-markers[0].box.y<.04
   ||lines.some(l=>!markers.includes(l)&&/^\s*(?:Pick\s*up|Delivery|Stop)\s*(?:[:#]?\s*\d+)?\s*:?\s*$/i.test(l.text)))continue;
  for(const [i,label]of markers.entries()){
   const start=Math.max(label.box.y-.12,markers[i-1]?markers[i-1].box.y+markers[i-1].box.height:0);
   const column=lines.filter(l=>l!==label&&Math.abs(l.box.x-label.box.x)<.012&&l.box.y>=start&&l.box.y<label.box.y).sort((a,b)=>a.box.y-b.box.y);
   const city=column.at(-1),address=column.at(-2);
   if(!city||!address||!locality.test(city.text.trim())||!street.test(address.text.trim())
    ||city.box.y-address.box.y>.03||label.box.y-city.box.y>.03||city.box.y<=address.box.y)continue;
   const names=column.slice(0,-2);
   if(!names.length||names.length>2||!names.every(name)||names.some((l,n)=>n&&(l.box.y<=names[n-1].box.y+names[n-1].box.height*.5||l.box.y-names[n-1].box.y>.03))
    ||address.box.y-names.at(-1).box.y>.035)continue;
   const proof=[label,...names,address,city];
   if(!proof.every(strong))continue;
   // Even when an appointment is missing, this geometry establishes that the
   // reference is a footer, never a heading for the following stop's text.
   const left=lines.filter(l=>right(l)<label.box.x-.02&&l.box.y>=names[0].box.y-.006&&l.box.y<city.box.y+city.box.height);
   const date=one(left.filter(l=>dateValue.test(l.text.trim())&&Math.abs(l.box.y-names[0].box.y)<.009));
   const appointment=date&&one(left.filter(l=>time.test(l.text.trim())&&l.box.y>date.box.y&&l.box.y-date.box.y<.035
    &&Math.abs(right(l)-right(date))<.025));
   stops.push({observation,label,role:i?'delivery':'pickup',names,address,city,date,appointment,proof});
  }
 }
 return stops;
}

export function nativeFooterMatches(page,spec){
 const key=spec.rateVocabulary,matches=[];
 if(!key)return matches;
 for(const stop of nativeFooterStops(page)){
  const {observation,label,role,names,address,city,date,appointment,proof}=stop;
  if(!date||!appointment||![date,appointment].every(strong))continue;
  const party=role==='pickup'?'shipper':'consignee';
  const add=(line,extra={})=>matches.push({observation,...range(line),labelLine:label,
   supportMethod:'native_route_footer',extraLabelLines:[...proof.slice(1),date,appointment],...extra});
  if(key===party)add(names[0],names.length===2?{joinedValue:names.map(l=>l.text.trim()).join(' '),continuation:range(names[1]),continuationKind:'party_block'}:{});
  if(key===role+'Address')add(address,{joinedValue:address.text.trim()+', '+city.text.trim(),continuation:range(city),continuationKind:'address'});
  if(key===role+'City'){const m=locality.exec(city.text);if(m)add(city,{start:m.indices[1][0],end:m.indices[1][1]});}
  if(key===role+'Date')add(date);
  if(key===role+'Appointment')add(appointment);
 }
 return matches;
}
