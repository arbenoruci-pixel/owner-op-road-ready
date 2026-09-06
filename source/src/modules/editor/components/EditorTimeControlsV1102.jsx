import React from 'react';
import { editorInput, editorMinute } from '../../../shared/utils/logbookEditorTimeV1102.js';
import { timeLabel } from '../../../shared/utils/time.js';
export default function EditorTimeControls({start,end,onStartChange,onEndChange,quickRow=null,live=false}) {
  function bump(edge,delta){const n=editorMinute(edge==='start'?start:end,edge);if(!Number.isFinite(n))return;const value=editorInput(Math.max(edge==='start'?0:1,Math.min(edge==='start'?1439:1440,n+delta)));(edge==='start'?onStartChange:onEndChange)(value);}
  return <section className="form-section time-controls-v1102" aria-label="Event time controls">
    {quickRow}<div className="time-groups-v1102">{['start','end'].map(edge=><fieldset key={edge}><legend>{edge==='start'?'Start':'End'}</legend>
      {live&&edge==='end'?<output aria-label="End time">Now · {timeLabel(editorMinute(end),true)}</output>:<input aria-label={edge==='start'?'Start time':'End time'} type="time" step="60" value={edge==='start'?start:end} disabled={live} onChange={e=>(edge==='start'?onStartChange:onEndChange)(e.target.value)}/>}
      {!live&&<div className="time-nudges-v1102"><button type="button" aria-label={`${edge} five minutes earlier`} onClick={()=>bump(edge,-5)}>−5 min</button><button type="button" aria-label={`${edge} five minutes later`} onClick={()=>bump(edge,5)}>+5 min</button></div>}
      {edge==='end'&&!live&&end==='00:00'&&<small>Midnight at end of day</small>}
    </fieldset>)}</div>
  </section>;
}
