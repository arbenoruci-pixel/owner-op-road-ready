'use client';
import React,{useEffect,useState} from 'react';
import {libraryHistory} from './libraryStorageV110434.js';
import {listVaultDocumentsV102} from './documentVaultV102.js';
import {openSource} from './documentActionsV110415.js';
import './libraryV110434.css';
const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export default function LibraryHistory({loadNo=''}){
 const [archives,setArchives]=useState([]),[docs,setDocs]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;async function refresh(){try{const [a,d]=await Promise.all([libraryHistory(),listVaultDocumentsV102()]);if(alive){setArchives(a);setDocs(d);}}catch(e){if(alive)setError(e.message);}}refresh();window.addEventListener('road-ready-library-imported',refresh);return()=>{alive=false;window.removeEventListener('road-ready-library-imported',refresh);};},[]);
 async function open(id){setError('');try{const d=docs.find(d=>d.client_document_id===id);if(!d)throw Error('Original is unavailable on this device.');await openSource(d);}catch(e){setError(e.message);}}
 const links=loadNo?archives.flatMap(a=>(a.logbookLinks||[]).filter(l=>l.loadNo===loadNo).map(l=>({...l,log:(a.logbook||[]).find(d=>d.day===l.day&&d.driverId===l.driverId)}))).filter(l=>l.log):archives.flatMap(a=>(a.logbook||[]).map(log=>({day:log.day,driverId:log.driverId,basis:'archive_copy',log})));
 const unique=[...new Map(links.map(l=>[l.driverId+'|'+l.day,l])).values()].sort((a,b)=>b.day.localeCompare(a.day)||a.log.driverName.localeCompare(b.log.driverName));
 const cases=[...new Map(archives.flatMap(a=>a.cases||[]).filter(c=>!loadNo||c.loadNo===loadNo).map(c=>[c.id,c])).values()];
 if(!cases.length&&!unique.length&&!error)return null;
 return <section className="rr-library-history" aria-label={loadNo?'Linked logbooks and inspections':'Saved logbooks and DOT'}>
  {unique.length?<details className="rr-library-panel"><summary>{loadNo?'Logbook':'Logbooks'} · {unique.length} saved driver days</summary><p className="rr-library-note">Source copies keep each driver separate. Dates marked “Check link” need confirmation against the recorded work.</p><div className="rr-library-days">{unique.map(l=><button type="button" key={l.driverId+l.day} onClick={()=>setSelected(l)}><strong>{l.day} · {l.log.driverName}</strong><span>{l.basis==='archive_copy'?'Saved source':l.basis==='exact_reference'?'Load reference found':'Check link · source date'} ›</span></button>)}</div></details>:null}
  {selected?<section className="rr-library-panel" aria-label="Saved logbook source"><div className="rr-library-heading"><h3>{selected.day}</h3><button type="button" onClick={()=>setSelected(null)}>Close</button></div><p>{selected.log.driverName} · saved source copy</p><p>{selected.log.certifyStatus||'Certification details unavailable'}</p><table><thead><tr><th>Duty</th><th>Time</th><th>Location / note</th></tr></thead><tbody>{selected.log.events.map((e,i)=><tr key={i}><td>{e.status}</td><td>{time(e.startMin)}–{time(e.endMin)}</td><td>{e.location}<br/>{e.note}</td></tr>)}</tbody></table></section>:null}
  {cases.map(c=><details className="rr-library-panel" key={c.id}><summary>{c.title}</summary><p>{c.date} · {c.equipment}</p><p>{c.note}</p>{(c.issues||[]).map((s,i)=><p key={i} className="rr-library-note">{s}</p>)}<div className="rr-library-days">{c.documentIds.map(id=><button type="button" key={id} onClick={()=>open(id)}>{docs.find(d=>d.client_document_id===id)?.original_file_name||'Open original'} ›</button>)}</div></details>)}
  {error?<p role="alert" className="rr-library-error">{error}</p>:null}
 </section>;
}
