import {hasCarrierTender} from './rateVocabulary.js';
const clean=s=>s.trim().replace(/\s+/g,' ');
const safe=l=>l?.box&&l.confidence>=.8;
const heading=/^\s*Stop\s+(\d+)\s*[-–:]\s*(Pickup|Drop|Delivery)\s+Date:\s*(.+?)\s*$/id;
const dates=/\d{1,2}\/\d{1,2}\/\d{4}/g;
const span=line=>({line,start:line.text.search(/\S/),end:line.text.trimEnd().length});
// Positioned native cells only. Unclear or multiple stop roles remain reviewable.
export function carrierTenderMatches(page,spec){
 const key=spec.rateVocabulary;if(!key)return [];
 const out=[];
 for(const observation of page.observations){
  const lines=observation.lines;if(observation.source!=='pdf-text-layer'||!hasCarrierTender(lines))continue;
  const emit=(cells,label,joinedValue,part={})=>{if(!cells.length||![...cells,label].every(safe))return;out.push({...span(cells[0]),observation,labelLine:label,extraLabelLines:cells.slice(1),continuations:cells.slice(1).map(span),supportMethod:'native_carrier_tender',...(joinedValue?{joinedValue}:{}),...part});};
  const labels={loadNumber:/^\s*Load\s*#:\s*$/i,totalRate:/^\s*Total:\s*$/i,carrier:/^\s*Carrier Name:\s*$/i,documentDate:/^\s*Date:\s*$/i};
  if(labels[key])for(const label of lines.filter(l=>labels[key].test(l.text))){const matches=lines.filter(l=>safe(l)&&safe(label)&&l!==label&&l.box.x>label.box.x+label.box.width&&l.box.x-(label.box.x+label.box.width)<.08&&Math.abs(l.box.y-label.box.y)<.006);if(matches.length===1){const v=matches[0];if(key==='documentDate'){const m=v.text.match(dates);if(m?.length===1)emit([v],label,null,{start:v.text.indexOf(m[0]),end:v.text.indexOf(m[0])+m[0].length});}else emit([v],label);}}
  const marks=lines.map((l,i)=>({l,i,m:heading.exec(l.text)})).filter(x=>x.m);
  for(const role of ['pickup','delivery']){
   const chosen=marks.filter(x=>(x.m[2].toLowerCase()==='pickup'?'pickup':'delivery')===role);if(chosen.length!==1)continue;
   const {l:label,i,m}=chosen[0],end=marks.find(x=>x.i>i)?.i??lines.length;
   const block=lines.slice(i+1,end),cityIndex=block.findIndex(l=>/^[A-Z][A-Z .'-]*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i.test(l.text));
   if(cityIndex<1||cityIndex>6)continue;
   const cells=block.slice(0,cityIndex+1);if(!safe(label)||!cells.every(l=>safe(l)&&Math.abs(l.box.x-label.box.x)<.025)||cells.some((l,j)=>j&&l.box.y-cells[j-1].box.y>.04))continue;
   const street=cells.findIndex(l=>/^\s*\d+[A-Z]?(?:[-/]\d+)?\s+\S/.test(l.text));if(street<1)continue;
   const party=cells.slice(0,street),address=cells.slice(street),city=cells.at(-1);
   if(key===(role==='pickup'?'shipper':'consignee'))emit(party,label,party.map(l=>clean(l.text)).join(' '));
   if(key===role+'Address')emit(address,label,address.map(l=>clean(l.text)).join(' ').replace(/- (\d)/g,'-$1'));
   if(key===role+'City')emit([city],label,clean(city.text).replace(/\s+\d{5}(?:-\d{4})?$/,''));
   if(key===role+'Appointment'){const [start,end]=m.indices[3];emit([label],label,null,{start,end});}
   if(key===role+'Date'){const values=[...new Set(m[3].match(dates)||[])];if(values.length===1){const start=label.text.indexOf(values[0]);emit([label],label,null,{start,end:start+values[0].length});}}
  }
 }
 return out;
}
