import {combineLogText} from '../../shared/utils/logText.js';
const text=value=>String(value??'').trim();
const unique=values=>[...new Set(values.filter(Boolean))];
// A read-only summary: never combine references from different source activities.
export function onDutySummary(events) {
 const parts=events.flatMap(event=>[
  ...(Array.isArray(event.reasons)?event.reasons:[]),event.note,event.transitionSummary
 ].filter(Boolean).flatMap(value=>text(value).split(/\s*[·•|]\s*|\n/)).filter(part=>!/^on duty$/i.test(part)));
 const dropHook=parts.some(part=>/^drop\s*(?:&|and)\s*hook$/i.test(part));
 const note=combineLogText(...parts.filter(part=>!(dropHook&&/^(?:drop off|drop load\s*\/\s*trailer|hook\s*\/\s*pickup trailer|hook trailer|pickup trailer)$/i.test(part))));
 const locations=unique(events.map(e=>[e.city,e.state].map(text).filter(Boolean).join(', ')));
 const routes=unique(events.map(e=>{
  const load=text(e.loadNo),docs=text(e.shippingDocs),bol=text(e.bol),po=text(e.po);
  const trailer=text(e.hookedTrailer||e.trailer);
  const destination=text(e.destination||[e.destinationCity,e.destinationState].filter(Boolean).join(', '));
  return [load&&`Load ${load}`,bol&&`BOL ${bol}`,docs&&docs!==load&&`Shipping docs ${docs}`,po&&`PO ${po}`,trailer&&`Trailer ${trailer}`,destination&&`Going to ${destination}`].filter(Boolean).join(' · ');
 }));
 return {note,locations,routes};
}
