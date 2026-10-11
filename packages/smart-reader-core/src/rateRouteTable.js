// Native PDF route tables put the appointment on the left and the destination
// on the right. Associate cells inside a bounded stop, preserving every quote.
import {hasRateStructure,hasRateTitle,totalRateLabel,loadNumberLabel,amountValue,dateValue} from './rateVocabulary.js';
import {isDocumentParty} from './fieldGuards.js';
const strong=l=>l.confidence==null||l.confidence>=.8;
const sameRow=(a,b)=>a.box&&b.box&&Math.min(a.box.y+a.box.height,b.box.y+b.box.height)-Math.max(a.box.y,b.box.y)>=Math.min(a.box.height,b.box.height)*.45;
const right=l=>l.box.x+l.box.width;
const range=line=>{const t=line.text.trim(),start=line.text.indexOf(t);return {line,start,end:start+t.length};};
const totalLabel=new RegExp('^\\s*'+totalRateLabel+'\\s*:?\\s*$','i');
const referenceLabel=new RegExp('^\\s*'+loadNumberLabel+'\\s*[:#]?\\s*$','i');
const amount=new RegExp('^'+amountValue+'$','i');
const identifier=/^[A-Z0-9][A-Z0-9._/-]{1,39}$/i;
const pickup=/^\s*(?:PICK[ -]?UP|ORIGIN|LOAD AT)\s*:?\s*$/i;
const delivery=/^\s*(?:DELIVERY|DROP[ -]?OFF|DESTINATION|UNLOAD AT)\s*:?\s*$/i;
const address=/^\d+[A-Z]?(?:[-/]\d+)?\s+.+?,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i;
const clock=/(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[AP]M)?/i;
const window=new RegExp('^'+clock.source+'(?:\\s*[-–—]\\s*'+clock.source+')?(?:\\s+(?:Apt|Appt|Appointment|FCFS))?$','i');
const city=/(?:\b(?:St(?:reet)?|Rd|Road|Ave(?:nue)?|Dr(?:ive)?|Blvd|Boulevard|Way|Ln|Lane|Ct|Court|Pkwy|Parkway|Hwy|Highway)\.?)\s+([A-Z][A-Z .'-]*,\s*[A-Z]{2})\s+\d{5}(?:-\d{4})?$/id;
const one=list=>list.length===1?list[0]:null;

export function rateRouteMatches(page,spec){
 const key=spec.rateVocabulary,matches=[];if(!key)return matches;
 for(const observation of page.observations){
  if(observation.source!=='pdf-text-layer'||!hasRateTitle(observation.lines))continue;
  // The PDF's reading-order view can omit boxes. A standalone header label
  // may skip only known title/date/page cells to reach one exact identifier.
  if(key==='loadNumber'&&!observation.lines.some(l=>l.box))for(const [i,label]of observation.lines.slice(0,12).entries()){
   if(!referenceLabel.test(label.text))continue;
   const following=observation.lines.slice(i+1,i+4),candidates=[];
   for(const line of following){
    if(hasRateTitle([line])||dateValue.test(line.text.trim())||/^Page\s+\d+$/i.test(line.text.trim()))continue;
    if(identifier.test(line.text.trim()))candidates.push(line);else break;
   }
   for(const line of candidates)matches.push({observation,...range(line),labelLine:label,supportMethod:'native_rate_reference'});
  }
  if(!observation.sourceImageId)continue;
  const lines=observation.lines.filter(l=>l.box&&l.text.trim()),complete=hasRateStructure(observation.lines);
  const add=(line,label,extra={})=>matches.push({observation,...range(line),labelLine:label,...extra});
  const rowValue=(label,accept)=>{
   const cells=lines.filter(l=>l!==label&&sameRow(label,l)&&l.box.x>=right(label)-.002).sort((a,b)=>a.box.x-b.box.x);
   const first=cells[0];return first&&(!cells[1]||cells[1].box.x>right(first)-.002)&&accept(first)?first:null;
  };
  // Explicit header references can support a repeated continuation header.
  if(key==='loadNumber')for(const label of lines.filter(l=>referenceLabel.test(l.text)&&l.box.y<.3)){
   let value=rowValue(label,l=>identifier.test(l.text.trim()));
   if(!value){
    const below=lines.filter(l=>l!==label&&l.box.y>label.box.y+label.box.height*.6&&l.box.y<label.box.y+label.box.height+.035
     &&Math.min(right(l),right(label))-Math.max(l.box.x,label.box.x)>Math.min(l.box.width,label.box.width)*.5);
    below.sort((a,b)=>a.box.y-b.box.y);
    value=one(below.filter(l=>sameRow(l,below[0])));if(value&&!identifier.test(value.text.trim()))value=null;
   }
   if(value)add(value,label,{supportMethod:'native_rate_reference'});
  }
  if(!complete)continue;
  if(['broker','carrier','equipment'].includes(key))for(const line of observation.lines){
   const m=new RegExp('^\\s*'+key+'\\s+(.+?)\\s*$','id').exec(line.text);if(!m)continue;
   const value=m[1];
   if(key==='equipment'?!/^(?:(?:Dry|Reefer|Refrigerated)\s+)?(?:Van|Flatbed|Step Deck|Reefer|Power Only|Conestoga|Box Truck|Double Drop)(?:\s+\d{2}['′]?)?$/i.test(value)
    :!/\b(?:LLC|INC\.?|LTD\.?|CORP\.?|CORPORATION|LIMITED)\s*$/i.test(value)||!isDocumentParty(value))continue;
   matches.push({observation,line,start:m.indices[1][0],end:m.indices[1][1],supportMethod:'native_rate_label'});
  }
  if(key==='totalRate')for(const label of lines.filter(l=>totalLabel.test(l.text))){
   // Existing strict labels retain their existing proposal semantics.
   if(/^(?:TOTAL RATE|TOTAL CARRIER (?:PAY|RATE)|CARRIER PAY|ALL[ -]IN RATE|RATE\s*\(\$\))\s*:?$/i.test(label.text.trim()))continue;
   const value=rowValue(label,l=>amount.test(l.text.trim()));
   if(value)add(value,label,{supportMethod:'native_rate_total'});
  }
  if(['carrier','broker','equipment'].includes(key))for(const label of lines.filter(l=>new RegExp('^\\s*'+key+'(?:\\s+(?:Name|Type))?\\s*:?\\s*$','i').test(l.text))){
   const value=rowValue(label,l=>key==='equipment'?/^[A-Z][A-Z0-9 /&.'"-]{1,60}$/i.test(l.text.trim()):isDocumentParty(l.text.trim()));
   if(value)add(value,label,{supportMethod:'native_rate_label'});
  }
  const markers=lines.filter(l=>pickup.test(l.text)||delivery.test(l.text)).sort((a,b)=>a.box.y-b.box.y);
  if(markers.length!==2||!pickup.test(markers[0].text)||!delivery.test(markers[1].text))continue;
  if(Math.abs(right(markers[0])-right(markers[1]))>.035||markers[1].box.y<=markers[0].box.y+.025)continue;
  for(const [i,label]of markers.entries()){
   const role=i?'delivery':'pickup',party=role==='pickup'?'shipper':'consignee';
   if(!key.startsWith(role)&&key!==party)continue;
   const end=Math.min(label.box.y+.11,markers[i+1]?.box.y??1);
   const cells=lines.filter(l=>l!==label&&l.box.y>=label.box.y-.002&&l.box.y<end);
   const name=one(cells.filter(l=>sameRow(label,l)&&l.box.x>right(label)+.015&&isDocumentParty(l.text.trim())));
   if(!name)continue;
   const location=one(cells.filter(l=>Math.abs(l.box.x-name.box.x)<.015&&l.box.y>label.box.y+.005&&address.test(l.text.trim())));
   const date=one(cells.filter(l=>right(l)<=right(label)+.025&&Math.abs(right(l)-right(label))<.03&&dateValue.test(l.text.trim())));
   const time=one(cells.filter(l=>right(l)<=right(label)+.025&&Math.abs(right(l)-right(label))<.03&&window.test(l.text.trim())));
   if(!location||!date||!time||!sameRow(date,location)||time.box.y<=date.box.y||time.box.y-date.box.y>.035)continue;
   const proof=[label,name,location,date,time];if(!proof.every(strong))continue;
   const extra={supportMethod:'native_route_table',extraLabelLines:proof.filter(l=>l!==label)};
   if(key===party)add(name,label,extra);
   if(key===role+'Address')add(location,label,extra);
   if(key===role+'Date')add(date,label,extra);
   if(key===role+'Appointment')add(time,label,extra);
   if(key===role+'City'){
    const m=city.exec(location.text);if(m)matches.push({observation,line:location,start:m.indices[1][0],end:m.indices[1][1],labelLine:label,...extra});
   }
  }
  if(key==='documentDate'){
   // The issue date is a distinct header cell, outside the two stop blocks.
   const dates=lines.filter(l=>l.box.y<.1&&dateValue.test(l.text.trim()));
   const date=one(dates);if(date)add(date,lines.find(l=>hasRateTitle([l])),{supportMethod:'native_rate_header'});
  }
 }
 return matches;
}

export function rateHeaderContinuation(previousPages,page,identity){
 if(identity.kind!=='unknown'||identity.status==='conflicting')return false;
 const all=[...previousPages,page];
 const refs=all.map(p=>rateRouteMatches(p,{rateVocabulary:'loadNumber'}));
 if(refs.some(rows=>!rows.length||rows.some(r=>!strong(r.line)||!strong(r.labelLine))))return false;
 if(new Set(refs.flat().map(r=>r.line.text.slice(r.start,r.end))).size!==1)return false;
 const pageNumbers=all.map(p=>p.observations.flatMap(o=>o.lines.slice(0,12).filter(l=>!l.box||l.box.y<.1).flatMap(l=>{
  const m=/^Page\s+(\d+)(?:\s+of\s+\d+)?$/i.exec(l.text.trim());return m&&strong(l)?[Number(m[1])]:[];
 })));
 if(pageNumbers.some((values,i)=>!values.length||values.some(n=>n!==i+1)))return false;
 if(page.observations.some(o=>hasRateStructure(o.lines)||o.lines.some(l=>pickup.test(l.text)||delivery.test(l.text)||totalLabel.test(l.text))))return false;
 return page.observations.some(o=>hasRateTitle(o.lines)&&o.lines.some(l=>strong(l)&&/\b(?:terms and conditions|billing packet|carrier.*(?:payment|compliance)|transport refrigeration)\b/i.test(l.text)));
}
