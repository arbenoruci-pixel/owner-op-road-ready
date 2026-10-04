import React,{useState} from 'react';
import {moduleEnabled,MODULE_CATALOG} from '../setup/operatorProfile.js';

export function AppIcon({name}) {
  const paths={
    scan:<><path d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3M7 12h10"/></>,
    documents:<><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/><path d="M3 10h18"/></>,
    loads:<><path d="M2 6h12v11H2zm12 4h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    logbook:<><path d="M4 4h6a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4Zm16 0h-4a3 3 0 0 0-3 3m7-3v14h-4a3 3 0 0 0-3 3M7 8h3M7 12h3m6-4h2m-2 4h2"/></>,
    dot:<><path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6Z"/><path d="m8 12 3 3 5-6"/></>,
    wallet:<><path d="M4 7V5h15v15H4V7h15m-3 5h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    billing:<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6m-6 4h6m-6 4h3"/></>,
    import:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    backup:<><path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.documents}</svg>;
}

export function PhoneHomeTools({operatorProfile,onScan,onSection,onLog,onDot,onWallet,onBackup,onDrive}) {
  const [more,setMore]=useState(false);
  const enabled=id=>moduleEnabled(operatorProfile,id);
  const extra=MODULE_CATALOG.filter(m=>['settlements','money','fuel','maintenance','expenses','performance'].includes(m.id)&&enabled(m.id));
  const items=[
    ['scan','Smart Scan',()=>onScan?.('auto')],
    ...(enabled('documents')?[['documents','Documents',()=>onSection('documents')]]:[]),
    ...(enabled('loads')?[['loads','Loads',()=>onSection('loads')]]:[]),
    ...(enabled('logbook')?[['logbook','Logbook',onLog]]:[]),
    ...(enabled('dot')?[['dot','DOT Mode',onDot]]:[]),
    ...(enabled('wallet')?[['wallet','Wallet',onWallet]]:[]),
    ...(enabled('loads')?[['billing','Billing',()=>onSection('billing')]]:[]),
    ...(enabled('drive')?[['loads','Drive',onDrive]]:[]),
    ...(extra.length?[['settings','More tools',()=>setMore(v=>!v)]]:[]),
    ['import','Import',()=>onSection('import_documents')],
    ['backup','Export & Backup',onBackup],
  ];
  return <><nav className="phone-app-grid" aria-label="Apps">{items.map(([name,title,onClick])=><button type="button" key={title} onClick={onClick} aria-label={name==='logbook'?'Open logbook':title}><span className={'phone-app-icon icon-'+name}><AppIcon name={name}/></span><span className="phone-app-label">{title}</span></button>)}</nav>{more?<section className="phone-more-tools" aria-label="More tools"><header><h2>More tools</h2><button type="button" onClick={()=>setMore(false)} aria-label="Close more tools">×</button></header>{extra.map(m=><button type="button" key={m.id} onClick={()=>onSection(m.id)}>{m.label}<span aria-hidden="true">›</span></button>)}</section>:null}</>;
}

export function DeviceHistoryNote({state}) {
  const books=[state,...Object.values(state.teamLogbooksByDriverId||{})];
  if(books.some(book=>Object.values(book.eventsByDay||{}).some(rows=>Array.isArray(rows)&&rows.length)))return null;
  return <aside className="phone-device-note"><strong>No saved logbook on this device</strong><p>Use Import for documents and saved logbook copies. Use Export & Backup to restore your driver and active logbook from a device backup.</p></aside>;
}
