import React, {useState} from 'react';
import { timeLabel } from '../../shared/utils/time.js';
import { shiftLabel } from '../../core/timeline/bulkShiftV110409.js';
import bulkMoveStyles from './bulkMoveStylesV110409.js';

export default function BulkMovePanel({events, selectedIds, delta, onDelta, result, onAll, onClear, onCancel, onApply}) {
  const [expanded,setExpanded] = useState(false);
  const amount = Math.abs(delta), sign = delta < 0 ? -1 : 1;
  const after = new Map((result.events || []).map(event => [event.id,event]));
  const changed = new Set([...(result.changedEventIds || []),...(result.adjustedNeighborIds || [])]);
  const rows = events.filter(event => selectedIds.includes(event.id) || changed.has(event.id));
  const available = result.appliedDeltaMin || 0;
  const limited = !!delta && available !== delta;
  return <section className="bulk-move-panel-v9660 bulk-move-v110409" aria-label="Move selected events">
    <style>{bulkMoveStyles}</style>
    <header><b>{selectedIds.length} selected</b><button type="button" onClick={()=>{if(expanded){onDelta(0);setExpanded(false);}else onAll();}}>{expanded?'Choose events':'All day'}</button><button type="button" onClick={onClear}>Clear</button></header>
    <p>{expanded?'Preview the time change, then Apply once.':'Select rows below, then tap Move selected.'}</p>
    {!expanded ? <div className="bulk-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={!selectedIds.length} onClick={()=>setExpanded(true)}>Move selected</button></div> : <>
    <div className="bulk-direction" role="group" aria-label="Move direction">
      <button type="button" aria-pressed={delta<0} onClick={()=>onDelta(-Math.max(1,amount))}>← Earlier</button>
      <button type="button" aria-pressed={delta>0} onClick={()=>onDelta(Math.max(1,amount))}>Later →</button>
    </div>
    <div className="bulk-amount"><label>Hours<input aria-label="Move hours" type="number" inputMode="numeric" min="0" max="23" value={Math.floor(amount/60)} onChange={e=>onDelta(sign*(Math.min(23,Math.max(0,Math.trunc(Number(e.target.value)||0)))*60+amount%60))}/></label>
      <label>Minutes<input aria-label="Move minutes" type="number" inputMode="numeric" min="0" max="59" value={amount%60} onChange={e=>onDelta(sign*(Math.floor(amount/60)*60+Math.min(59,Math.max(0,Math.trunc(Number(e.target.value)||0)))))}/></label></div>
    <div className="bulk-shortcuts" role="group" aria-label="Adjust preview">
      {[-60,-15,-5,5,15,60].map(step=><button type="button" key={step} onClick={()=>onDelta(Math.max(-1439,Math.min(1439,delta+step)))} aria-label={`Preview ${Math.abs(step)} minutes ${step<0?'earlier':'later'}`}>{step>0?'+':'−'}{Math.abs(step)===60?'1h':`${Math.abs(step)}m`}</button>)}
    </div>
    <strong className="bulk-preview-total" role="status">{available ? shiftLabel(available) : 'No time change'}</strong>
    {limited && available ? <p className="bulk-limit">Requested {shiftLabel(delta)}. Maximum available: {shiftLabel(available)}.</p> : null}
    {result.blockedReason && selectedIds.length && delta ? <p className="bulk-limit" role="alert">{result.blockedReason}</p> : null}
    {(result.warnings || []).filter(warning=>warning.code!=='clamped').map((warning,index)=><p className="bulk-limit" key={index}>{warning.text || warning}</p>)}
    {available ? <>
      {result.mode==='duty_changes' ? <p>All day: midnight stays fixed; duty change times move.</p> : null}
      <div className="bulk-preview-rows">{rows.map(event=>{const next=after.get(event.id)||event;return <div key={event.id} data-shift-preview-id={event.id}><b>{event.status}{!selectedIds.includes(event.id)?' · Neighbor':''}</b><span>{timeLabel(event.startMin)} – {timeLabel(event.endMin)}<br/>→ {timeLabel(next.startMin)} – {timeLabel(next.endMin)}</span></div>;})}</div>
      {result.adjustedNeighborIds?.length ? <p>Neighbor boundaries shown above adjust with the selection.</p> : null}
    </> : null}
    <div className="bulk-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" disabled={!delta} onClick={()=>onDelta(0)}>Reset</button><button type="button" className="primary" disabled={!available || !!result.blockedReason} onClick={()=>onApply(available)}>Apply {available ? shiftLabel(available) : 'move'}</button></div>
    </>}
  </section>;
}
