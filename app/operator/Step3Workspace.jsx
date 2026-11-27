'use client';
import React,{useEffect,useState,useRef} from 'react';
import {flushSync} from 'react-dom';
import {usePortalClient} from './PortalSession.jsx';
import {allRows,rows,loadOriginal,loadFields} from './portalData.js';
import {currentWeek,moveDay,formatDay,weekStart} from './financials.js';
import {settlementDisplay} from '../../lib/rr-lease/intake-contract.js';
import payStyles from './driverPay.module.css';
import OperatorWallet,{WalletProof} from './OperatorWallet.jsx';
import CarrierControl from './Step3Carrier.jsx';
import DriverLoadAlerts from './DriverLoadAlerts.jsx';
import LoadCard from './TrainingLoadCard.jsx';
import PilotRateconReview, {PdfDialog} from './PilotRateconReview.jsx';
import RateconDriverTest from './RateconDriverTest.jsx';
import DotOffline from './Step3Dot.jsx';
import TruckTools from './Step3Truck.jsx';
import css from './step3.module.css';
export const money=v=>{
 if(v==null)return 'Pending';
 const s=typeof v==='number'&&Number.isSafeInteger(v)?String(v):typeof v==='string'&&/^-?\d+(?:\.0+)?$/.test(v)?v.split('.')[0]:null;
 if(s===null)return 'Unavailable';
 const n=BigInt(s),a=n<0n?-n:n,whole=(a/100n).toLocaleString('en-US');
 return (n<0n?'-':'')+'$'+whole+'.'+String(a%100n).padStart(2,'0');
};
export const docFields='id,load_id,kind,file_name,storage_path,storage_backend,byte_size,mime_type,chunk_count,is_ready,sha256,revision,is_current';
export async function rpc(client,name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message||'Request rejected');return data;}
export async function api(client,path,body,headers={}){
 const {data,error}=await client.auth.getSession();const token=data?.session?.access_token;if(error||!token)throw Error('Sign in again');
 const binary=body instanceof Blob||body instanceof ArrayBuffer;
 const response=await fetch('/api/operator/'+path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{Authorization:'Bearer '+token,...(body===undefined||binary?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:binary?body:JSON.stringify(body)})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Request rejected');return result;
}
export function useRead(reader,deps,{keepWhileRefreshing=false}={}){
 const [state,setState]=useState({value:null,error:''});
 useEffect(()=>{let active=true;if(!keepWhileRefreshing)setState({value:null,error:''});Promise.resolve().then(reader).then(value=>{if(active)setState({value,error:''})},e=>{if(active)setState({value:null,error:e.message||'Could not load records'})});return()=>{active=false}},deps);
 return state;
}
export function ReadState({state,children}){return state.error?<p role="alert">{state.error}</p>:state.value===null?<p role="status">Loading…</p>:children(state.value)}
export function Action({children,run,done,className}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');const lock=useRef(false);
 return <div className={css.action}><button className={className||css.primary} type="button" disabled={busy} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');try{await run();setMessage('Saved');done?.()}catch(e){setError(e.message||'Review required')}finally{lock.current=false;setBusy(false)}}}>{busy?'Working…':children}</button>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</div>;
}
export function OriginalLink({id,operatorId,wallet=false,label='Open original'}){
 const c=usePortalClient(),[file,setFile]=useState(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>()=>{if(file)URL.revokeObjectURL(file.url)},[file]);
 if(!id)return <small>Carrier report or authorization · original not shared</small>;
 return <div className={css.original}>{file?<><a href={file.url} target="_blank" rel="noreferrer">View {file.type==='application/pdf'?'PDF':'original'}</a> <a href={file.url} download={file.name}>Save</a> <button type="button" onClick={()=>setFile(null)}>Close</button>{file.type.startsWith('image/')&&<img src={file.url} alt={file.name}/>}</>:<button type="button" disabled={busy} onClick={async()=>{setBusy(true);setErr('');try{
 const q=wallet?c.from('rr_lease_wallet_documents').select('id,operator_id,file_name,mime_type,byte_size,sha256,chunk_count,is_ready').eq('operator_id',operatorId):c.from('rr_lease_documents').select(docFields);
 const {data,error}=await q.eq('id',id).eq('is_ready',true).single();if(error||!data)throw Error('Original unavailable');
 const blob=await loadOriginal(c,wallet?{...data,storage_backend:'database'}:data,wallet?'rr_lease_wallet_download_chunk':undefined);
 setFile({url:URL.createObjectURL(blob),name:data.file_name,type:blob.type});
 }catch(e){setErr(e.message)}finally{setBusy(false)}}}>{busy?'Opening…':label}</button>}{err&&<p role="alert">{err}</p>}</div>;
}
const podFileTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function PodUpload({loadId, loadNumber, done}) {
  const client = usePortalClient();
  const readOnly = client.podUploadsReadOnly === true;
  const canScan = process.env.NEXT_PUBLIC_OPERATOR_POD_SCANNER !== 'false';
  const [file, setFile] = useState(null);
  const [broker, setBroker] = useState('');
  const [number, setNumber] = useState('');
  const [Scanner, setScanner] = useState(null);
  const [opening, setOpening] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const chooseButton = useRef(null);
  const scannerPending = useRef(false);
  const scanButton = useRef(null);
  const selection = useRef(null);
  const viewButton = useRef(null);
  const intent = useRef(null);
  const lock = useRef(false);

  function selectFile(next) {
    if (!podFileTypes.includes(next.type) || next.size < 1 || next.size > 3 * 1024 * 1024) {
      throw Error('Choose a PDF, JPEG, PNG or WebP file up to 3 MiB.');
    }
    setFile(next);
    intent.current = null;
    setError('');
    setSent(false);
  }

  async function openScanner() {
    if (!canScan || scannerPending.current || Scanner || lock.current) return;
    scannerPending.current = true;
    setError('');
    setOpening(true);
    try {
      const {default: PodScanner} = await import('roadready-pod-scanner');
      if (!PodScanner) throw Error('Scanner unavailable');
      if (scanButton.current && !scanButton.current.closest('details:not([open])')) setScanner(() => PodScanner);
    } catch {
      setError('The scanner could not open. Try again or choose a file.');
    } finally {
      scannerPending.current = false;
      setOpening(false);
    }
  }

  function openAssignedUpload(event) {
    const disclosure = event.currentTarget.parentElement;
    if (disclosure.open || file || !canScan) return;
    event.preventDefault();
    disclosure.open = true;
    void openScanner();
  }

  function chooseOriginalFromScanner() {
    // The file picker needs the original tap, with the modal already dismissed on iOS.
    flushSync(() => setScanner(null));
    chooseButton.current?.focus({preventScroll:true});
    fileInput.current?.click();
  }

  function closeScanner(focusTarget) {
    setScanner(null);
    requestAnimationFrame(() => focusTarget.current?.focus());
  }

  async function submit(event) {
    event.preventDefault();
    if (readOnly || lock.current || opening || Scanner || !file) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const key = JSON.stringify([loadId, broker, number, file.name, file.size, file.lastModified]);
      if (intent.current?.key !== key) intent.current = {key, id:crypto.randomUUID()};
      const {uploadId} = await api(client, 'pod/create-upload', {
        requestId:intent.current.id, loadId:loadId || null,
        ...(loadId ? {} : {broker:broker.trim(), loadNumber:number.trim()}),
        fileName:file.name, mimeType:file.type, byteSize:file.size,
      });
      const result = await api(client, 'pod/commit-upload', file, {
        'Content-Type':file.type, 'X-Upload-Id':uploadId,
      });
      if (result.review_status === 'REJECTED') {
        throw Error('This exact original was rejected. Upload a corrected document.');
      }
      setSent(true);
      setFile(null);
      intent.current = null;
      done?.();
    } catch (err) {
      setError(err.message || 'Upload failed. Try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const content = <>
    <form className={css.form} onSubmit={submit}>
      {!loadId && <>
        <p>No rate confirmation yet? Enter the exact broker and load number. Gross stays unknown.</p>
        <label>Broker<input required disabled={busy} maxLength={200} value={broker} onChange={e => setBroker(e.target.value)}/></label>
        <label>Load number<input required disabled={busy} maxLength={120} value={number} onChange={e => setNumber(e.target.value)}/></label>
      </>}
      <div className={css.podSources}>
        {canScan && <button type="button" className={file ? undefined : css.primary} ref={scanButton} aria-haspopup="dialog"
          disabled={busy || opening} onClick={openScanner}>{opening ? 'Opening scanner…' : 'Scan POD'}</button>}
        <button type="button" ref={chooseButton} disabled={busy || opening} onClick={() => fileInput.current.click()}>Choose file</button>
      </div>
      <input ref={fileInput} type="file" hidden accept={podFileTypes.join(',')} aria-label="Choose signed POD file"
        onChange={e => {
          const next = e.target.files?.[0];
          e.target.value = '';
          if (!next) return;
          try { selectFile(next); }
          catch (err) { setSent(false); setError(err.message); }
        }}/>
      {file ? <>
        <div ref={selection} tabIndex={-1} role="status" className={css.podSelection}>
          <small>Ready to upload</small><strong>{file.name}</strong>
          {readOnly && <small>Preview only. This file stays on your device.</small>}
        </div>
        {file.type === 'application/pdf' && <button type="button" ref={viewButton} aria-haspopup="dialog"
          disabled={busy || opening} onClick={() => setViewing(true)}>View PDF</button>}
        <button className={css.primary} type="submit" disabled={readOnly || busy || opening}>
          {busy ? 'Uploading…' : 'Upload POD'}
        </button>
      </> : <small>PDF, JPEG, PNG or WebP · Up to 3 MiB</small>}
      {sent && <p role="status">Original received · pending carrier review</p>}
      {error && <p role="alert">{error}</p>}
    </form>
    {viewing && file && <PdfDialog heading="Signed POD" cachedBlob={file} onClose={() => {
      setViewing(false);
      requestAnimationFrame(() => viewButton.current?.focus({preventScroll:true}));
    }}/>}
    {Scanner && <Scanner loadLabel={loadNumber || number.trim()} onChooseFile={chooseOriginalFromScanner} onCancel={() => closeScanner(scanButton)} onReady={reviewedFile => {
      selectFile(reviewedFile);
      closeScanner(selection);
    }}/>}
  </>;
  if (!loadId) return content;
  return <details className={css.uploadControl}>
    <summary onClick={openAssignedUpload}>Upload POD</summary>
    {content}
  </details>;
}
function LoadDetails({load,pods,driverView,refresh,done,initialOpen}){
 const c=usePortalClient();
 const docs=useRead(()=>rows(c.from('rr_lease_documents').select(docFields).eq('load_id',load.id).eq('is_ready',true).order('is_current',{ascending:false}).order('id')),[c,load.id,refresh]);
 const [review,setReview]=useState(null);
 const ratecon=docs.value?.find(d=>d.kind==='ratecon' && d.is_current && d.mime_type==='application/pdf');
 const pending=pods.some(x=>x.review_status==='PENDING'),approved=pods.some(x=>x.review_status==='APPROVED'&&x.document_id===load.final_pod_id),rejected=!approved&&!pending&&pods.some(x=>x.review_status==='REJECTED');
 const status=load.load_type==='TONU'?'TONU · cancelled':approved?'POD approved':rejected?'POD rejected':pending?'POD review':load.status.replaceAll('_',' ');
 const allowPod=load.load_type!=='TONU'&&['assigned','picked_up','delivered'].includes(load.status)&&load.billing_channel==='FIRSTLINE_FACTORED';
 function card(acceptance) {
   const controls=<>
     {acceptance?.control || (ratecon && <PilotRateconReview key={ratecon.id} client={c} doc={ratecon} review={review?.id===ratecon.id?review:null} onReviewed={cacheReview} label="Rate Con PDF"/>)}
     {acceptance?.issue}
     {docs.error&&<p role="alert">{docs.error}</p>}
     {allowPod&&<PodUpload loadId={load.id} loadNumber={load.load_number} done={done}/>}
   </>;
   return <LoadCard load={load} status={acceptance?.status || status} controls={controls} initialOpen={initialOpen} gross={money(load.gross_cents)}>
     {acceptance?.broker}
     <h3>Broker rules</h3><dl className={css.pairs}>{['tracking','detention','layover','lumper','podDeadline'].map(k=><div key={k}><dt>{k==='podDeadline'?'POD deadline':k}</dt><dd>{load.broker_rules?.[k]||'Not confirmed'}</dd></div>)}</dl>
     {load.reefer_instructions&&<p>{load.reefer_instructions}</p>}{load.steps?.map((s,i)=><p key={i}><strong>{s.title}</strong> · {s.detail}</p>)}
     <p>{load.payment_deadline?'Payment deadline '+formatDay(load.payment_deadline):'Payment deadline pending'}</p>
     <ReadState state={docs}>{ds=><div className={css.stack}>{ds.filter(d=>d!==ratecon).map(d=><OriginalLink key={d.id} id={d.id} label={d.kind+' · '+d.file_name}/>)}</div>}</ReadState>
     {pods.filter(x=>x.review_status==='REJECTED').map(x=><p className={css.red} key={x.document_id}>Rejected: {x.rejection_reason}</p>)}
   </LoadCard>;
 }
 // The viewer effect uses a stable callback throughout each document revision.
 const cacheReview=React.useCallback(result=>setReview({...result,id:ratecon?.id}),[ratecon?.id]);
 return driverView ? <RateconDriverTest load={load} refresh={refresh}>{card}</RateconDriverTest> : card(null);
}
function Loads({operator,driverView,refresh,done}){
 // Keep the active POD scan mounted when load alerts refresh this workspace.
 const c=usePortalClient(),state=useRead(async()=>{const [loads,pods]=await Promise.all([allRows(()=>c.from('rr_lease_loads').select(loadFields+',billing_channel,broker_rules,final_pod_id,ledger_mode,cancelled_at,load_type,tonu_confirmation_id').eq('operator_id',operator.id).order('updated_at',{ascending:false}).order('id')),rpc(c,'rr_lease_step3_pod_status',{p_operator_id:operator.id})]);return {loads,pods}},[c,operator.id,refresh],{keepWhileRefreshing:true});
 const [week,setWeek]=useState(()=>currentWeek());
 return <div className={css.stack}>
 <ReadState state={state}>{({loads,pods})=>{
 const active=loads.filter(l=>['staging','assigned','picked_up'].includes(l.status));
 const history=loads.filter(l=>!active.includes(l)&&(((l.actual_delivery_date||l.cancelled_at?.slice(0,10))>=''+week&&(l.actual_delivery_date||l.cancelled_at?.slice(0,10))<moveDay(week,7))||(!l.actual_delivery_date&&pods.some(p=>p.load_id===l.id&&p.review_status==='REJECTED'))));
 const card=l=><LoadDetails initialOpen={l.id===active[0]?.id} key={l.id} load={l} pods={pods.filter(p=>p.load_id===l.id)} driverView={driverView} refresh={refresh} done={done}/>;
 return <><h2>Active loads</h2>{active.length?active.map(card):<p>No assigned loads.</p>}<details className={css.panel}><summary>Delivery History</summary><div className={css.detail}><label>Week<input type="date" value={week} onChange={e=>{if(e.target.value)setWeek(weekStart(e.target.value))}}/></label>{history.length?history.map(card):<p>No completed loads in this week.</p>}</div></details></>}}</ReadState><details className={css.panel}><summary>Upload POD without a load</summary><div className={css.detail}><PodUpload done={done}/></div></details></div>;
}
function feeLabel(entries) {
 const revenue = (entries || []).filter(e=>['FREIGHT','FSC','DETENTION','LAYOVER','TONU','STOP_OFF'].includes(e.entry_type));
 const rates = new Set(revenue.map(e=>e.fee_bps));
 const [rate] = rates;
 return rates.size===1 && rate!=null && Number.isFinite(Number(rate)) ? (Number(rate)/100)+'% Fee' : 'Fee';
}
function DriverPay({operator,refresh}){
 const c=usePortalClient(),[selected,setSelected]=useState('');
 const data=useRead(()=>allRows(()=>c.from('rr_lease_settlement_totals').select('*').eq('operator_id',operator.id).order('week_start',{ascending:false}).order('settlement_id')),[c,operator.id,refresh]);
 const current=data.value?.find(s=>s.settlement_id===selected)||data.value?.[0];
 const ledger=useRead(()=>current?allRows(()=>c.from('v_driver_ledger_entries').select('*').eq('operator_id',operator.id).eq('settlement_id',current.settlement_id).order('created_at').order('id')):Promise.resolve([]),[c,operator.id,current?.settlement_id,refresh]);
 const taxes=useRead(()=>allRows(()=>c.from('rr_lease_adjustments').select('id,description,amount_cents,kind,intake_status,wallet_document_id,settlement_id').eq('operator_id',operator.id).eq('paid_by','operator').order('id')),[c,operator.id,refresh]);
 return <ReadState state={data}>{list=>{if(!current)return <p>No weekly settlements yet.</p>;let t;try{t=settlementDisplay(current)}catch{return <p role="alert">Totals require reconciliation. No estimated amount displayed.</p>}
 return <div className={css.stack}><label>Settlement week<select value={current.settlement_id} onChange={e=>setSelected(e.target.value)}>{list.map(s=><option key={s.settlement_id} value={s.settlement_id}>{s.week_start} · {s.status}</option>)}</select></label>
 <section className={payStyles.summary} aria-label="Weekly settlement">
   <div className={payStyles.totals}>
     <div className={payStyles.estimate}>
       <span>Estimated Net</span>
       <small className={payStyles.status}>{current.status==='draft'?'Draft':current.status==='issued'?'Issued':'Paid'}</small>
       <strong>{money(t.estimatedNetCents)}</strong>
     </div>
     <div className={payStyles.payable}>
       <div><span>Verified Payable</span><small>{t.isConfirmed?'Verified':'Pending verification'}</small></div>
       <strong>{money(t.netCents ?? 0)}</strong>
     </div>
   </div>
   <div className={payStyles.breakdownCard}>
   <dl className={payStyles.breakdown} aria-label="Settlement breakdown">
     <div><dt>Gross</dt><dd>{money(t.feeEligibleGrossCents)}</dd></div>
     <div><dt>{feeLabel(ledger.value)}</dt><dd>− {money(current.carrier_share_cents)}</dd></div>
     <div><dt>Deductions</dt><dd>− {money(current.carrier_deduction_cents)}</dd></div>
     <div><dt>0% Reimbursements</dt><dd>+ {money(t.lumperCents)}</dd></div>
     {t.otherCreditsCents!==0&&<div><dt>Other credits</dt><dd>+ {money(t.otherCreditsCents)}</dd></div>}
   </dl>
   {t.negativeBalanceCents>0&&<p>Negative balance: {money(t.negativeBalanceCents)}</p>}
   <details><summary>Statement details</summary><p>Invoice gross: {money(t.invoiceGrossCents)}</p><p>Verified net to date: {money(t.verifiedNetCents)}</p><p>Driver-paid costs · tax records: {money(current.operator_paid_cents)}</p></details>
   </div>
 </section>
 <h2>Ledger entries</h2><ReadState state={ledger}>{rs=>rs.map(r=><article className={css.panel} key={r.id}><div className={css.detail}><strong>{r.entry_type.replaceAll('_',' ')} · {money(r.amount_cents)}</strong><p>{r.description}</p><span className={r.status==='POSTED'?css.green:css.yellow}>{r.status} · Driver effect {money(r.driver_effect_cents)}</span>{r.source_document_id?<OriginalLink id={r.source_document_id}/>:r.source_wallet_document_id?<OriginalLink id={r.source_wallet_document_id} operatorId={operator.id} wallet/>:<small>Carrier report / schedule · proof may require carrier review</small>}</div></article>)}</ReadState>
 <h2>Tax folder · driver-paid expenses</h2><ReadState state={taxes}>{rs=>rs.length?rs.map(r=><article className={css.panel} key={r.id}><div className={css.detail}><strong>{r.description} · {money(r.amount_cents)}</strong><p>{r.intake_status} · No settlement deduction</p>{r.wallet_document_id&&<WalletProof operatorId={operator.id} documentId={r.wallet_document_id}/>}</div></article>):<p>No recorded driver-paid receipts.</p>}</ReadState></div>}}</ReadState>;
}
export function CompanyNumbers({week,refresh,ownOnly=false}){
 const c=usePortalClient(),state=useRead(()=>rpc(c,'rr_lease_step3_company_summary',{p_week:week}),[c,week,refresh]);
 return <ReadState state={state}>{s=><div className={css.stack}><dl className={css.pairs}>{[['Own truck verified revenue',s.ownGrossCents],['Own recorded expenses',s.recordedOwnExpensesCents],['Own recorded margin',s.ownRecordedMarginCents],...(!ownOnly?[['Leased operator commissions',s.commissionCents],['Verified FirstLine fees',s.verifiedFirstLineFeesCents],['Recorded company margin',s.recordedMarginCents]]:[])].map(([label,val])=><div key={label}><dt>{label}</dt><dd>{money(val)}</dd></div>)}</dl>{!ownOnly&&<p className={css.yellow}>{s.pendingFirstLineEvents} factor events pending review. Recorded margin excludes unrecorded costs and unverified events; full net profit is not yet confirmed.</p>}</div>}</ReadState>;
}
function OwnPay({refresh}){const [week,setWeek]=useState(()=>currentWeek());return <div className={css.stack}><p>Own truck · 100% company revenue. No contractor settlement.</p><label>Monday week start<input type="date" value={week} onChange={e=>{if(e.target.value)setWeek(weekStart(e.target.value))}}/></label><CompanyNumbers week={week} refresh={refresh} ownOnly/></div>}
const driverTabs = [
  {key:'load', label:'LOAD', icon:<><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M9 6h6.5a3.5 3.5 0 0 1 0 7h-7a2.5 2.5 0 0 0 0 5h6.5"/></>},
  {key:'pay', label:'PAY', icon:<><path d="M4 7.5V6a2 2 0 0 1 2-2h11v3M4 8h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2Z"/><path d="M20 12h-4a2 2 0 0 0 0 4h4"/></>},
  {key:'docs', label:'DOCS', icon:<><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></>},
  {key:'truck', label:'TRUCK', icon:<><path d="M2 6h12v10H8m-4 0H2V6m12 3h4l4 5v3h-2m-4 0h-2"/><circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/></>},
];

export default function Step3Workspace({operator,session,operators,workspacePicker,onSignOut}){
 const [tab,setTab]=useState('load'),[refresh,setRefresh]=useState(0),[dark,setDark]=useState(true);
 const own=operator.workspace_kind==='carrier'&&operator.carrier_user_id===session.user.id;
 const company=operators.some(o=>o.workspace_kind==='carrier'&&o.carrier_user_id===session.user.id);
 const driverView=operator.workspace_kind==='leased' && operator.driver_user_id===session.user.id;
 const profile=useRef(null);
 useEffect(()=>{
   const dismiss=e=>{if(!profile.current?.open)return;
     if(e.type==='keydown' && e.key==='Escape'){profile.current.open=false;profile.current.querySelector('summary').focus();}
     if(e.type==='pointerdown' && !profile.current.contains(e.target))profile.current.open=false;
   };
   document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',dismiss);
   return ()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',dismiss)};
 },[]);
 const reload=()=>setRefresh(n=>n+1);
 function selectTab(key){
   profile.current.open=false;
   setTab(key);
   window.scrollTo(0,0);
 }
 return <section className={css.shell} data-driver-portal data-theme={dark?'dark':'light'}>
 <header className={css.topRow}>
   <h1 className={css.wordmark}>RoadReady</h1>
   <details className={css.profile} ref={profile}><summary>Profile</summary>
     <div className={css.profileMenu}><strong>{operator.driver_name}</strong><small>{operator.company_name}</small>
       {workspacePicker}
       <button type="button" onClick={()=>setDark(v=>!v)}>{dark?'Light mode':'Dark mode'}</button>
       <button type="button" onClick={reload}>Refresh</button>
       {driverView&&<DriverLoadAlerts key={operator.id} operatorId={operator.id} onRefresh={reload}/>}
       {company&&<button type="button" onClick={()=>selectTab('company')}>Company control</button>}
       <button type="button" onClick={onSignOut}>Sign out</button>
     </div>
   </details>
 </header>
 <nav className={css.tabs} aria-label="Operator tabs">
   {driverTabs.map(({key,label,icon})=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>selectTab(key)}>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icon}</svg>
     <span>{label}</span>
   </button>)}
 </nav>
 <div className={css.content}>
 {tab==='load'&&<Loads key={session.user.id + ':' + operator.id} operator={operator} driverView={driverView} refresh={refresh} done={reload}/>}
 {tab==='pay'&&(own?<OwnPay refresh={refresh}/>:<DriverPay operator={operator} refresh={refresh}/>)}
 {tab==='docs'&&<OperatorWallet operatorId={operator.id} refresh={refresh} layout="driver"><DotOffline operator={operator} userId={session.user.id} refresh={refresh}/></OperatorWallet>}
 {tab==='truck'&&<TruckTools operator={operator} refresh={refresh} done={reload}/>}
 {tab==='company'&&company&&<CarrierControl operators={operators.filter(o=>o.carrier_user_id===session.user.id)} refresh={refresh} done={reload}/>}
 </div></section>;
}
