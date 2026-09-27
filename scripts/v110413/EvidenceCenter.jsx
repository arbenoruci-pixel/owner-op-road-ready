'use client';
import './evidenceCatalogV110413.js';
import React,{useEffect,useMemo,useState} from 'react';
import {CATALOG,FIELD_LABELS,buildEvidence,documentFacts,kindOf,loadOf,idOf,text,day,localToday,validateFacts} from './evidenceCoreV110413.js';
import {saveReviewedFacts,addExpectedLoad,addExpectation} from './evidenceStorageV110413.js';
import {readBusinessStore,BUSINESS_STORE_EVENT} from '../business/businessStore.js';
import {readOwnerOpsStoreV102} from './ownerOpsStoreV102.js';
import {listVaultDocumentsV102} from './documentVaultV102.js';
import {SavedFileActionsV110344} from './SavedDocumentFilesV110344.jsx';
import RecoveryPanel from './RecoveryPanelV110413.jsx';
import './evidenceV110413.css';

function thisWeek(){const d=new Date(localToday()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {from,to:d.toISOString().slice(0,10)};}
const areas=[['load','Loads'],['ifta','IFTA'],['tax','Tax records'],['audit','Audit']];
const statusLabel={ready:'Reviewed source',review:'Needs review',missing:'Missing',not_due:'Not due yet',info:'Note'};
function Field({name,value,onChange}){
  const label=FIELD_LABELS[name];
  if(['podSigned','taxPaid','qualifiedVehicle'].includes(name))return <label className="rr-evidence-check"><input type="checkbox" checked={value===true} onChange={e=>onChange(e.target.checked)}/>{label}</label>;
  const options=name==='volumeUnit'?[['gal','US gallons'],['L','Liters']]:name==='fuelType'?['diesel','gasoline','biodiesel','propane','cng','lng','def','reefer','other'].map(v=>[v,v]):name==='payment'?[['paid','Payment proof on file'],['unpaid','Unpaid invoice'],['unknown','Not established']]:null;
  return <label>{label}{options?<select value={value||''} onChange={e=>onChange(e.target.value)}><option value="">Choose…</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>:<input type={['date','pickupDate','deliveryDate'].includes(name)?'date':'text'} inputMode={['total','quantity'].includes(name)?'decimal':undefined} value={value??''} onChange={e=>onChange(e.target.value)} maxLength={1600}/>}</label>;
}
export default function EvidenceCenter({documents:providedDocuments,businessStore:providedBusiness,ownerStore:providedOwner,loads:providedLoads,folder=null,week=null,initialArea='load',period=null,onScan,onImportMileage,onOpenLog}){
  const [local,setLocal]=useState({documents:[],businessStore:{},ownerStore:{}}),[area,setArea]=useState(initialArea),[range,setRange]=useState(()=>period||thisWeek());
  const [selected,setSelected]=useState(null),[kind,setKind]=useState('other'),[fields,setFields]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [chooser,setChooser]=useState(false),[adding,setAdding]=useState(''),[draft,setDraft]=useState({}),[download,setDownload]=useState(null);
  useEffect(()=>{setArea(initialArea);},[initialArea]);
  useEffect(()=>{if(period)setRange(period);},[period?.from,period?.to]);
  useEffect(()=>{
    if(providedDocuments!==undefined)return;
    let live=true;const refresh=async()=>{const documents=await listVaultDocumentsV102();if(live)setLocal({documents,businessStore:readBusinessStore(),ownerStore:readOwnerOpsStoreV102()});};refresh();window.addEventListener(BUSINESS_STORE_EVENT,refresh);return()=>{live=false;window.removeEventListener(BUSINESS_STORE_EVENT,refresh);};
  },[providedDocuments]);
  useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url);},[download]);
  const documents=providedDocuments||local.documents,businessStore=providedBusiness||local.businessStore,ownerStore=providedOwner||local.ownerStore;
  const effectiveRange=week?{from:day(week.start),to:day(week.start)?new Date(Date.parse(week.start+'T12:00:00Z')+6*86400000).toISOString().slice(0,10):''}:range;
  const loads=useMemo(()=>{
    const map=new Map((businessStore.loads||[]).map(l=>[loadOf(l),l]));
    for(const l of providedLoads||[])map.set(loadOf(l),{...map.get(loadOf(l)),...l});
    return [...map.values()];
  },[businessStore.loads,providedLoads]);
  const model=useMemo(()=>buildEvidence({documents,loads,businessStore,ownerStore,range:effectiveRange,loadNo:folder?.loadNo||''}),[documents,loads,businessStore,ownerStore,effectiveRange.from,effectiveRange.to,folder?.loadNo]);
  const rows=[...model.checks,...model.issues].filter(r=>r.area===area);
  function review(doc){setSelected(doc);setKind(CATALOG[kindOf(doc)]?kindOf(doc):'other');setFields(documentFacts(doc));setError('');setMessage('');setChooser(false);}
  async function save(book){setBusy(true);setError('');try{const next=await saveReviewedFacts(selected,kind,validateFacts(kind,fields),{book});setSelected(next);setMessage(book?'Reviewed source and book entry saved. Fuel, Tax and Audit use this same source.':'Reviewed source details saved.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  function scan(type,loadNo){onScan?.({kind:type||'auto',loadNo:loadNo||folder?.loadNo||'',date:effectiveRange.from||''});}
  async function add(event){event.preventDefault();setBusy(true);setError('');try{if(adding==='load')await addExpectedLoad(draft);else await addExpectation({...draft,loadNo:draft.loadNo||folder?.loadNo||'',area});setAdding('');setDraft({});setMessage('Added to your document checklist.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  function exportIndex(){const file=new File([JSON.stringify({format:'road-ready-evidence-index',version:1,createdAt:new Date().toISOString(),range:effectiveRange,loadNo:folder?.loadNo||'',coverage:'Saved source records only. Check against dispatch, bank and fuel statements.',documents:model.docs.map(d=>({id:idOf(d),fileName:d.original_file_name||d.fileName,sha256:d.sha256,kind:kindOf(d),fields:documentFacts(d),review:d.extracted?.evidenceFactsV1||null})),checks:[...model.checks,...model.issues].map(({document,...r})=>({...r,sourceDocumentId:document?idOf(document):''}))},null,2)],`road-ready-evidence-${effectiveRange.from||'all'}.json`,{type:'application/json'});setDownload({url:URL.createObjectURL(file),name:file.name});}
  return <section className="rr-evidence" aria-label="Document evidence checklist">
    <details open={!!folder}>
      <summary><span><strong>What’s missing</strong><small>{model.counts.missing} missing · {model.counts.review} to review{model.counts.notDue?` · ${model.counts.notDue} not due yet`:''}</small></span></summary>
      <p>Check saved sources for loads, fuel, tax records and audit. Add expected loads or documents to catch missing folders.</p>
      {!week&&!folder?<div className="rr-evidence-dates"><label>From<input type="date" value={range.from} onChange={e=>setRange({...range,from:e.target.value})}/></label><label>Through<input type="date" value={range.to} onChange={e=>setRange({...range,to:e.target.value})}/></label></div>:null}
      <div className="rr-evidence-tabs" role="group" aria-label="Evidence use">{areas.map(([key,label])=><button type="button" key={key} aria-pressed={area===key} onClick={()=>setArea(key)}>{label}</button>)}</div>
      {area==='ifta'?<p>Reconcile actual jurisdiction miles and all motor-fuel purchases. A fuel purchase is not required in every state traveled. Confirm eligibility before using tax-paid volume.</p>:area==='tax'?<p>Amounts and source files support bookkeeping. Invoice amounts, receipts and payment evidence remain distinct; tax treatment is reviewed separately.</p>:area==='audit'?<p>Keep original sources, dates, driver / unit links and transaction details. Open the Audit Center for duty-day checks and log exports.</p>:null}
      {!rows.length?<p>{model.docs.length?'No open items in this checklist. Compare the saved records with your dispatch and statements.':'No evidence in this period. Add a document or expected load to start.'}</p>:<ul className="rr-evidence-rows">{rows.slice(0,50).map(row=><li key={row.id} className={row.status}><div><strong>{row.loadNo?`Load ${row.loadNo} · `:''}{row.label}</strong><span>{statusLabel[row.status]}</span><p>{row.detail}</p></div>{row.document?<button type="button" onClick={()=>review(row.document)}>Review source</button>:row.status!=='not_due'&&row.status!=='ready'?<button type="button" onClick={()=>row.action==='mileage'&&onImportMileage?onImportMileage():scan(row.kind,row.loadNo)}>Add {row.action==='mileage'?'mileage':row.kind==='fuel_receipt'?'fuel receipt':'document'}</button>:null}</li>)}</ul>}
      {rows.length>50?<p>{rows.length-50} more items. Narrow the date range or open a load.</p>:null}
      <div className="rr-evidence-actions">
        <button type="button" onClick={()=>{setChooser(!chooser);setSelected(null);}}>Choose saved document</button>
        <button type="button" onClick={()=>{setAdding('load');setDraft({pickupDate:effectiveRange.from||localToday(),stage:'booked'});}}>Track a load</button>
        <button type="button" onClick={()=>{setAdding('document');setDraft({date:effectiveRange.from||localToday(),kind:'other',loadNo:folder?.loadNo||''});}}>Expect a document</button>
        <button type="button" onClick={exportIndex}>Prepare evidence index</button>
        {area==='audit'&&onOpenLog?<button type="button" onClick={onOpenLog}>Open logbook</button>:null}
      </div>
      {download?<a className="rr-evidence-download" href={download.url} download={download.name}>Download evidence index</a>:null}
      {chooser?<label>Saved source<select aria-label="Choose saved source" defaultValue="" onChange={e=>{const d=documents.find(d=>idOf(d)===e.target.value);if(d)review(d);}}><option value="">Choose a file…</option>{documents.map(d=><option key={idOf(d)} value={idOf(d)}>{loadOf(d)?`Load ${loadOf(d)} · `:''}{d.original_file_name||d.fileName||d.title||'Document'}</option>)}</select></label>:null}
      {adding?<form onSubmit={add} aria-label={adding==='load'?'Track expected load':'Expect document'}><h4>{adding==='load'?'Track an expected load':'Add a document requirement'}</h4><div className="rr-evidence-form">
        {adding==='load'?<><Field name="loadNo" value={draft.loadNo} onChange={v=>setDraft({...draft,loadNo:v})}/><Field name="merchant" value={draft.merchant} onChange={v=>setDraft({...draft,merchant:v})}/><Field name="pickupDate" value={draft.pickupDate} onChange={v=>setDraft({...draft,pickupDate:v})}/><Field name="deliveryDate" value={draft.deliveryDate} onChange={v=>setDraft({...draft,deliveryDate:v})}/><label>Service<select value={draft.stage} onChange={e=>setDraft({...draft,stage:e.target.value})}><option value="booked">Booked load</option><option value="tonu">Truck ordered not used (TONU)</option></select></label></>:<><label>Document name<input value={draft.label||''} onChange={e=>setDraft({...draft,label:e.target.value})}/></label><label>Document type<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value})}>{Object.entries(CATALOG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label><Field name="loadNo" value={draft.loadNo} onChange={v=>setDraft({...draft,loadNo:v})}/><Field name="date" value={draft.date} onChange={v=>setDraft({...draft,date:v})}/></>}
      </div><div className="rr-evidence-actions"><button type="submit" disabled={busy}>Save expectation</button><button type="button" onClick={()=>setAdding('')}>Cancel</button></div></form>:null}
      <RecoveryPanel/>
      <p className="rr-evidence-footnote">Checklist rules follow <a href="https://www.iftach.org/manuals/2026/PM/Procedures%20Manual%20-%2001-05-26.pdf" target="_blank" rel="noreferrer">IFTA recordkeeping</a>, <a href="https://www.irs.gov/businesses/small-businesses-self-employed/what-kind-of-records-should-i-keep" target="_blank" rel="noreferrer">IRS source records</a> and <a href="https://www.fmcsa.dot.gov/hours-service/elds/supporting-documents" target="_blank" rel="noreferrer">FMCSA supporting documents</a>. A reviewed source is an evidence check, not a filing or compliance certification.</p>
    </details>
    {selected?<section className="rr-evidence-review" aria-label="Review document evidence"><h3>Review the original and its uses</h3><p>{selected.original_file_name||selected.fileName||selected.title}</p><SavedFileActionsV110344 document={selected}/><label>Document type<select aria-label="Evidence document type" value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(CATALOG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label><p>Used for: {CATALOG[kind].uses.map(k=>areas.find(a=>a[0]===k)?.[1]).join(' · ')}</p><div className="rr-evidence-form">{CATALOG[kind].fields.map(name=><Field key={name} name={name} value={fields[name]} onChange={v=>setFields({...fields,[name]:v})}/>)}</div><div className="rr-evidence-actions"><button type="button" disabled={busy} onClick={()=>save(false)}>Save reviewed details</button>{['fuel_receipt','expense_receipt','toll_receipt','maintenance'].includes(kind)?<button type="button" disabled={busy} onClick={()=>save(true)}>Save and use in books</button>:null}<button type="button" disabled={busy} onClick={()=>setSelected(null)}>Close review</button></div></section>:null}
    {message?<p role="status">{message}</p>:null}{error?<p role="alert">{error}</p>:null}
  </section>;
}
