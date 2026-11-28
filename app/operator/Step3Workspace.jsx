'use client';
import React,{useEffect,useState,useRef} from 'react';
import {flushSync} from 'react-dom';
import {trackPodUpload} from './operatorUpdate.js';
import {confirmedPodMessage, podUploadMessage, sendReservedPod} from './podUpload.js';
import PilotRateconReview, {PdfDialog} from './PilotRateconReview.jsx';
import {usePortalClient} from './PortalSession.jsx';
import {allRows,rows,loadOriginal,appointment,loadFields} from './portalData.js';
import {currentWeek,moveDay,formatDay,weekStart} from './financials.js';
import DriverPay, {OwnPay} from './DriverPay.jsx';
import OperatorWallet from './OperatorWallet.jsx';
import CarrierControl from './Step3Carrier.jsx';
import DriverLoadAlerts from './DriverLoadAlerts.jsx';
import DriverNotices from './DriverNotices.jsx';
import DriverPassword from './DriverPassword.jsx';
import LoadCard from './TrainingLoadCard.jsx';
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

function PodUpload({loadId, loadNumber, brokerName, done, addendum=false, needsCorrection=false, transportFile, onFilePicked}) {
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
  const form = useRef(null);
  const fileInput = useRef(null);
  const chooseButton = useRef(null);
  const scannerPending = useRef(false);
  const scanButton = useRef(null);
  const submitButton = useRef(null);
  const errorBox = useRef(null);
  const viewButton = useRef(null);
  const intent = useRef(null);
  const lock = useRef(false);

  useEffect(() => {
    if (!error || !errorBox.current) return;
    errorBox.current.focus({preventScroll:true});
    const target = errorBox.current.closest('[data-pod-submit]') || errorBox.current;
    target.scrollIntoView({block:'center'});
  }, [error]);

  function selectFile(next) {
    if (!podFileTypes.includes(next.type) || next.size < 1 || next.size > 3 * 1024 * 1024) {
      throw Error('Choose a PDF, JPEG, PNG or WebP file up to 3 MiB.');
    }
    setFile(next);
    intent.current = null;
    setError('');
    setSent(false);
    requestAnimationFrame(() => {
      const button = submitButton.current;
      if (!button) return;
      button.focus({preventScroll:true});
      button.scrollIntoView({block:'center'});
    });
  }

  async function openScanner() {
    if (!canScan || scannerPending.current || Scanner || lock.current) return;
    if (!loadId && !form.current.reportValidity()) return;
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
    if (disclosure.open || file || transportFile || !canScan) return;
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

  async function sendPod(original) {
    if (lock.current) throw Error('An upload is already in progress.');
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const reference = JSON.stringify([loadId, broker.trim(), number.trim()]);
      if (intent.current?.file !== original || intent.current.reference !== reference) {
        intent.current = {file:original, reference, id:crypto.randomUUID()};
      }
      const result = await trackPodUpload(addendum
        ? api(client, 'pod/addendum', original, {
            'Content-Type':original.type, 'X-Load-Id':loadId, 'X-Request-Id':intent.current.id,
            'X-File-Name':encodeURIComponent(original.name),
          })
        : sendReservedPod(intent.current, async requestId => {
            const {uploadId} = await api(client, 'pod/create-upload', {
              requestId, loadId:loadId || null,
              ...(loadId ? {} : {broker:broker.trim(), loadNumber:number.trim()}),
              fileName:original.name, mimeType:original.type, byteSize:original.size,
            });
            return api(client, 'pod/commit-upload', original, {
              'Content-Type':original.type, 'X-Upload-Id':uploadId,
            });
          }));
      const message = confirmedPodMessage(result, loadId);
      setSent(true);
      setFile(null);
      intent.current = null;
      done({message, loadNumber:loadNumber || number.trim(), fileName:original.name});
    } catch (cause) {
      throw Error(podUploadMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (lock.current || opening || Scanner || !file) return;
    try { await sendPod(file); }
    catch (cause) { setError(cause.message); }
  }

  async function uploadScan(reviewedPdf) {
    await sendPod(reviewedPdf);
    setScanner(null);
  }

  const content = <>
    <form ref={form} className={css.form} onSubmit={submit} data-operator-update-pending={Boolean(file || busy || opening || Scanner || viewing || (!sent && (broker || number)))}>
      {!loadId && <>
        <p>No rate confirmation yet? Enter the exact broker and load number. Gross stays unknown.</p>
        <label>Broker<input required pattern={'.*\\S.*'} disabled={busy} maxLength={200} value={broker} onChange={e => setBroker(e.target.value)}/></label>
        <label>Load number<input required pattern={'.*\\S.*'} disabled={busy} maxLength={120} value={number} onChange={e => setNumber(e.target.value)}/></label>
      </>}
      <input ref={fileInput} type="file" hidden accept={podFileTypes.join(',')} aria-label="Choose signed POD file"
        onChange={e => {
          const next = e.target.files?.[0];
          e.target.value = '';
          if (!next) return;
          try { selectFile(next); }
          catch (err) { setSent(false); setError(err.message); }
        }}/>
      {file ? <>
        <div role="status" className={css.podSelection}>
          <small>{busy ? 'Uploading POD' : 'Ready to upload'}</small><strong>{file.name}</strong>
          {loadId && <small>{brokerName} · Load #{loadNumber}</small>}
        </div>
        <div data-pod-submit="" className={css.podSubmit}>
          {error && <p ref={errorBox} tabIndex={-1} role="alert" className={css.podError}>{error}</p>}
          <button ref={submitButton} className={css.primary} type="submit" disabled={busy || opening}>
            {busy ? 'Uploading…' : 'Upload POD'}
          </button>
        </div>
        {file.type === 'application/pdf' && <button type="button" ref={viewButton} aria-haspopup="dialog"
          disabled={busy || opening} onClick={() => setViewing(true)}>View PDF</button>}
      </> : <small>PDF, JPEG, PNG or WebP · Up to 3 MiB</small>}
      {!file && transportFile && loadId && <button type="button" className={css.primary} onClick={()=>{
        try { selectFile(transportFile); onFilePicked(); }
        catch (err) { setError(err.message); }
      }}>Use scanned BOL for load #{loadNumber}</button>}
      <div className={css.podSources}>
        {canScan && <button type="button" className={file ? undefined : css.primary} ref={scanButton} aria-haspopup="dialog"
          disabled={busy || opening} onClick={openScanner}>{opening ? 'Opening scanner…' : 'Scan POD'}</button>}
        <button type="button" ref={chooseButton} disabled={busy || opening} onClick={() => fileInput.current.click()}>Choose file</button>
      </div>
      {!file && error && <p ref={errorBox} tabIndex={-1} role="alert" className={css.podError}>{error}</p>}
    </form>
    {viewing && file && <PdfDialog heading="Signed POD" cachedBlob={file} onClose={() => {
      setViewing(false);
      requestAnimationFrame(() => viewButton.current?.focus({preventScroll:true}));
    }}/>}
    {Scanner && <Scanner loadLabel={loadNumber || number.trim()} onChooseFile={chooseOriginalFromScanner} onCancel={() => closeScanner(scanButton)} onUpload={uploadScan}/>}
  </>;
  if (!loadId) return content;
  if (file) return <div className={css.uploadControl}>{content}</div>;
  return <details className={css.uploadControl}>
    <summary onClick={openAssignedUpload}>{addendum || needsCorrection ? 'Add corrected POD' : 'Add POD'}</summary>
    {content}
  </details>;
}
function Stop({label,address,at,zone,reference}){
 return <section className={css.stop}><small>{label}</small><strong>{address||'Address pending'}</strong><p>{appointment(at,zone)||'Appointment pending'}</p>{reference&&<p>Reference: {reference}</p>}{address&&<a target="_blank" rel="noreferrer" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(address)}>Open in Google Maps</a>}</section>;
}
function LoadDetails({load,pods,driverView,refresh,done,acceptsAddendum,initialOpen,transportFile,onFilePicked}){
 const c=usePortalClient(),docs=useRead(()=>rows(c.from('rr_lease_documents').select(docFields).eq('load_id',load.id).eq('is_ready',true).order('is_current',{ascending:false}).order('id')),[c,load.id,refresh]);
 const pending=pods.some(x=>x.review_status==='PENDING'),approved=pods.some(x=>x.review_status==='APPROVED'&&x.document_id===load.final_pod_id),rejected=!approved&&!pending&&pods.some(x=>x.review_status==='REJECTED');
 const ratecon = docs.value?.find(d => d.kind === 'ratecon' && d.is_current && d.mime_type === 'application/pdf');
 const [review,setReview] = useState(null);
 const cacheReview = React.useCallback(result => setReview({...result,id:ratecon?.id}), [ratecon?.id]);
 const podStatus = pending || approved ? 'POD received' : rejected ? 'POD needs correction' : '';
 const status = load.load_type==='TONU'?'TONU · cancelled':load.status.replaceAll('_',' ');
 const pod = (acceptsAddendum || (load.load_type!=='TONU' && ['assigned','picked_up','delivered'].includes(load.status) && load.billing_channel==='FIRSTLINE_FACTORED'))
   && <PodUpload loadId={load.id} loadNumber={load.load_number} brokerName={load.broker_name} needsCorrection={rejected} addendum={acceptsAddendum} done={done} transportFile={transportFile} onFilePicked={onFilePicked}/>;
 const more = <>
 <h3>Broker rules</h3><dl className={css.pairs}>{['tracking','detention','layover','lumper','podDeadline'].map(k=><div key={k}><dt>{k==='podDeadline'?'POD deadline':k}</dt><dd>{load.broker_rules?.[k]||'Not confirmed'}</dd></div>)}</dl>
 {load.reefer_instructions&&<p>{load.reefer_instructions}</p>}{load.steps?.map((s,i)=><p key={i}><strong>{s.title}</strong> · {s.detail}</p>)}
 <p>{!driverView && <>Recorded gross: {money(load.gross_cents)} · </>}{load.payment_deadline?'Payment deadline '+formatDay(load.payment_deadline):'Payment deadline pending'}</p>
 <ReadState state={docs}>{ds=><div className={css.stack}>{ds.map(d=><OriginalLink key={d.id} id={d.id} label={d.kind==='ratecon' && !driverView?'View Rate Con PDF':d.kind+' · '+d.file_name}/>)}</div>}</ReadState>
 {pods.filter(x=>x.review_status==='REJECTED').map(x=><p className={css.red} key={x.document_id}>Rejected: {x.rejection_reason}</p>)}
 </>;
 if (driverView) return <RateconDriverTest load={load} refresh={refresh}>{acceptance => {
   const controls = <>
     {acceptance?.control || (ratecon && <PilotRateconReview key={ratecon.id} client={c} doc={ratecon} review={review?.id===ratecon.id?review:null} onReviewed={cacheReview} label="Rate Con PDF"/>)}
     {acceptance?.issue}
     {pod}
   </>;
   return <LoadCard load={load} status={acceptance?.status || status} podStatus={podStatus} controls={controls} initialOpen={initialOpen} gross={money(load.gross_cents)}>
     {acceptance?.broker}{more}
   </LoadCard>;
 }}</RateconDriverTest>;
 return <details className={css.panel}><summary><span><strong>{load.load_number}</strong><small>{load.broker_name} · {load.status.replaceAll('_',' ')}</small></span><span className={load.load_type==='TONU'||approved?css.green:rejected?css.red:css.yellow}>{load.load_type==='TONU'?'TONU · cancelled':approved?'POD approved':rejected?'POD rejected':pending?'POD review':'Awaiting documents'}</span></summary><div className={css.detail}>
 <div className={css.grid}><Stop label="Pickup" address={load.pickup_address} at={load.pickup_at} zone={load.pickup_timezone} reference={load.pickup_number}/><Stop label="Delivery" address={load.delivery_address} at={load.delivery_at} zone={load.delivery_timezone} reference={load.delivery_number}/></div>
 {more}{pod}
 </div></details>;
}
function Loads({operator,driverView,refresh,done,transportFile,onFilePicked}){
 const c=usePortalClient(),state=useRead(async()=>{const [loads,pods]=await Promise.all([allRows(()=>c.from('rr_lease_loads').select(loadFields+',billing_channel,broker_rules,final_pod_id,ledger_mode,cancelled_at,load_type,tonu_confirmation_id').eq('operator_id',operator.id).order('updated_at',{ascending:false}).order('id')),rpc(c,'rr_lease_step3_pod_status',{p_operator_id:operator.id})]);return {loads,pods}},[c,operator.id,refresh],{keepWhileRefreshing:true});
 const corrections = useRead(async () => {
   const {data, error} = await c.rpc('rr_lease_pod_correction_loads', {p_operator_id:operator.id});
   if (error?.code === 'PGRST202' || error?.code === '42883') return [];
   if (error) throw Error('Could not check which deliveries accept corrections.');
   return data || [];
 }, [c,operator.id,refresh], {keepWhileRefreshing:true});
 const [week,setWeek]=useState(()=>currentWeek());
 const unassignedUpload = <details className={css.panel}><summary>Add POD without a load</summary><div className={css.detail}><PodUpload done={done}/></div></details>;
 return <div className={css.stack}>
 {transportFile && <aside className={css.podReceipt} data-operator-update-pending="true">
   <div role="status"><strong>Choose the load for this BOL</strong><small>Open Add POD on the matching load to use your scan.</small></div>
   <button type="button" onClick={onFilePicked}>Dismiss scan</button>
 </aside>}
 {!driverView && unassignedUpload}
 <ReadState state={state}>{({loads,pods})=>{
 const active=loads.filter(l=>['staging','assigned','picked_up'].includes(l.status));
 const history=loads.filter(l=>!active.includes(l)&&(((l.actual_delivery_date||l.cancelled_at?.slice(0,10))>=''+week&&(l.actual_delivery_date||l.cancelled_at?.slice(0,10))<moveDay(week,7))||(!l.actual_delivery_date&&pods.some(p=>p.load_id===l.id&&p.review_status==='REJECTED'))));
 const card=l=><LoadDetails initialOpen={l.id===active[0]?.id} acceptsAddendum={corrections.value?.includes(l.id) || false} key={l.id} load={l} transportFile={transportFile} onFilePicked={onFilePicked} pods={pods.filter(p=>p.load_id===l.id)} driverView={driverView} refresh={refresh} done={done}/>;
 const historyWeek=<label>Week<input type="date" value={week} onChange={e=>{if(e.target.value)setWeek(weekStart(e.target.value))}}/></label>;
 const previous=<>{corrections.error&&<p role="alert">{corrections.error}</p>}{history.length?history.map(card):<p>No completed loads in this week.</p>}</>;
 return <><h2>Active loads</h2>{active.length?active.map(card):<p>No assigned loads.</p>}
   {driverView ? <details className={css.panel}><summary>Delivery history</summary><div className={css.detail}>{historyWeek}{previous}</div></details>
     : <>{historyWeek}<h2>Delivery history</h2>{previous}</>}
 </>}}</ReadState>{driverView && unassignedUpload}</div>;
}
export function CompanyNumbers({week,refresh,ownOnly=false}){
 const c=usePortalClient(),state=useRead(()=>rpc(c,'rr_lease_step3_company_summary',{p_week:week}),[c,week,refresh]);
 return <ReadState state={state}>{s=><div className={css.stack}><dl className={css.pairs}>{[['Own truck verified revenue',s.ownGrossCents],['Own recorded expenses',s.recordedOwnExpensesCents],['Own recorded margin',s.ownRecordedMarginCents],...(!ownOnly?[['Leased operator commissions',s.commissionCents],['Verified FirstLine fees',s.verifiedFirstLineFeesCents],['Recorded company margin',s.recordedMarginCents]]:[])].map(([label,val])=><div key={label}><dt>{label}</dt><dd>{money(val)}</dd></div>)}</dl>{!ownOnly&&<p className={css.yellow}>{s.pendingFirstLineEvents} factor events pending review. Recorded margin excludes unrecorded costs and unverified events; full net profit is not yet confirmed.</p>}</div>}</ReadState>;
}
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
 const profile=useRef(null);
 useEffect(()=>{
   if (!driverView) return;
   const dismiss=e=>{if(!profile.current?.open)return;
     if(e.type==='keydown' && e.key==='Escape'){profile.current.open=false;profile.current.querySelector('summary').focus();}
     if(e.type==='pointerdown' && !profile.current.contains(e.target))profile.current.open=false;
   };
   document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',dismiss);
   return ()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',dismiss)};
 },[driverView]);
 const [noticeTarget,setNoticeTarget]=useState(null);
 const [receipt,setReceipt]=useState(null);
 const [transportFile,setTransportFile]=useState(null);
 const [truckScan,setTruckScan]=useState(null);
 const reload=()=>setRefresh(n=>n+1);
 function selectTab(key){
   clearPodLoad();
   if (profile.current) profile.current.open=false;
   setTab(key);
   window.scrollTo(0,0);
 }
 const driverNavigation = <>
 <header className={css.topRow}>
   <h1 className={css.wordmark}>RoadReady</h1>
   <details className={css.profile} ref={profile}><summary>Profile</summary>
     <div className={css.profileMenu}><strong>{operator.driver_name}</strong><small>{operator.company_name}</small>
       {workspacePicker}
       <button type="button" onClick={()=>setDark(v=>!v)}>{dark?'Light mode':'Dark mode'}</button>
       <button type="button" onClick={reload}>Refresh</button>
       <DriverLoadAlerts key={operator.id} operatorId={operator.id} onRefresh={reload} noticeTarget={noticeTarget}/>
       {company&&<button type="button" onClick={()=>selectTab('company')}>Company control</button>}
       {session.user.email && <DriverPassword key={session.user.id} email={session.user.email} />}
       <button type="button" onClick={onSignOut}>Sign out</button>
     </div>
   </details>
 </header>
 <nav className={css.bottomTabs} aria-label="Operator tabs" data-operator-navigation>
   {driverTabs.map(({key,label,icon})=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>selectTab(key)}>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icon}</svg>
     <span>{label}</span>
   </button>)}
 </nav>
 <div ref={setNoticeTarget} />
 <DriverNotices key={operator.id} operatorId={operator.id}/>
 </>;

 return <section className={driverView ? css.shell+' '+css.driverShell : css.shell} data-driver-portal={driverView || undefined} data-operator-update-pending={transportFile ? 'true' : undefined} data-operator-passive-view={Boolean((own || driverView) && (tab === 'load' || tab === 'pay'))} data-theme={dark?'dark':'light'}>
 {driverView ? driverNavigation : <>
 <header className={css.hero}><div><small>{operator.driver_name}</small><h1>{operator.company_name}</h1></div><button type="button" aria-pressed={dark} onClick={()=>setDark(v=>!v)}>{dark?'Light mode':'Dark mode'}</button></header>
 <nav className={css.tabs} aria-label="Operator tabs" data-operator-navigation>{[['load','LOAD'],['pay','PAY'],['docs','DOCS'],['truck','TRUCK']].map(([key,label])=><button key={key} aria-pressed={tab===key} type="button" onClick={()=>{clearPodLoad();setTab(key)}}>{label}</button>)}</nav>
 {company&&<button className={css.companySwitch} type="button" aria-pressed={tab==='company'} onClick={()=>{clearPodLoad();setTab('company')}}>Company control</button>}
 </>}
 <div className={css.content}>{!driverView&&<div className={css.bar}><small>{tab==='company'?'Private carrier controls':operator.company_name}</small><button type="button" onClick={reload}>Refresh</button></div>}
 {receipt && <aside className={css.podReceipt} aria-label="POD upload receipt">
   <div role="status"><strong>{receipt.message}</strong><small>Load #{receipt.loadNumber} · {receipt.fileName}</small></div>
   <button type="button" aria-label="Dismiss upload receipt" onClick={() => setReceipt(null)}>Close</button>
 </aside>}
 {tab==='load'&&<Loads transportFile={transportFile} onFilePicked={()=>setTransportFile(null)} operator={operator} driverView={driverView} refresh={refresh} done={received=>{setReceipt(received);reload()}}/>}
 {tab==='pay'&&(own?<OwnPay refresh={refresh}/>:<DriverPay operator={operator} refresh={refresh}/>)}
 {tab==='docs' && (driverView ? <>
   <OperatorWallet operatorId={operator.id} refresh={refresh} portal/>
   <DotOffline operator={operator} userId={session.user.id} refresh={refresh} walletShown/>
 </> : <><DotOffline operator={operator} userId={session.user.id} refresh={refresh}/><OperatorWallet operatorId={operator.id} refresh={refresh}/></>)}
 {tab!=='truck' && truckScan && <aside className={css.podReceipt} aria-label="Maintenance receipt">
   <div role="status">{truckScan.phase==='saved' ? truckScan.message : truckScan.phase==='reading' ? 'Reading receipt…' :
     truckScan.phase==='saving' ? 'Saving receipt…' : 'Maintenance receipt needs your attention.'}</div>
   <button type="button" onClick={()=>selectTab('truck')}>View receipt</button>
   {truckScan.phase==='saved'&&<button type="button" onClick={()=>setTruckScan(null)}>Dismiss</button>}
 </aside>}
 {(tab==='truck'||truckScan)&&<div hidden={tab!=='truck'}><TruckTools operator={operator} refresh={refresh} done={reload} onScanStatus={setTruckScan}
   onChooseLoad={file=>{setTransportFile(file);selectTab('load')}}/></div>}
 {tab==='company'&&company&&<CarrierControl operators={operators.filter(o=>o.carrier_user_id===session.user.id)} refresh={refresh} done={reload} podLoadId={podLoadId} onClearPodLoad={clearPodLoad}/>}
 </div></section>;
}
