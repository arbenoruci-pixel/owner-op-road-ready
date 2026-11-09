'use client';
import React,{useMemo,useState} from 'react';
import {AppIcon} from './PhoneHomeToolsV110435.jsx';
import {moduleEnabled,MODULE_CATALOG} from '../setup/operatorProfile.js';
import AdaptiveHomeV1038 from './AdaptiveHomeV1038.jsx';
import GrossBoard from '../owneros/GrossBoard.jsx';
import {businessLoadRows,operationalCandidateContext,currentOperationalLoad} from '../loads/currentLoadV110473.js';
import {grossMoney,grossValue} from '../owneros/compactGross.js';
import {getActiveLoadGuideV103} from '../loads/loadGuideV103.js';
import {getHomeTerminalTimeZone,homeTerminalDayKey} from '../../core/time/homeTerminalTime.js';
import {useChecklistStoreV110321} from '../loads/useChecklistStoreV110321.js';
import {localDayKey} from '../../shared/utils/date.js';
import {nowMin} from '../../shared/utils/time.js';
import './driverDashboard.css';

function Glyph({name,size=20}) {
 const shapes={
 search:<><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.2 15.2 5.3 5.3"/></>,
 bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
 chevron:<path d="m9 5 7 7-7 7"/>,
 back:<path d="m15 4-8 8 8 8"/>,
 pin:<><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
 maintenance:<><path d="m14 5 5 5M4 20l8-8M13 3a6 6 0 0 0 7 8l-9 9a3 3 0 0 1-4-4l9-9a6 6 0 0 0-3-4Z"/></>,
 active:<><path d="M5 18c-4-9 7-11 7-4 0 6 10 2 8-8"/><circle cx="20" cy="6" r="2"/><circle cx="5" cy="18" r="2"/></>,
 menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.menu}</svg>;
}
const val=v=>String(v??'').trim();
const route=(r,which)=>{
 const named=which==='from'?['origin','pickupLocation','pickupCity']:['destination','deliveryLocation','deliveryCity'];
 const value=named.map(k=>val(r[k])).find(Boolean);
 if(value)return value;
 const city=val(r[which==='from'?'fromCity':'toCity']),state=val(r[which==='from'?'fromState':'toState']);
 return [city,state].filter(Boolean).join(', ')||'Location to review';
};
const dateKey=v=>{const s=val(v);const m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:''};
const dateOf=r=>['actualDeliveryDate','deliveredDate','completedDate','deliveryDay','pickupDate','deliveryDate','date'].map(k=>dateKey(r[k])).find(Boolean)||'';
const monday=d=>{if(!d)return '';const x=new Date(d+'T12:00:00Z');if(!Number.isFinite(x.getTime()))return '';x.setUTCDate(x.getUTCDate()-(x.getUTCDay()+6)%7);return x.toISOString().slice(0,10)};
const addWeek=(d,days)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10)};
const shortDay=d=>{const x=new Date(d+'T12:00:00Z');return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(x)};
function stateLabel(r){
 const s=val(r.operationalStatus||r.status).toLowerCase();
 if(['delivered','completed','complete','closed','archived','completed_per_owner'].includes(s))return ['Completed','done'];
 if(['paid','invoiced','submitted','invoice_ready'].includes(s))return [s==='paid'?'Paid':'Billed','done'];
 if(['in_transit','booked','active','dispatched','at_pickup'].includes(s))return ['Active','active'];
 if(['cancelled','canceled','tonu'].includes(s))return [s==='tonu'?'TONU':'Cancelled','muted'];
 return ['Review','review'];
}
function deriveHistory(store,state,activeNo){
 const raw=businessLoadRows(store,operationalCandidateContext(state,store));
 const found=new Map(), active=val(activeNo).toUpperCase();
 for(const r of raw){
  if(!r||r.deleted||r.isTest||r.testOnly)continue;
  const status=val(r.status).toLowerCase();
  if(status==='test'||status==='void'||status==='voided')continue;
  const number=val(r.canonicalLoadNo||r.loadNo||r.load_no),key=number.toUpperCase();
  if(!key||key===active||found.has(key))continue;
  const [label,tone]=stateLabel(r);
  found.set(key,{key,number,from:route(r,'from'),to:route(r,'to'),date:dateOf(r),amount:grossMoney(grossValue(r)),label,tone,broker:val(r.broker||r.brokerName),id:val(r.id)});
 }
 return [...found.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.number.localeCompare(b.number)).slice(0,60);
}
function LoadHistory({store,state,activeNo,onOpenLoads}){
 const [open,setOpen]=useState(true);
 const timezone=getHomeTerminalTimeZone(state),today=homeTerminalDayKey(new Date(),timezone),thisWeek=monday(today),prior=addWeek(thisWeek,-7);
 const rows=useMemo(()=>deriveHistory(store,state,activeNo),[store,state,activeNo]);
 const groups=useMemo(()=>{
  const map=new Map();
  for(const r of rows){const week=monday(r.date),key=week||'undated';if(!map.has(key))map.set(key,[]);map.get(key).push(r)}
  return [...map.entries()].map(([key,loads])=>({key,loads,title:key==='undated'?'Dates to review':key===thisWeek?'This week':key===prior?'Last week':shortDay(key)+' – '+shortDay(addWeek(key,6))}));
 },[rows,thisWeek,prior]);
 return <section className="rrd-history" aria-label="Recent loads">
  <header><button type="button" className="rrd-history-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><span className="rrd-history-icon"><AppIcon name="loads"/></span><b>Recent Loads</b><small>{rows.length} saved</small><span className={open?'rrd-arrow open':'rrd-arrow'}><Glyph name="chevron" size={17}/></span></button><button type="button" className="rrd-all-link" onClick={onOpenLoads}>View all</button></header>
  {open?<div className="rrd-history-body">{groups.length?groups.map((group,index)=><details key={group.key} className="rrd-week" open={index===0?true:undefined}>
   <summary><span>{group.title}</span><small>{group.loads.length} loads</small><Glyph name="chevron" size={15}/></summary>
   <div>{group.loads.slice(0,8).map(item=><button type="button" className="rrd-history-row" key={item.key} onClick={onOpenLoads} aria-label={'Open load folder '+item.number}>
     <span className={'rrd-status-dot '+item.tone} aria-hidden="true">{item.tone==='done'?'✓':item.tone==='active'?'→':'·'}</span>
     <span className="rrd-history-route"><b>#{item.number}</b><small>{item.from} → {item.to}</small></span>
     <span className="rrd-history-money"><b>{item.amount}</b><small>{item.label}{item.date?' · '+shortDay(item.date):''}</small></span><Glyph name="chevron" size={15}/>
   </button>)}</div>
   {group.loads.length>8?<button type="button" className="rrd-show-all" onClick={onOpenLoads}>See all {group.loads.length} loads</button>:null}
  </details>):<p className="rrd-no-loads">No completed or saved load folders to show yet.</p>}</div>:null}
 </section>;
}
function Shortcuts({actions,operatorProfile}) {
 const shortcuts=[
 ['logbook','Logbook','logbook',actions.onLog],
 ['wallet','Wallet','wallet',actions.onWallet],
 ['scan','Smart Scan','scan',actions.onScan],
 ['loads','Loads','loads',actions.onLoads],
 ['documents','Documents','documents',actions.onDocs],
 ['dot','DOT Mode','dot',actions.onDot],
 ['active','Active Load','active',actions.onActive],
 ['maintenance','Maintenance','maintenance',actions.onMaintenance],
 ];
 return <nav className="rrd-icon-grid" aria-label="Road Ready tools">{shortcuts.filter(([icon])=>['scan','active'].includes(icon)||moduleEnabled(operatorProfile,icon)).map(([icon,name,tone,go])=><button type="button" key={name} onClick={go} disabled={!go} aria-label={icon==='logbook'?'Open logbook':name}><span className={'rrd-app-icon rrd-icon-'+tone}>{['active','maintenance'].includes(icon)?<Glyph name={icon} size={34}/>:<AppIcon name={icon}/>}</span><span>{name}</span></button>)}</nav>;
}
function SecondaryTools({operatorProfile,onSection,onDrive,onOpenBackup}) {
 const [more,setMore]=useState(false);
 const extra=MODULE_CATALOG.filter(m=>['settlements','money','fuel','expenses','performance'].includes(m.id)&&moduleEnabled(operatorProfile,m.id));
 return <><nav className="rrd-secondary-tools" aria-label="Additional tools">
  {moduleEnabled(operatorProfile,'loads')?<button type="button" onClick={()=>onSection('billing')}>Billing</button>:null}
  {moduleEnabled(operatorProfile,'drive')?<button type="button" onClick={onDrive}>Drive</button>:null}
  <button type="button" onClick={()=>onSection('my_month')}>My month</button>
  <button type="button" onClick={()=>onSection('import_documents')}>Import</button>
  <button type="button" onClick={onOpenBackup}>Export &amp; Backup</button>
  {extra.length||moduleEnabled(operatorProfile,'loads')?<button type="button" onClick={()=>setMore(v=>!v)} aria-expanded={more}>More tools</button>:null}
 </nav>{more?<section className="rrd-secondary-tools" aria-label="More tools">{moduleEnabled(operatorProfile,'loads')?<button type="button" onClick={()=>onSection('loads')}>Manage load details</button>:null}{extra.map(m=><button type="button" key={m.id} onClick={()=>onSection(m.id)}>{m.label}</button>)}<button type="button" onClick={()=>setMore(false)} aria-label="Close more tools">Close</button></section>:null}</>;
}
function MissionScreen(props){
 const {activeLoad,summary,state,operatorProfile,logbookEnabled,onBack,onSection,onOpenLog,onOpenLogbook,onOpenStatus,onOpenTrailer,onOpenDot,onOpenWallet,onScan,onGuide,onOpenBackup,onDrive,onOpenShipment,savedScan,onContinueSavedScan,savedScanBusy,savedScanMessage}=props;
 const liveGuide=getActiveLoadGuideV103(state);
 const checklistStore=useChecklistStoreV110321();
 const currentLoad=currentOperationalLoad(state,checklistStore,{day:localDayKey(),minute:nowMin(),selectedGuide:liveGuide});
 return <section className="screen rr-driver-mission rr-business-shell">
  <header className="rrd-mission-header"><button type="button" onClick={onBack} aria-label="Back to Home"><Glyph name="back"/></button><span className="rrd-mission-name"><span className="rrd-mini-active"><Glyph name="active" size={19}/></span><b>Active Load</b></span><button type="button" onClick={()=>onSection('load_documents')} aria-label="Open load folders"><Glyph name="menu"/></button></header>
  {currentLoad?<>
   <AdaptiveHomeV1038 state={state} summary={summary} activeLoad={activeLoad} operatorProfile={operatorProfile} logbookEnabled={logbookEnabled}
    savedScan={savedScan} savedScanBusy={savedScanBusy} savedScanMessage={savedScanMessage} onContinueSavedScan={onContinueSavedScan}
    onOpenStatus={onOpenStatus} onOpenTrailer={onOpenTrailer} onOpenDay={onOpenLog} onOpenLogbook={onOpenLogbook}
    onOpenShipment={onOpenShipment} onOpenDot={onOpenDot} onOpenWallet={onOpenWallet}
    onOpenScan={onScan} onOpenGuide={onGuide} onOpenBackup={onOpenBackup} onOpenDrive={onDrive} onOpenSection={onSection}/>
   <section className="rrd-mission-doc-actions"><h2>Load paperwork</h2><p>Keep the original Rate Con, pickup BOL, signed POD and receipts linked to the load. Missing documents stay marked for review.</p><div><button type="button" onClick={()=>onScan('auto')}>Scan / add document</button>{currentLoad.guide?<button type="button" onClick={()=>onSection('load_documents')}>Open load folder</button>:null}</div></section>
  </>:<section className="rrd-mission-empty"><Glyph name="active" size={40}/><h1>No active load</h1><p>Add a rate confirmation or select the correct load from your saved folders. Road Ready will show the next recorded step here.</p><button type="button" onClick={()=>onScan('auto')}>Scan Rate Confirmation</button><button type="button" onClick={()=>onSection('load_documents')}>Choose saved load</button></section>}
 </section>;
}
export default function DriverDashboard(props){
 const {state,summary,operatorProfile,businessStore,business,activeLoad,unsigned,logbookEnabled,onStatus,onTrailer,onLog,onOpenLogbook,onOpenShipment,onDot,onWallet,onScan,onGuide,onOpenBackup,onDrive,onSection,onSettings,onContinueSavedScan,savedScan,savedScanBusy,savedScanMessage}=props;
 const [missionOpen,setMissionOpen]=useState(false),[alertsOpen,setAlertsOpen]=useState(false);
 const goSection=section=>onSection?.(section);
 const notifications=[];
 if(unsigned>0)notifications.push({text:unsigned+' log day(s) need signing',go:()=>props.onOpenUnsigned?.()});
 if(Number(business?.readyToInvoice||0)>0)notifications.push({text:business.readyToInvoice+' load(s) ready for invoice',go:()=>goSection('loads')});
 if(Number(business?.missingFuelReceipts||0)>0)notifications.push({text:business.missingFuelReceipts+' fuel receipt(s) to review',go:()=>goSection('fuel')});
 if(missionOpen)return <MissionScreen {...props} onBack={()=>setMissionOpen(false)} onOpenLog={onLog} onOpenStatus={onStatus} onOpenTrailer={onTrailer}/>;
 return <section className="screen rr-driver-home rr-business-shell">
  <header className="rrd-header">
   <span className="rrd-brand-icon"><AppIcon name="loads"/></span>
   <span className="rrd-brand-copy"><b>Road Ready</b><small>{operatorProfile?.companyName||operatorProfile?.carrierName||'Your workspace'}</small></span>
   <button type="button" aria-label="Find a load" onClick={()=>goSection('load_documents')}><Glyph name="search"/></button>
   <button type="button" aria-label="Notifications" aria-expanded={alertsOpen} onClick={()=>setAlertsOpen(v=>!v)}><Glyph name="bell"/>{notifications.length?<i className="rrd-alert-dot" aria-hidden="true"/>:null}</button>
   <button type="button" aria-label="Settings" onClick={onSettings}><AppIcon name="settings"/></button>
  </header>
  {alertsOpen?<aside className="rrd-alerts"><b>Needs attention</b>{notifications.length?notifications.map((n,i)=><button type="button" key={i} onClick={()=>{setAlertsOpen(false);n.go()}}>{n.text}<Glyph name="chevron" size={15}/></button>):<p>No outstanding reminders in this overview.</p>}</aside>:null}
  <div className="rrd-duty">
   <button type="button" onClick={onStatus}><b className={'rrd-duty-badge rrd-duty-'+summary.status}>{summary.status==='D'?'DRV':summary.status}</b><span>{summary.label}</span><Glyph name="chevron" size={14}/></button>
   <span className="rrd-duty-location"><Glyph name="pin" size={17}/>{summary.location}</span>
   <button type="button" onClick={onTrailer} aria-label={'Equipment '+summary.vehicle}><AppIcon name="loads"/><span>{summary.vehicle}</span></button>
  </div>
  {savedScan?<aside className="rrd-saved-scan"><b>Continue your load</b><p>Your original document is saved.</p><button type="button" disabled={savedScanBusy} onClick={()=>onContinueSavedScan?.(savedScan)}>{savedScanBusy?'Opening saved original…':'Continue saved scan'}</button>{savedScanMessage?<p role="alert">{savedScanMessage}</p>:null}</aside>:null}
  <GrossBoard store={businessStore} state={state} onOpen={()=>goSection('overview')}/>
  <Shortcuts operatorProfile={operatorProfile} actions={{onLog:onOpenLogbook||onLog,onWallet,onScan:()=>onScan('auto'),onLoads:()=>goSection('load_documents'),onDocs:()=>goSection('documents'),onDot,onActive:()=>setMissionOpen(true),onMaintenance:()=>goSection('maintenance')}}/>
  <SecondaryTools operatorProfile={operatorProfile} onSection={goSection} onDrive={onDrive} onOpenBackup={onOpenBackup}/>
  <LoadHistory store={businessStore} state={state} activeNo={activeLoad?.loadNo||getActiveLoadGuideV103(state)?.loadNo} onOpenLoads={()=>goSection('load_documents')}/>
  <footer className="rrd-version">Road Ready · v110.4.116</footer>
 </section>;
}

