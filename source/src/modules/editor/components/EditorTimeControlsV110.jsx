import React from 'react';
import { editorMinute, editorTimeInput } from '../../logbook/public-api.js';
export default function EditorTimeControls({start,end,onStartChange,onEndChange,quickRow=null,live=false,timeZone=''}) {
  const bump=(edge,d)=>{
    const value=editorMinute(edge==='start'?start:end);
    if (!Number.isFinite(value)) return;
    (edge==='start'?onStartChange:onEndChange)(editorTimeInput(Math.max(0,Math.min(edge==='start'?1439:1440,value+d))));
  };
  return <section className="form-section time-groups-v110">
    {timeZone && <div className="editor-timezone-v110">Home terminal · {timeZone}</div>}
    {quickRow}
    <div className="time-columns-v110">
      {['start','end'].map(edge=><div className="time-group-v110" key={edge}>
        <label><span>{edge==='start'?'Start':'End'}</span>
          {live && edge==='end'?<output className="live-now-v110" aria-label="End time">Now <small>{end}</small></output>:<input aria-label={`${edge==='start'?'Start':'End'} time`} type="time" step="60" value={(edge==='start'?start:end)==='24:00'?'00:00':(edge==='start'?start:end)} disabled={live || (edge==='end'&&end==='24:00')} onChange={e=>(edge==='start'?onStartChange:onEndChange)(e.target.value)} />}
        </label>
        {!live && <div className="time-nudges-v110"><button type="button" aria-label={`Subtract one minute from ${edge}`} onClick={()=>bump(edge,-1)}>−1m</button><button type="button" aria-label={`Add one minute to ${edge}`} onClick={()=>bump(edge,1)}>+1m</button></div>}
      </div>)}
    </div>
    {!live && <label className="midnight-end-v110"><input type="checkbox" checked={end==='24:00'} onChange={e=>onEndChange(e.target.checked?'24:00':'23:59')} />End at next-day midnight (24:00)</label>}
    {live && <p className="editor-help-v110">Timing continues while you edit details. Change status when this activity ends.</p>}
  </section>;
}
