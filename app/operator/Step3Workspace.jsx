'use client';
import React,{useEffect,useState,useRef} from 'react';
import {flushSync} from 'react-dom';
import {PdfDialog} from './PilotRateconReview.jsx';
import {usePortalClient} from './PortalSession.jsx';
import {allRows,rows,loadOriginal,appointment,loadFields} from './portalData.js';
import {currentWeek,moveDay,formatDay,weekStart} from './financials.js';
import {parseUSDCents,settlementDisplay} from '../../lib/rr-lease/intake-contract.js';
import OperatorWallet,{WalletProof} from './OperatorWallet.jsx';
import CarrierControl from './Step3Carrier.jsx';
import DriverLoadAlerts from './DriverLoadAlerts.jsx';
import TrainingLoadCard, {trainingCardLoadId} from './TrainingLoadCard.jsx';
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

function PodUpload({loadId, loadNumber, brokerName, done, addendum=false}) {
  const client = usePortalClient();
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

  async function uploadOriginal(requestId) {
    const {uploadId} = await api(client, 'pod/create-upload', {
      requestId, loadId:loadId || null,
      ...(loadId ? {} : {broker:broker.trim(), loadNumber:number.trim()}),
      fileName:file.name, mimeType:file.type, byteSize:file.size,
    });
    return api(client, 'pod/commit-upload', file, {
      'Content-Type':file.type, 'X-Upload-Id':uploadId,
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (lock.current || opening || Scanner || !file) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const key = JSON.stringify([loadId, broker, number, file.name, file.size, file.lastModified]);
      if (intent.current?.key !== key) intent.current = {key, id:crypto.randomUUID()};
      const requestId = intent.current.id;
      const result = addendum
        ? await api(client, 'pod/addendum', file, {
            'Content-Type':file.type, 'X-Load-Id':loadId, 'X-Request-Id':requestId,
            'X-File-Name':encodeURIComponent(file.name),
          })
        : await uploadOriginal(requestId);
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
          {loadId && <small>{brokerName} · Load #{loadNumber}</small>}
        </div>
        {file.type === 'application/pdf' && <button type="button" ref={viewButton} aria-haspopup="dialog"
          disabled={busy || opening} onClick={() => setViewing(true)}>View PDF</button>}
        <button className={css.primary} type="submit" disabled={busy || opening}>
          {busy ? 'Uploading…' : 'Upload POD'}
        </button>
      </> : <small>PDF, JPEG, PNG or WebP · Up to 3 MiB</small>}
      {sent && <p role="status">{addendum ? 'Additional document received · pending office review' : 'POD received · pending office review'}</p>}
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
    <summary onClick={openAssignedUpload}>{addendum ? 'Add corrected POD' : 'Upload POD'}</summary>
    {content}
  </details>;
}
function Stop({label,address,at,zone,reference}){
 return <section className={css.stop}><small>{label}</small><strong>{address||'Address pending'}</strong><p>{appointment(at,zone)||'Appointment pending'}</p>{reference&&<p>Reference: {reference}</p>}{address&&<a target="_blank" rel="noreferrer" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(address)}>Open in Google Maps</a>}</section>;
}
function LoadDetails({load,pods,driverView,refresh,done,acceptsAddendum}){
 const c=usePortalClient(),docs=useRead(()=>rows(c.from('rr_lease_documents').select(docFields).eq('load_id',load.id).eq('is_ready',true).order('is_current',{ascending:false}).order('id')),[c,load.id,refresh]);
 const pending=pods.some(x=>x.review_status==='PENDING'),approved=pods.some(x=>x.review_status==='APPROVED'&&x.document_id===load.final_pod_id),rejected=!approved&&!pending&&pods.some(x=>x.review_status==='REJECTED');
 const pilot = driverView && load.id === trainingCardLoadId && load.status === 'assigned';
 const more = <>
 <h3>Broker rules</h3><dl className={css.pairs}>{['tracking','detention','layover','lumper','podDeadline'].map(k=><div key={k}><dt>{k==='podDeadline'?'POD deadline':k}</dt><dd>{load.broker_rules?.[k]||'Not confirmed'}</dd></div>)}</dl>
 {load.reefer_instructions&&<p>{load.reefer_instructions}</p>}{load.steps?.map((s,i)=><p key={i}><strong>{s.title}</strong> · {s.detail}</p>)}
 <p>{!pilot && <>Recorded gross: {money(load.gross_cents)} · </>}{load.payment_deadline?'Payment deadline '+formatDay(load.payment_deadline):'Payment deadline pending'}</p>
 {driverView && !pilot && <RateconDriverTest load={load} refresh={refresh}/>}
 <ReadState state={docs}>{ds=><div className={css.stack}>{ds.map(d=><OriginalLink key={d.id} id={d.id} label={d.kind==='ratecon'?'View Rate Con PDF':d.kind+' · '+d.file_name}/>)}</div>}</ReadState>
 {pods.filter(x=>x.review_status==='REJECTED').map(x=><p className={css.red} key={x.document_id}>Rejected: {x.rejection_reason}</p>)}
 {(acceptsAddendum || (load.load_type!=='TONU'&&['assigned','picked_up','delivered'].includes(load.status)&&load.billing_channel==='FIRSTLINE_FACTORED'))&&<PodUpload loadId={load.id} loadNumber={load.load_number} brokerName={load.broker_name} addendum={acceptsAddendum} done={done}/>}
 </>;
 if (pilot) return <TrainingLoadCard load={load} refresh={refresh} gross={money(load.gross_cents)}><div className={css.detail}>{more}</div></TrainingLoadCard>;
 return <details className={css.panel}><summary><span><strong>{load.load_number}</strong><small>{load.broker_name} · {load.status.replaceAll('_',' ')}</small></span><span className={load.load_type==='TONU'||approved?css.green:rejected?css.red:css.yellow}>{load.load_type==='TONU'?'TONU · cancelled':approved?'POD approved':rejected?'POD rejected':pending?'POD review':'Awaiting documents'}</span></summary><div className={css.detail}>
 <div className={css.grid}><Stop label="Pickup" address={load.pickup_address} at={load.pickup_at} zone={load.pickup_timezone} reference={load.pickup_number}/><Stop label="Delivery" address={load.delivery_address} at={load.delivery_at} zone={load.delivery_timezone} reference={load.delivery_number}/></div>
 {more}
 </div></details>;
}
function Loads({operator,driverView,refresh,done}){
 const c=usePortalClient(),state=useRead(async()=>{const [loads,pods]=await Promise.all([allRows(()=>c.from('rr_lease_loads').select(loadFields+',billing_channel,broker_rules,final_pod_id,ledger_mode,cancelled_at,load_type,tonu_confirmation_id').eq('operator_id',operator.id).order('updated_at',{ascending:false}).order('id')),rpc(c,'rr_lease_step3_pod_status',{p_operator_id:operator.id})]);return {loads,pods}},[c,operator.id,refresh],{keepWhileRefreshing:true});
 const corrections = useRead(async () => {
   const {data, error} = await c.rpc('rr_lease_pod_correction_loads', {p_operator_id:operator.id});
   if (error?.code === 'PGRST202' || error?.code === '42883') return [];
   if (error) throw Error('Could not check which deliveries accept corrections.');
   return data || [];
 }, [c,operator.id,refresh], {keepWhileRefreshing:true});
 const [week,setWeek]=useState(()=>currentWeek());
 return <div className={css.stack}><details className={css.panel}><summary>Upload POD without a load</summary><div className={css.detail}><PodUpload done={done}/></div></details>
 <ReadState state={state}>{({loads,pods})=>{
 const active=loads.filter(l=>['staging','assigned','picked_up'].includes(l.status));
 const history=loads.filter(l=>!active.includes(l)&&(((l.actual_delivery_date||l.cancelled_at?.slice(0,10))>=''+week&&(l.actual_delivery_date||l.cancelled_at?.slice(0,10))<moveDay(week,7))||(!l.actual_delivery_date&&pods.some(p=>p.load_id===l.id&&p.review_status==='REJECTED'))));
 const card=l=><LoadDetails acceptsAddendum={corrections.value?.includes(l.id) || false} key={l.id} load={l} pods={pods.filter(p=>p.load_id===l.id)} driverView={driverView} refresh={refresh} done={done}/>;
 return <><h2>Active loads</h2>{active.length?active.map(card):<p>No assigned loads.</p>}<label>Week<input type="date" value={week} onChange={e=>{if(e.target.value)setWeek(weekStart(e.target.value))}}/></label><h2>Delivery history</h2>{corrections.error&&<p role="alert">{corrections.error}</p>}{history.length?history.map(card):<p>No completed loads in this week.</p>}</>}}</ReadState></div>;
}
function DriverPay({operator,refresh}){
 const c=usePortalClient(),[selected,setSelected]=useState('');
 const data=useRead(()=>allRows(()=>c.from('rr_lease_settlement_totals').select('*').eq('operator_id',operator.id).order('week_start',{ascending:false}).order('settlement_id')),[c,operator.id,refresh]);
 const current=data.value?.find(s=>s.settlement_id===selected)||data.value?.[0];
 const ledger=useRead(()=>current?allRows(()=>c.from('v_driver_ledger_entries').select('*').eq('operator_id',operator.id).eq('settlement_id',current.settlement_id).order('created_at').order('id')):Promise.resolve([]),[c,operator.id,current?.settlement_id,refresh]);
 const taxes=useRead(()=>allRows(()=>c.from('rr_lease_adjustments').select('id,description,amount_cents,kind,intake_status,wallet_document_id,settlement_id').eq('operator_id',operator.id).eq('paid_by','operator').order('id')),[c,operator.id,refresh]);
 return <ReadState state={data}>{list=>{if(!current)return <p>No weekly settlements yet.</p>;let t;try{t=settlementDisplay(current)}catch{return <p role="alert">Totals require reconciliation. No estimated amount displayed.</p>}
 return <div className={css.stack}><label>Settlement week<select value={current.settlement_id} onChange={e=>setSelected(e.target.value)}>{list.map(s=><option key={s.settlement_id} value={s.settlement_id}>{s.week_start} · {s.status}</option>)}</select></label>
 <div className={css.payHero}><small>{current.status==='paid'?'Paid statement':current.status==='issued'?'Issued · locked':t.isConfirmed?'Confirmed payable · draft statement':'Estimated · pending verification'}</small><h2>{money(t.isConfirmed?t.netCents:t.estimatedNetCents)}</h2><p>Verified net: {money(t.verifiedNetCents)}</p>{t.negativeBalanceCents>0&&<p>Negative balance: {money(t.negativeBalanceCents)}</p>}</div>
 <dl className={css.pairs}>{[['Invoice gross',t.invoiceGrossCents],['Fee eligible gross',t.feeEligibleGrossCents],['Carrier commission',current.carrier_share_cents],['Carrier deductions',current.carrier_deduction_cents],['Lumper reimbursement · 0% fee',t.lumperCents],['Other credits',t.otherCreditsCents],['Driver-paid costs · tax records',current.operator_paid_cents]].map(([label,val])=><div key={label}><dt>{label}</dt><dd>{money(val)}</dd></div>)}</dl>
 <h2>Ledger entries</h2><ReadState state={ledger}>{rs=>rs.map(r=><article className={css.panel} key={r.id}><div className={css.detail}><strong>{r.entry_type.replaceAll('_',' ')} · {money(r.amount_cents)}</strong><p>{r.description}</p><span className={r.status==='POSTED'?css.green:css.yellow}>{r.status} · Driver effect {money(r.driver_effect_cents)}</span>{r.source_document_id?<OriginalLink id={r.source_document_id}/>:r.source_wallet_document_id?<OriginalLink id={r.source_wallet_document_id} operatorId={operator.id} wallet/>:<small>Carrier report / schedule · proof may require carrier review</small>}</div></article>)}</ReadState>
 <h2>Tax folder · driver-paid expenses</h2><ReadState state={taxes}>{rs=>rs.length?rs.map(r=><article className={css.panel} key={r.id}><div className={css.detail}><strong>{r.description} · {money(r.amount_cents)}</strong><p>{r.intake_status} · No settlement deduction</p>{r.wallet_document_id&&<WalletProof operatorId={operator.id} documentId={r.wallet_document_id}/>}</div></article>):<p>No recorded driver-paid receipts.</p>}</ReadState></div>}}</ReadState>;
}
export function CompanyNumbers({week,refresh,ownOnly=false}){
 const c=usePortalClient(),state=useRead(()=>rpc(c,'rr_lease_step3_company_summary',{p_week:week}),[c,week,refresh]);
 return <ReadState state={state}>{s=><div className={css.stack}><dl className={css.pairs}>{[['Own truck verified revenue',s.ownGrossCents],['Own recorded expenses',s.recordedOwnExpensesCents],['Own recorded margin',s.ownRecordedMarginCents],...(!ownOnly?[['Leased operator commissions',s.commissionCents],['Verified FirstLine fees',s.verifiedFirstLineFeesCents],['Recorded company margin',s.recordedMarginCents]]:[])].map(([label,val])=><div key={label}><dt>{label}</dt><dd>{money(val)}</dd></div>)}</dl>{!ownOnly&&<p className={css.yellow}>{s.pendingFirstLineEvents} factor events pending review. Recorded margin excludes unrecorded costs and unverified events; full net profit is not yet confirmed.</p>}</div>}</ReadState>;
}
function OwnPay({refresh}){const [week,setWeek]=useState(()=>currentWeek());return <div className={css.stack}><p>Own truck · 100% company revenue. No contractor settlement.</p><label>Monday week start<input type="date" value={week} onChange={e=>{if(e.target.value)setWeek(weekStart(e.target.value))}}/></label><CompanyNumbers week={week} refresh={refresh} ownOnly/></div>}
export default function Step3Workspace({operator,session,operators}){
 const [tab,setTab]=useState('load'),[refresh,setRefresh]=useState(0),[dark,setDark]=useState(true);
 const own=operator.workspace_kind==='carrier'&&operator.carrier_user_id===session.user.id;
 const company=operators.some(o=>o.workspace_kind==='carrier'&&o.carrier_user_id===session.user.id);
 const driverView=operator.workspace_kind==='leased' && operator.driver_user_id===session.user.id;
 const [podLoadId,setPodLoadId]=useState(null);
 useEffect(()=>{
   if (!company) return;
   const value=new URL(window.location.href).searchParams.get('podInvoice');
   if (value && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) {
     setPodLoadId(value);
     setTab('company');
   }
 },[company,session.user.id]);
 function clearPodLoad(){
   if (!podLoadId) return;
   setPodLoadId(null);
   const url=new URL(window.location.href);
   url.searchParams.delete('podInvoice');
   window.history.replaceState(window.history.state,'',url);
 }
 const reload=()=>setRefresh(n=>n+1);
 return <section className={css.shell} data-theme={dark?'dark':'light'}>
 <header className={css.hero}><div><small>{operator.driver_name}</small><h1>{operator.company_name}</h1></div><button type="button" aria-pressed={dark} onClick={()=>setDark(v=>!v)}>{dark?'Light mode':'Dark mode'}</button></header>
 <nav className={css.tabs} aria-label="Operator tabs">{[['load','LOAD'],['pay','PAY'],['docs','DOCS'],['truck','TRUCK']].map(([key,label])=><button key={key} aria-pressed={tab===key} type="button" onClick={()=>{clearPodLoad();setTab(key)}}>{label}</button>)}</nav>
 {company&&<button className={css.companySwitch} type="button" aria-pressed={tab==='company'} onClick={()=>{clearPodLoad();setTab('company')}}>Company control</button>}
 <div className={css.content}><div className={css.bar}><small>{tab==='company'?'Private carrier controls':operator.company_name}</small><button type="button" onClick={reload}>Refresh</button></div>
 {driverView&&<DriverLoadAlerts key={operator.id} operatorId={operator.id} onRefresh={reload}/>}
 {tab==='load'&&<Loads operator={operator} driverView={driverView} refresh={refresh} done={reload}/>}
 {tab==='pay'&&(own?<OwnPay refresh={refresh}/>:<DriverPay operator={operator} refresh={refresh}/>)}
 {tab==='docs'&&<><DotOffline operator={operator} userId={session.user.id} refresh={refresh}/><OperatorWallet operatorId={operator.id} refresh={refresh}/></>}
 {tab==='truck'&&<TruckTools operator={operator} refresh={refresh} done={reload}/>}
 {tab==='company'&&company&&<CarrierControl operators={operators.filter(o=>o.carrier_user_id===session.user.id)} refresh={refresh} done={reload} podLoadId={podLoadId} onClearPodLoad={clearPodLoad}/>}
 </div></section>;
}
