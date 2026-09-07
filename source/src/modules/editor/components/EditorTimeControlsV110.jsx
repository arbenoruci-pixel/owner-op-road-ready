// COMPACT_TIME_PRESETS_V111
// FAST_EDITOR_TIME_V11027: two direct time cards, optional fine tuning below.
import React from 'react';
import { editorMinute, editorTimeInput } from '../../logbook/public-api.js';

export default function EditorTimeControls({start,end,onStartChange,onEndChange,quickRow=null,live=false,timeZone=''}) {
  const bump=(edge,d)=>{
    const value=editorMinute(edge==='start'?start:end);
    if (!Number.isFinite(value)) return;
    (edge==='start'?onStartChange:onEndChange)(editorTimeInput(Math.max(0,Math.min(edge==='start'?1439:1440,value+d))));
  };
  return <section className="form-section time-groups-v110 modern-time-section-v11027" title={timeZone?`Home terminal time · ${timeZone}`:'Home terminal time'}>
    <div className="modern-time-strip-v11027">
      <label className="modern-time-cell-v11027 start"><span>Start Time</span>
        <input aria-label="Start time" type="time" step="60" value={start==='24:00'?'00:00':start} disabled={live} onChange={e=>onStartChange(e.target.value)} />
      </label>
      <label className="modern-time-cell-v11027 end"><span>End Time</span>
        {live?<output className="live-now-v110" aria-label="End time"><strong>Now</strong><small>{end}</small></output>:<input aria-label="End time" type="time" step="60" value={end==='24:00'?'00:00':end} disabled={end==='24:00'} onChange={e=>onEndChange(e.target.value)} />}
      </label>
    </div>
    {quickRow && <div className="modern-quick-time-v11027">{quickRow}</div>}
    {!live && <details className="modern-fine-time-v11027"><summary>Fine tune</summary><div className="modern-fine-time-grid-v11027">
      <button type="button" aria-label="Subtract one minute from start" onClick={()=>bump('start',-1)}>Start −1m</button><button type="button" aria-label="Add one minute to start" onClick={()=>bump('start',1)}>Start +1m</button>
      <button type="button" aria-label="Subtract one minute from end" onClick={()=>bump('end',-1)}>End −1m</button><button type="button" aria-label="Add one minute to end" onClick={()=>bump('end',1)}>End +1m</button>
      <label className="midnight-end-v110"><input type="checkbox" checked={end==='24:00'} onChange={e=>onEndChange(e.target.checked?'24:00':'23:59')} />End at 24:00</label>
    </div></details>}
  </section>;
}
