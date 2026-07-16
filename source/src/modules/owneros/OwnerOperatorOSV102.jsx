import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BUSINESS_STORE_EVENT,
  addBusinessRecord,
  businessSummary,
  readBusinessStore,
  updateBusinessRecord,
} from '../business/businessStore.js';
import {
  OWNER_OPS_STORE_EVENT_V102,
  appendOwnerOpsRowsV102,
  billingReadinessV102,
  downloadTextV102,
  iftaSummaryV102,
  importFuelCsvV102,
  importMileageCsvV102,
  importTollCsvV102,
  normalizeOwnerOpsStoreV102,
  ownerOpsActionCenterV102,
  ownerOpsCsvV102,
  quarterKeyV102,
  readOwnerOpsStoreV102,
  updateOwnerOpsProfileV102,
  writeOwnerOpsStoreV102,
} from './ownerOpsStoreV102.js';
import {
  downloadVaultDocumentV102,
  listVaultDocumentsV102,
  openVaultDocumentV102,
  searchVaultDocumentsV102,
  vaultDocumentLabelV102,
  vaultDocumentLoadNoV102,
  vaultDocumentTypeV102,
  vaultManifestV102,
} from './documentVaultV102.js';
import { buildAuditPacketPdfV102, buildBillingPacketPdfV102, buildInvoicePdfV102 } from './ownerOpsPdfV102.js';

const TABS_V102 = [
  ['overview','Overview'], ['documents','Documents'], ['billing','Billing'], ['ifta','IFTA'],
  ['tolls','Tolls'], ['audit','Audit'], ['connections','Connections'],
];

