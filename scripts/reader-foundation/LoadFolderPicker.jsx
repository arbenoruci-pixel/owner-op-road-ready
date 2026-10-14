'use client';
import React,{useEffect,useRef,useState} from 'react';
const text=value=>String(value??'').trim();
const dateLabel=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'';
export default function LoadFolderPicker({candidates=[],value='',onChange,createLoadNo=''}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const dialog=useRef(null),trigger=useRef(null);
 useEffect(()=>{if(!open)return;return()=>trigger.current?.focus?.();},[open]);
 const keyboard=event=>{
  if(event.key==='Escape'){event.preventDefault();setOpen(false);return;}
  if(event.key!=='Tab')return;
  const controls=[...dialog.current.querySelectorAll('button,input')].filter(node=>!node.disabled);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 };
 const chosen=candidates.find(item=>item.loadNo===value);
 const rows=candidates.filter(item=>[item.loadNo,item.company,item.broker,item.carrierName,item.origin,item.destination,item.pickupDate,item.deliveryDate].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const select=loadNo=>{onChange?.(loadNo);setOpen(false);setSearch('');};
 const card=item=><button type="button" key={item.loadNo} disabled={item.referenceOnly} className={'reader-load-option'+(value===item.loadNo?' is-selected':'')} aria-pressed={value===item.loadNo} onClick={()=>select(item.loadNo)}>
  <span className="reader-load-line"><strong>{item.referenceOnly?'Shipment reference ':'Load '}{item.loadNo}</strong><small className={item.status==='completed'?'is-completed':''}>{item.referenceOnly?'Needs a load link':item.active?'Current load':item.status==='completed'?'Completed':'In progress'}</small></span>
  {item.company?<b>{item.company}</b>:null}
  <span>{[item.origin,item.destination].filter(Boolean).join(' → ')||'Route details unavailable'}</span>
  <em>{item.pickupDate?'Pickup '+dateLabel(item.pickupDate):''}{item.pickupDate&&item.deliveryDate?' · ':''}{item.deliveryDate?'Delivery '+dateLabel(item.deliveryDate):''}</em>
 </button>;
 return <div className="reader-load-picker">
  <span className="reader-load-field-label">2 · Load folder</span>
  <button ref={trigger} type="button" className="reader-load-trigger" aria-label="Choose load folder" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
   <span><strong>{value?'Load '+value:'Choose a load'}</strong><em>{chosen?.company||'Current loads first · Search by number, company or route'}</em></span><span aria-hidden="true">⌄</span>
  </button>
  {chosen?<p>{[chosen.origin,chosen.destination].filter(Boolean).join(' → ')}{chosen.status==='completed'?' · Completed':chosen.active?' · Current load':' · In progress'}</p>:null}
  {open?<div className="reader-load-overlay"><section ref={dialog} onKeyDown={keyboard} className="reader-load-dialog" role="dialog" aria-modal="true" aria-label="Choose load folder">
   <header><div><span>DOCUMENT FILING</span><h2>Choose a load</h2><p>Current load first, then newest loads.</p></div><button type="button" aria-label="Close load picker" onClick={()=>setOpen(false)}>Close</button></header>
   <input autoFocus type="search" aria-label="Search loads" placeholder="Load number, company or route" value={search} onChange={event=>setSearch(event.target.value)}/>
   <div className="reader-load-results">
    {rows.some(item=>!item.referenceOnly&&item.status!=='completed')?<><h3>In progress</h3>{rows.filter(item=>!item.referenceOnly&&item.status!=='completed').map(card)}</>:null}
    {rows.some(item=>!item.referenceOnly&&item.status==='completed')?<><h3>Completed loads</h3>{rows.filter(item=>!item.referenceOnly&&item.status==='completed').map(card)}</>:null}
    {rows.some(item=>item.referenceOnly)?<><h3>Unlinked references</h3>{rows.filter(item=>item.referenceOnly).map(card)}</>:null}
    {!rows.length?<p className="reader-load-empty">No loads match this search.</p>:null}
    {createLoadNo&&!candidates.some(item=>item.loadNo===createLoadNo)?<button type="button" className="reader-load-option" onClick={()=>select(createLoadNo)}>Create Load {createLoadNo}</button>:null}
   </div>
   <footer><button type="button" onClick={()=>select('')}>Choose later — save without a load</button></footer>
  </section></div>:null}
 </div>;
}
