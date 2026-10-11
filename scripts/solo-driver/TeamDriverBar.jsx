import React,{useMemo,useState} from 'react';
import '../../team-driver-v110405.css';
import {formTeamDriverSummary} from '../../core/team/formTeamV110448.js';

export default function TeamDriverBar({state,onAddDriver,onRemoveDriver,onSwitchDriver}) {
  const summary=useMemo(()=>formTeamDriverSummary(state),[state]);
  const [open,setOpen]=useState(false),[name,setName]=useState('');
  const active=summary.activeDriver,peers=summary.drivers.filter(driver=>driver.id!==active.id);
  function add(){if(!name.trim())return;onAddDriver?.(name.trim());setName('');}
  return <div className="team-driver-shell">
    <div className="team-driver-bar">
      <button type="button" className="team-driver-current" onClick={()=>setOpen(!open)} aria-expanded={open}>
        <span className="team-driver-avatar">{active.name.slice(0,1).toUpperCase()}</span>
        <span><small>{peers.length?'TEAM DRIVER':'SOLO DRIVER'}</small><b>{active.name}</b></span>
        <em>{peers.length?`${summary.drivers.length} drivers`:'Add co-driver'}</em>
      </button>
      <button type="button" className="team-driver-toggle" onClick={()=>setOpen(!open)} aria-label="Manage co-driver" aria-expanded={open}>{open?'×':'+'}</button>
    </div>
    {open&&<div className="team-driver-panel">
      <strong>{peers.length?'Co-driver':'Driving solo'}</strong>
      <div className="team-driver-list">
        {peers.map(driver=><React.Fragment key={driver.id}>
          <button type="button" onClick={()=>{onSwitchDriver?.(driver.id);setOpen(false);}}>
            <span>{driver.name.slice(0,1).toUpperCase()}</span><b>{driver.name}</b><em>Switch log</em>
          </button>
          <button type="button" className="team-driver-remove" aria-label={`Remove co-driver ${driver.name}`} onClick={()=>onRemoveDriver?.(driver.id)}>Remove co-driver</button>
        </React.Fragment>)}
      </div>
      <div className="team-driver-add">
        <input aria-label="Co-driver name" placeholder="Co-driver name" value={name} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')add();}}/>
        <button type="button" onClick={add} disabled={!name.trim()}>Add co-driver</button>
      </div>
      <p>{peers.length?'Removing a co-driver keeps their saved logs.':'Solo stays selected until you add a co-driver.'}</p>
    </div>}
  </div>;
}