function text(value = '') { return String(value ?? '').replace(/\s+/g,' ').trim(); }
function number(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,]/g,''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value = 0) { return number(value).toLocaleString(undefined, { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 }); }
function dateLabel(value = '') {
  const date = new Date(`${String(value || '').slice(0,10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}
function activeLoadNo(state = {}) { return text(state.loadInfo?.loadNo || state.loadInfo?.orderNo || state.loadInfo?.shippingDocs).toUpperCase(); }
function downloadJson(value, name) { return downloadTextV102(JSON.stringify(value,null,2), name, 'application/json'); }
function fileSafe(value = '') { return text(value).replace(/[^a-zA-Z0-9._-]+/g,'-') || 'road-ready'; }
function currentQuarterOptions() {
  const now = new Date();
  const options = [];
  for (let offset=0; offset<8; offset+=1) {
    const date = new Date(now.getFullYear(), now.getMonth()-(offset*3), 1);
    const key = quarterKeyV102(date);
    if (!options.includes(key)) options.push(key);
  }
  return options;
}

function Metric({ label, value, detail }) {
  return <div className="owner-os-metric-v102"><span>{label}</span><b>{value}</b>{detail?<em>{detail}</em>:null}</div>;
}

function Empty({ title, detail, action, actionLabel }) {
  return <div className="owner-os-empty-v102"><i>+</i><b>{title}</b><p>{detail}</p>{action?<button type="button" onClick={action}>{actionLabel}</button>:null}</div>;
}

function StatusPill({ value = '' }) {
  const key = text(value).toLowerCase().replace(/\s+/g,'_');
  return <span className={`owner-os-status-v102 ${key}`}>{text(value) || 'Open'}</span>;
}

function SectionHead({ eyebrow, title, action, actionLabel }) {
  return <div className="owner-os-section-head-v102"><div><span>{eyebrow}</span><b>{title}</b></div>{action?<button type="button" onClick={action}>{actionLabel}</button>:null}</div>;
}

export default function OwnerOperatorOSV102({ state = {}, section = 'overview', onBack, onScan, onOpenLog }) {
  const initialTab = TABS_V102.some(([id])=>id===section) ? section : 'overview';
  const [tab, setTab] = useState(initialTab);
  const [businessStore, setBusinessStore] = useState(()=>readBusinessStore());
  const [ownerStore, setOwnerStore] = useState(()=>readOwnerOpsStoreV102());
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [query, setQuery] = useState('');
  const [docType, setDocType] = useState('');
  const [selectedLoadNo, setSelectedLoadNo] = useState(activeLoadNo(state));
  const [quarter, setQuarter] = useState(quarterKeyV102());
  const [notice, setNotice] = useState('');
  const mileageRef = useRef(null);
  const tollRef = useRef(null);
  const fuelRef = useRef(null);
  const [profileDraft, setProfileDraft] = useState(()=>normalizeOwnerOpsStoreV102(readOwnerOpsStoreV102()).billingProfile);

  useEffect(()=>{ setTab(TABS_V102.some(([id])=>id===section)?section:'overview'); },[section]);
  async function refreshDocuments() {
    setLoadingDocs(true);
    const rows = await listVaultDocumentsV102();
    setDocuments(rows);
    setLoadingDocs(false);
  }
  useEffect(()=>{ refreshDocuments(); },[]);
  useEffect(()=>{
    const refreshBusiness = event => { setBusinessStore(event?.detail || readBusinessStore()); refreshDocuments(); };
    const refreshOwner = event => { const next=event?.detail || readOwnerOpsStoreV102(); setOwnerStore(next); setProfileDraft(next.billingProfile); };
    window.addEventListener(BUSINESS_STORE_EVENT,refreshBusiness);
    window.addEventListener(OWNER_OPS_STORE_EVENT_V102,refreshOwner);
    window.addEventListener('storage',refreshBusiness);
    return ()=>{
      window.removeEventListener(BUSINESS_STORE_EVENT,refreshBusiness);
      window.removeEventListener(OWNER_OPS_STORE_EVENT_V102,refreshOwner);
      window.removeEventListener('storage',refreshBusiness);
    };
  },[]);

  const summary = useMemo(()=>businessSummary(businessStore),[businessStore]);
  const loads = businessStore.loads || [];
  const activeNo = activeLoadNo(state);
  const selectedLoad = loads.find(load=>text(load.loadNo).toUpperCase()===text(selectedLoadNo).toUpperCase())
    || loads.find(load=>text(load.loadNo).toUpperCase()===activeNo)
    || loads[0] || null;
  const selectedDocs = selectedLoad ? documents.filter(doc=>vaultDocumentLoadNoV102(doc)===text(selectedLoad.loadNo).toUpperCase()) : [];
  const readiness = selectedLoad ? billingReadinessV102(selectedLoad,documents,businessStore) : null;
  const ifta = useMemo(()=>iftaSummaryV102(ownerStore,businessStore,quarter),[ownerStore,businessStore,quarter]);
  const actions = useMemo(()=>ownerOpsActionCenterV102({ state,businessStore,ownerStore,documents,unsignedCount:0 }),[state,businessStore,ownerStore,documents]);
  const filteredDocs = useMemo(()=>searchVaultDocumentsV102(documents,query,{type:docType}),[documents,query,docType]);
  const docTypes = useMemo(()=>[...new Set(documents.map(vaultDocumentTypeV102).filter(Boolean))].sort(),[documents]);
  const invoices = ownerStore.invoices || [];

  function saveProfile(event) {
    event?.preventDefault?.();
    const next = updateOwnerOpsProfileV102(ownerStore,profileDraft);
    setOwnerStore(next);
    setNotice('Billing and factoring profile saved.');
  }

  async function importFile(kind,file) {
    if (!file) return;
    try {
      const csv = await file.text();
      const options = { activeLoadNo:activeNo };
      if (kind==='mileage') {
        const rows = importMileageCsvV102(csv,file.name,options);
        const next = appendOwnerOpsRowsV102(ownerStore,'mileageImports',rows,{ motive:{ provider:rows[0]?.provider || 'ELD CSV', lastImportAt:Date.now(), fileName:file.name, rows:rows.length } });
        setOwnerStore(next);
        setNotice(`Imported ${rows.length} mileage row${rows.length===1?'':'s'} from ${file.name}.`);
      }
      if (kind==='tolls') {
        const rows = importTollCsvV102(csv,file.name,options);
        let next = appendOwnerOpsRowsV102(ownerStore,'tolls',rows,{ tolls:{ provider:rows[0]?.provider || 'Toll CSV', lastImportAt:Date.now(), fileName:file.name, rows:rows.length } });
        let business = businessStore;
        rows.forEach(row => { business = addBusinessRecord(business,'expenses',{ date:row.date,merchant:row.provider,category:'Tolls',total:row.amount,loadNo:row.loadNo,receiptAttached:true,transactionId:row.transactionId,source:'toll_csv_v102' }); });
        setBusinessStore(business);
        setOwnerStore(next);
        setNotice(`Imported ${rows.length} toll transaction${rows.length===1?'':'s'}.`);
      }
      if (kind==='fuel') {
        const rows = importFuelCsvV102(csv,file.name,options);
        const next = appendOwnerOpsRowsV102(ownerStore,'fuelImports',rows,{ mudflap:{ provider:rows[0]?.provider || 'Fuel CSV', lastImportAt:Date.now(), fileName:file.name, rows:rows.length } });
        let business = businessStore;
        rows.forEach(row => { business = addBusinessRecord(business,'fuel',{ date:row.date,merchant:row.merchant,cityState:row.cityState,gallons:row.gallons,pricePerGallon:row.pricePerGallon,total:row.total,discount:row.discount,transactionId:row.transactionId,receiptAttached:true,loadNo:row.loadNo,source:row.provider==='Mudflap'?'mudflap_csv_v102':'fuel_csv_v102' }); });
        setBusinessStore(business);
        setOwnerStore(next);
        setNotice(`Imported ${rows.length} fuel transaction${rows.length===1?'':'s'}.`);
      }
    } catch (error) {
      setNotice(`Import failed: ${String(error?.message || error)}`);
    }
  }

  function saveInvoiceRecord(load, invoiceNo, total) {
    const record = { invoiceNo, loadNo:load.loadNo, broker:load.broker, billingEmail:load.billingEmail || state.loadInfo?.billingEmail || state.loadInfo?.brokerEmail || '', date:new Date().toISOString().slice(0,10), total, status:'generated', createdAt:Date.now() };
    const next = appendOwnerOpsRowsV102(ownerStore,'invoices',[record]);
    setOwnerStore(next);
    const updatedBusiness = updateBusinessRecord(businessStore,'loads',load.id,{ status:'invoiced', invoiceNo, invoicedAt:Date.now() });
    setBusinessStore(updatedBusiness);
    return record;
  }

  async function generateInvoice() {
    if (!selectedLoad) return;
    const prefix = text(profileDraft.invoicePrefix || 'INV').toUpperCase();
    const invoiceNo = `${prefix}-${text(selectedLoad.loadNo || Date.now()).toUpperCase()}`;
    const total = number(selectedLoad.gross || selectedLoad.total);
    const invoice = { invoiceNo, date:new Date().toISOString().slice(0,10), total, broker:selectedLoad.broker, billingEmail:selectedLoad.billingEmail || state.loadInfo?.billingEmail || '', paymentTerms:profileDraft.paymentTerms, items:[{ description:`Transportation service · Load ${selectedLoad.loadNo}`, amount:total }] };
    try {
      await buildInvoicePdfV102({ invoice,load:selectedLoad,profile:profileDraft });
      saveInvoiceRecord(selectedLoad,invoiceNo,total);
      setNotice(`Invoice ${invoiceNo} generated.`);
    } catch (error) { setNotice(`Invoice failed: ${String(error?.message || error)}`); }
  }

  async function generatePacket() {
    if (!selectedLoad) return;
    const existing = invoices.find(invoice=>text(invoice.loadNo).toUpperCase()===text(selectedLoad.loadNo).toUpperCase());
    const invoiceNo = existing?.invoiceNo || `${text(profileDraft.invoicePrefix || 'INV').toUpperCase()}-${text(selectedLoad.loadNo)}`;
    const invoice = { ...existing, invoiceNo, total:number(selectedLoad.gross), items:[{ description:`Transportation service · Load ${selectedLoad.loadNo}`, amount:number(selectedLoad.gross) }] };
    try {
      const result = await buildBillingPacketPdfV102({ invoice,load:selectedLoad,profile:profileDraft,documents:selectedDocs });
      if (!existing) saveInvoiceRecord(selectedLoad,invoiceNo,number(selectedLoad.gross));
      setNotice(`Billing packet created with ${result.included.length} original document${result.included.length===1?'':'s'}.`);
    } catch (error) { setNotice(`Packet failed: ${String(error?.message || error)}`); }
  }

  function openBillingEmail() {
    if (!selectedLoad) return;
    const email = text(selectedLoad.billingEmail || state.loadInfo?.billingEmail || state.loadInfo?.brokerEmail || profileDraft.factoring?.email);
    const invoice = invoices.find(row=>text(row.loadNo).toUpperCase()===text(selectedLoad.loadNo).toUpperCase());
    const subject = encodeURIComponent(`Invoice ${invoice?.invoiceNo || selectedLoad.loadNo} · Load ${selectedLoad.loadNo}`);
    const body = encodeURIComponent(`Hello,\n\nAttached is the billing packet for Load ${selectedLoad.loadNo}.\nAmount due: ${money(selectedLoad.gross)}\n\nThank you,\n${profileDraft.carrierName || 'Carrier'}`);
    if (!email) { setNotice('Add the broker billing email or factoring email first.'); return; }
    window.location.assign(`mailto:${email}?subject=${subject}&body=${body}`);
  }

  function exportIftaCsv() {
    const csv = ownerOpsCsvV102(ifta.rows,[['state','State'],['miles','Miles'],['taxableMiles','Taxable Miles'],['gallons','Tax-paid Gallons'],['fuelTotal','Fuel Total'],['mpg','MPG'],['status','Status']]);
    downloadTextV102(csv,`ifta-${quarter}.csv`,'text/csv');
  }

  async function exportIftaPdf() {
    const lines = ifta.rows.map(row=>`${row.state} · ${row.miles.toFixed(1)} mi · ${row.gallons.toFixed(3)} gal · ${row.status.replace('_',' ')}`);
    try { await buildAuditPacketPdfV102({ title:`IFTA ${quarter}`, sections:[{title:'Quarter summary',lines:[`Total miles: ${ifta.totalMiles.toFixed(1)}`,`Taxable miles: ${ifta.taxableMiles.toFixed(1)}`,`Tax-paid gallons: ${ifta.gallons.toFixed(3)}`,`Fuel total: ${money(ifta.fuelTotal)}`]},{title:'Jurisdictions',lines}], fileName:`ifta-${quarter}.pdf` }); }
    catch(error){ setNotice(`IFTA PDF failed: ${String(error?.message || error)}`); }
  }

  async function exportLoadAudit() {
    if (!selectedLoad) return;
    const loadNo = selectedLoad.loadNo || 'load';
    const loadEvents = Object.entries(state.eventsByDay || {}).flatMap(([day,events])=>(events||[]).filter(event=>text(event.loadNo || event.shippingDocs).toUpperCase()===text(loadNo).toUpperCase()).map(event=>`${day} · ${event.status} · ${event.city || ''}, ${event.state || ''} · ${event.note || ''}`));
    try {
      await buildAuditPacketPdfV102({
        title:`Load ${loadNo} Audit Packet`,
        sections:[
          { title:'Load', lines:[`${selectedLoad.origin || ''} → ${selectedLoad.destination || ''}`,`Broker: ${selectedLoad.broker || ''}`,`Gross: ${money(selectedLoad.gross)}`,`Status: ${selectedLoad.status || ''}`] },
          { title:'Logbook references', lines:loadEvents.length?loadEvents:['No exact load-number events found.'] },
          { title:'Billing readiness', lines:readiness?.checklist.map(item=>`${item.complete?'✓':'○'} ${item.label}`) || [] },
        ],
        documents:selectedDocs,
        fileName:`load-${fileSafe(loadNo)}-audit.pdf`,
      });
      setNotice(`Load ${loadNo} audit packet exported.`);
    } catch(error){ setNotice(`Load packet failed: ${String(error?.message || error)}`); }
  }

  function exportAllData() {
    downloadJson({ exportedAt:new Date().toISOString(), appState:state, businessStore, ownerOpsStore:ownerStore, documentManifest:vaultManifestV102(documents) },`road-ready-owner-ops-${new Date().toISOString().slice(0,10)}.json`);
  }

  function linkUnassignedTolls() {
    if (!activeNo) { setNotice('No active load is available for linking.'); return; }
    const next = writeOwnerOpsStoreV102({ ...ownerStore, tolls:ownerStore.tolls.map(row=>row.loadNo?row:{...row,loadNo:activeNo,linked:true,updatedAt:Date.now()}) });
    setOwnerStore(next);
    setNotice(`Unassigned tolls linked to Load ${activeNo}.`);
  }

  const nav = <div className="owner-os-tabs-v102">{TABS_V102.map(([id,label])=><button key={id} type="button" className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>;

  return (
    <section className="screen owner-os-screen-v102">
      <header className="owner-os-head-v102"><button type="button" onClick={onBack}>‹</button><div><span>Road Ready</span><b>Owner-Operator OS</b></div><button type="button" className="scan" onClick={onScan}>Scan</button></header>
      {nav}
      {notice?<button type="button" className="owner-os-notice-v102" onClick={()=>setNotice('')}>{notice}<span>×</span></button>:null}
      <main className="owner-os-body-v102">
        {tab==='overview' && <>
          <section className="owner-os-hero-v102"><div><span>Complete operation</span><b>{money(summary.estimatedNet)}</b><em>estimated net this week</em></div><div><strong>{actions.length}</strong><small>next actions</small></div></section>
          <div className="owner-os-metrics-v102"><Metric label="Gross" value={money(summary.gross)}/><Metric label="Unpaid" value={money(summary.unpaid)}/><Metric label="Documents" value={String(documents.length)}/><Metric label="IFTA miles" value={Math.round(ifta.totalMiles).toLocaleString()}/></div>
          <SectionHead eyebrow="Action center" title={actions.length?'What needs attention':'Everything is caught up'} />
          {actions.length?<div className="owner-os-action-list-v102">{actions.map(action=><button type="button" key={action.id} className={action.severity} onClick={()=>action.section==='logbook'?onOpenLog?.():setTab(action.section)}><i>{action.severity==='high'?'!':'→'}</i><span><b>{action.title}</b><em>{action.detail}</em></span></button>)}</div>:<div className="owner-os-all-clear-v102"><span>✓</span><div><b>Road Ready</b><em>Logs, documents, billing and IFTA are organized.</em></div></div>}
          <SectionHead eyebrow="One system" title="Import once, use everywhere" />
          <div className="owner-os-launch-grid-v102">
            {[['documents','Document Vault','Rate Con, BOL, POD and receipts'],['billing','Billing','Invoice and packet workflow'],['ifta','Fuel & IFTA','ELD miles plus tax-paid fuel'],['tolls','Tolls','Illinois Tollway, E-ZPass and more'],['audit','Audit Center','Load, DOT, IFTA and maintenance packets'],['connections','Connections','Motive, Mudflap, tolls and file imports']].map(([id,title,detail])=><button type="button" key={id} onClick={()=>setTab(id)}><b>{title}</b><em>{detail}</em><span>›</span></button>)}
          </div>
        </>}

        {tab==='documents' && <>
          <SectionHead eyebrow="Document Vault" title={`${documents.length} original file${documents.length===1?'':'s'} saved`} action={onScan} actionLabel="+ Scan / import" />
          <div className="owner-os-search-v102"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search load, broker, merchant, amount…"/><select value={docType} onChange={event=>setDocType(event.target.value)}><option value="">All types</option>{docTypes.map(type=><option key={type} value={type}>{type.replace(/_/g,' ')}</option>)}</select></div>
          {loadingDocs?<div className="owner-os-loading-v102">Loading Document Vault…</div>:filteredDocs.length?<div className="owner-os-document-list-v102">{filteredDocs.map(document=><article key={document.local_id}><div className="owner-os-doc-icon-v102">{vaultDocumentTypeV102(document).slice(0,3).toUpperCase()}</div><div><span>{vaultDocumentLabelV102(document)}</span><b>{document.title || document.original_file_name}</b><em>{[vaultDocumentLoadNoV102(document)&&`Load ${vaultDocumentLoadNoV102(document)}`,dateLabel(document.vaultDate),document.sync_state].filter(Boolean).join(' · ')}</em></div><div className="owner-os-doc-actions-v102"><button type="button" onClick={()=>openVaultDocumentV102(document)}>Open</button><button type="button" onClick={()=>downloadVaultDocumentV102(document)}>Save</button></div></article>)}</div>:<Empty title="No matching documents" detail="Scan or import Rate Cons, BOLs, PODs, receipts and compliance files. The original file stays in the vault." action={onScan} actionLabel="Open scanner"/>}
        </>}

        {tab==='billing' && <>
          <SectionHead eyebrow="Billing workflow" title={selectedLoad?`Load ${selectedLoad.loadNo}`:'No load selected'} action={onScan} actionLabel="Scan paperwork" />
          <div className="owner-os-load-picker-v102"><select value={selectedLoad?.loadNo || ''} onChange={event=>setSelectedLoadNo(event.target.value)}>{loads.map(load=><option key={load.id} value={load.loadNo}>{load.loadNo || 'Unnumbered'} · {load.origin || ''} → {load.destination || ''}</option>)}</select></div>
          {!selectedLoad?<Empty title="No tracked loads" detail="Import a Rate Confirmation first. Road Ready will create the load and billing checklist." action={onScan} actionLabel="Import Rate Con"/>:<>
            <section className="billing-readiness-v102"><div><span>Billing readiness</span><b>{readiness.percent}%</b><em>{readiness.ready?'Ready to invoice':`${readiness.missing.length} required item${readiness.missing.length===1?'':'s'} missing`}</em></div><i style={{'--ready':`${readiness.percent}%`}}/></section>
            <div className="billing-checklist-v102">{readiness.checklist.map(item=><div key={item.id} className={item.complete?'done':item.required?'missing':'optional'}><span>{item.complete?'✓':item.required?'!':'○'}</span><b>{item.label}</b><em>{item.required?'Required':'When applicable'}</em></div>)}</div>
            <div className="billing-actions-v102"><button type="button" onClick={generateInvoice}>Generate invoice</button><button type="button" className="primary" onClick={generatePacket} disabled={!readiness.ready}>Invoice & packet PDF</button><button type="button" onClick={openBillingEmail}>Email billing</button></div>
          </>}
          <form className="billing-profile-v102" onSubmit={saveProfile}><SectionHead eyebrow="One-time setup" title="Carrier, billing and factoring" /><div className="billing-profile-grid-v102"><label><span>Carrier name</span><input value={profileDraft.carrierName||''} onChange={e=>setProfileDraft({...profileDraft,carrierName:e.target.value})}/></label><label><span>MC #</span><input value={profileDraft.mcNumber||''} onChange={e=>setProfileDraft({...profileDraft,mcNumber:e.target.value})}/></label><label><span>USDOT #</span><input value={profileDraft.dotNumber||''} onChange={e=>setProfileDraft({...profileDraft,dotNumber:e.target.value})}/></label><label><span>EIN</span><input value={profileDraft.ein||''} onChange={e=>setProfileDraft({...profileDraft,ein:e.target.value})}/></label><label className="wide"><span>Address</span><input value={profileDraft.address||''} onChange={e=>setProfileDraft({...profileDraft,address:e.target.value})}/></label><label className="wide"><span>City, ST ZIP</span><input value={profileDraft.cityStateZip||''} onChange={e=>setProfileDraft({...profileDraft,cityStateZip:e.target.value})}/></label><label><span>Billing email</span><input type="email" value={profileDraft.email||''} onChange={e=>setProfileDraft({...profileDraft,email:e.target.value})}/></label><label><span>Invoice prefix</span><input value={profileDraft.invoicePrefix||''} onChange={e=>setProfileDraft({...profileDraft,invoicePrefix:e.target.value})}/></label><label><span>Terms</span><input value={profileDraft.paymentTerms||''} onChange={e=>setProfileDraft({...profileDraft,paymentTerms:e.target.value})}/></label><label className="check wide"><input type="checkbox" checked={!!profileDraft.factoring?.enabled} onChange={e=>setProfileDraft({...profileDraft,factoring:{...(profileDraft.factoring||{}),enabled:e.target.checked}})}/><span>Use factoring company</span></label>{profileDraft.factoring?.enabled&&<><label className="wide"><span>Factoring company</span><input value={profileDraft.factoring?.company||''} onChange={e=>setProfileDraft({...profileDraft,factoring:{...profileDraft.factoring,company:e.target.value}})}/></label><label><span>Factoring email</span><input type="email" value={profileDraft.factoring?.email||''} onChange={e=>setProfileDraft({...profileDraft,factoring:{...profileDraft.factoring,email:e.target.value}})}/></label><label><span>Fee %</span><input inputMode="decimal" value={profileDraft.factoring?.feePercent||''} onChange={e=>setProfileDraft({...profileDraft,factoring:{...profileDraft.factoring,feePercent:e.target.value}})}/></label></>}</div><button type="submit">Save billing setup</button></form>
        </>}

        {tab==='ifta' && <>
          <SectionHead eyebrow="Fuel & IFTA" title={`${quarter} jurisdiction report`} />
          <div className="owner-os-import-bar-v102"><select value={quarter} onChange={e=>setQuarter(e.target.value)}>{currentQuarterOptions().map(value=><option key={value}>{value}</option>)}</select><button type="button" onClick={()=>mileageRef.current?.click()}>Import Motive / ELD miles</button><button type="button" onClick={()=>fuelRef.current?.click()}>Import Mudflap / fuel CSV</button></div>
          <div className="owner-os-metrics-v102"><Metric label="Miles" value={Math.round(ifta.totalMiles).toLocaleString()}/><Metric label="Taxable" value={Math.round(ifta.taxableMiles).toLocaleString()}/><Metric label="Gallons" value={ifta.gallons.toFixed(1)}/><Metric label="Fuel" value={money(ifta.fuelTotal)}/></div>
          {ifta.rows.length?<div className="ifta-table-v102"><div className="head"><span>State</span><span>Miles</span><span>Gallons</span><span>Status</span></div>{ifta.rows.map(row=><div key={row.state}><b>{row.state}</b><span>{row.miles.toFixed(1)}</span><span>{row.gallons.toFixed(3)}</span><StatusPill value={row.status==='complete'?'Complete':row.status==='missing_fuel'?'Fuel missing':'Fuel only'}/></div>)}</div>:<Empty title="No IFTA imports for this quarter" detail="Import miles by state from Motive or another ELD, then import Mudflap or fuel-card purchases."/>}
          <div className="billing-actions-v102"><button type="button" onClick={exportIftaCsv}>Export CSV</button><button type="button" onClick={exportIftaPdf}>IFTA PDF</button></div>
        </>}

        {tab==='tolls' && <>
          <SectionHead eyebrow="Toll intelligence" title={`${ownerStore.tolls.length} imported transaction${ownerStore.tolls.length===1?'':'s'}`} action={()=>tollRef.current?.click()} actionLabel="Import statement" />
          <div className="owner-os-import-note-v102"><b>Supported file workflow</b><span>Illinois Tollway / I-PASS, E-ZPass and generic toll CSV exports. Transactions are linked to the active load when possible.</span></div>
          {ownerStore.tolls.some(row=>!row.loadNo)&&activeNo?<button type="button" className="owner-os-wide-action-v102" onClick={linkUnassignedTolls}>Link unassigned tolls to Load {activeNo}</button>:null}
          {ownerStore.tolls.length?<div className="owner-os-toll-list-v102">{ownerStore.tolls.map(row=><article key={row.id}><div><span>{dateLabel(row.date)}</span><b>{row.plaza || row.provider}</b><em>{[row.state,row.plate,row.loadNo&&`Load ${row.loadNo}`].filter(Boolean).join(' · ')}</em></div><strong>{money(row.amount)}</strong></article>)}</div>:<Empty title="No toll statements imported" detail="Export a CSV from Illinois Tollway, I-PASS, E-ZPass or another toll provider and import it here." action={()=>tollRef.current?.click()} actionLabel="Import toll CSV"/>}
        </>}

        {tab==='audit' && <>
          <SectionHead eyebrow="Audit Center" title="Export proof, history and original documents" />
          <div className="owner-os-audit-grid-v102"><button type="button" onClick={exportLoadAudit} disabled={!selectedLoad}><b>Load packet</b><em>Load summary, log references, billing checklist and original documents.</em></button><button type="button" onClick={exportIftaPdf}><b>IFTA packet</b><em>Miles by state, gallons and exception summary for {quarter}.</em></button><button type="button" onClick={()=>downloadJson({eventsByDay:state.eventsByDay,signatures:state.signatureByDay,inspections:state.inspectionByDay,routeLegsByDay:state.routeLegsByDay},'road-ready-dot-log-export.json')}><b>DOT data export</b><em>Logs, signatures, inspections and route references.</em></button><button type="button" onClick={exportAllData}><b>Complete owner-op backup</b><em>App state, business records, imports and document manifest.</em></button><button type="button" onClick={()=>downloadJson(vaultManifestV102(documents),'road-ready-document-manifest.json')}><b>Document manifest</b><em>File names, types, load links, confidence and sync status.</em></button><button type="button" onClick={()=>downloadJson({maintenance:businessStore.maintenance,documents:vaultManifestV102(documents).filter(row=>/repair|inspection|registration/.test(row.type))},'road-ready-maintenance-audit.json')}><b>Maintenance packet</b><em>Repair history, inspections and supporting document index.</em></button></div>
        </>}

        {tab==='connections' && <>
          <SectionHead eyebrow="Connections & imports" title="Bring every owner-op source into one system" />
          <div className="owner-os-connection-list-v102">
            <article><span>M</span><div><b>Motive / KeepTruckin</b><em>Miles by state for IFTA from CSV export.</em><small>{ownerStore.connections?.motive?.lastImportAt?`Last import: ${new Date(ownerStore.connections.motive.lastImportAt).toLocaleString()}`:'Ready for import'}</small></div><button type="button" onClick={()=>mileageRef.current?.click()}>Import</button></article>
            <article><span>MF</span><div><b>Mudflap / fuel cards</b><em>Gallons, price, discount, state and transaction ID.</em><small>{ownerStore.connections?.mudflap?.lastImportAt?`Last import: ${new Date(ownerStore.connections.mudflap.lastImportAt).toLocaleString()}`:'Ready for import'}</small></div><button type="button" onClick={()=>fuelRef.current?.click()}>Import</button></article>
            <article><span>IL</span><div><b>Illinois Tollway / E-ZPass</b><em>Plaza, date, plate, amount and load matching.</em><small>{ownerStore.connections?.tolls?.lastImportAt?`Last import: ${new Date(ownerStore.connections.tolls.lastImportAt).toLocaleString()}`:'Ready for import'}</small></div><button type="button" onClick={()=>tollRef.current?.click()}>Import</button></article>
            <article><span>DOC</span><div><b>Photos, Files and PDF</b><em>Rate Con, BOL, POD, repairs, fuel, settlements and compliance.</em><small>Stored in Document Vault</small></div><button type="button" onClick={onScan}>Scan</button></article>
            <article><span>ELD</span><div><b>Other ELD gateways</b><em>Samsara, Geotab and generic state-mileage CSV formats.</em><small>Universal header matching enabled</small></div><button type="button" onClick={()=>mileageRef.current?.click()}>Import</button></article>
          </div>
          <div className="owner-os-import-note-v102"><b>Smart linking</b><span>Imports are matched using load number, active load, date, location, truck/unit and transaction identity. Imports never create or change OFF, SB, Driving or ON DUTY time.</span></div>
        </>}
      </main>
      <input ref={mileageRef} hidden type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)importFile('mileage',f);}}/>
      <input ref={tollRef} hidden type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)importFile('tolls',f);}}/>
      <input ref={fuelRef} hidden type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)importFile('fuel',f);}}/>
    </section>
  );
}
