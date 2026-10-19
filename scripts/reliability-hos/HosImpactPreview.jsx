import React from 'react';
import {previewHosImpact,labelMinutes} from '../../core/hos/reliability/rules.js';

const FIELD_LABELS={status:'Status',startMin:'Start',endMin:'End',city:'City',state:'State',description:'Description',note:'Remarks',reasons:'On-duty activities',shippingDocs:'Shipping document',loadNo:'Load',bol:'BOL',destination:'Destination',destinationState:'Destination state',lat:'Latitude',lng:'Longitude',gpsAccuracy:'GPS accuracy',locationSource:'Location source',manualMiles:'Manual miles'};
const time=value=>value===1440?'24:00':`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const display=(key,value)=>value==null||value===''?'—':key.endsWith('Min')?time(value):Array.isArray(value)?value.join(', '):String(value);
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);

export default function HosImpactPreview({before,after,day,at}) {
  const impact=React.useMemo(()=>previewHosImpact(before,after,day,at),[before,after,day,at]);
  const original=before.eventsByDay?.[day]||[],proposed=after.eventsByDay?.[day]||[];
  const a=new Map(original.map(row=>[row.id,row])),b=new Map(proposed.map(row=>[row.id,row]));
  const ids=[...new Set([...a.keys(),...b.keys()])].filter(id=>!same(a.get(id),b.get(id)));
  if(!ids.length)return null;
  return <section className="hos-edit-preview" aria-label={`Review changes to ${day}`}>
    <h3>Review changes · {day}</h3>
    <p>Recorded log zone: <b>{impact.timeZone}</b>. This preview includes any neighboring events changed by the selected interval.</p>
    {ids.map(id=>{const prior=a.get(id),next=b.get(id);return <div className="hos-event-diff" key={id}>
      <strong>{!prior?'Added event':!next?'Removed event':`${display('status',prior.status)} ${display('startMin',prior.startMin)}–${display('endMin',prior.endMin)}`}</strong>
      <div className="hos-review-table"><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>
        {Object.entries(FIELD_LABELS).filter(([key])=>!same(prior?.[key],next?.[key])).map(([key,label])=><tr key={key}><th>{label}</th><td>{display(key,prior?.[key])}</td><td>{display(key,next?.[key])}</td></tr>)}
      </tbody></table></div>
    </div>;})}
    <h4>Hours at the end of this day, or now if still open</h4>
    <div className="hos-review-table"><table><thead><tr><th>Remaining</th><th>Before</th><th>After</th></tr></thead><tbody>
      {impact.clocks.map(clock=><tr key={clock.key}><th>{{drive:'11h drive',shift:'14h window',break:'Break',cycle:'Cycle'}[clock.key]}</th><td>{labelMinutes(clock.before)}</td><td>{labelMinutes(clock.after)}{clock.delta?` (${clock.delta>0?'+':'−'}${labelMinutes(Math.abs(clock.delta))})`:''}</td></tr>)}
    </tbody></table></div>
    {impact.requiresReview?<p className="hos-preview-review"><b>Estimate requires review.</b> Missing history, ambiguous times, or an unconfirmed cycle profile can affect these values. Review the HOS details before relying on them.</p>:null}
    {impact.after.split?.pending?<p className="hos-preview-review">After this edit, split hours are conditional: {impact.after.split.summary}.</p>:null}
    <p>Confirmed rule ranges: {impact.before.violationRanges.filter(r=>r.severity==='high').length} before → {impact.after.violationRanges.filter(r=>r.severity==='high').length} after. Changing a log does not erase its earlier edit or certification history.</p>
  </section>;
}
