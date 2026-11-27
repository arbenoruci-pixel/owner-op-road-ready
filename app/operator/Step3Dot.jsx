'use client';
import React,{useEffect,useState} from 'react';
import {usePortalClient} from './PortalSession.jsx';
import {allRows,loadOriginal} from './portalData.js';
import {sealDotPack,openDotPack,dotStore,base64Bytes} from './dotCache.js';
import {Action,ReadState,useRead} from './Step3Workspace.jsx';
import css from './step3.module.css';
const fields='id,category,slot_key,title,file_name,mime_type,byte_size,sha256,chunk_count,is_ready,is_current,expires_on';
const road=new Set(['license','medical','registration','inspection','insurance','permit','lease','carrier_document']);
const today=()=>new Date().toISOString().slice(0,10);
function traffic(d){if(!d.expires_on)return ['Expiry not recorded',css.yellow];if(d.expires_on<today())return ['Expired',css.red];const days=Math.floor((Date.parse(d.expires_on)-Date.parse(today()))/86400000);return days<=30?['Expires within 30 days',css.yellow]:['Current',css.green]}
function OfflineFile({d}){const [url,setUrl]=useState('');useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);return <div className={css.panel}><div className={css.detail}><strong>{d.title}</strong><span className={traffic(d)[1]}>{traffic(d)[0]} · {d.expires_on||'Unknown expiry'}</span>{url?<><a href={url} target="_blank" rel="noreferrer">View original</a><button type="button" onClick={()=>setUrl('')}>Close document</button>{d.mime_type.startsWith('image/')&&<img style={{maxWidth:'100%'}} src={url} alt={d.title}/>}</>:<button type="button" onClick={()=>{const bytes=Uint8Array.from(atob(d.bytes),x=>x.charCodeAt(0));setUrl(URL.createObjectURL(new Blob([bytes],{type:d.mime_type})))}}>Open original</button>}</div></div>}
export default function DotOffline({operator,userId,refresh}){
 const c=usePortalClient(),scope=userId+':'+operator.id,[pin,setPin]=useState(''),[selected,setSelected]=useState([]),[pack,setPack]=useState(null),[opened,setOpened]=useState(false),[cached,setCached]=useState(false),[error,setError]=useState('');
 const docs=useRead(()=>allRows(()=>c.from('rr_lease_wallet_documents').select(fields).eq('operator_id',operator.id).eq('is_ready',true).eq('is_current',true).order('id')),[c,operator.id,refresh]);
 useEffect(()=>{let active=true;dotStore(scope,'get').then(v=>{if(active)setCached(Boolean(v))}).catch(()=>{});return()=>{active=false}},[scope]);
 useEffect(()=>{if(!pack)return;const lock=()=>{setPack(null);setPin('')};const timer=setTimeout(lock,5*60*1000);const hide=()=>{if(document.visibilityState!=='visible')lock()};document.addEventListener('visibilitychange',hide);return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',hide)}},[pack]);
 async function save(){
  const {data,error}=await c.auth.getUser();if(error||data?.user?.id!==userId)throw Error('Online sign-in required to prepare cache');
  const ds=docs.value?.filter(d=>selected.includes(d.id)&&road.has(d.category));
  if(ds?.length!==6)throw Error('Select six road documents');const originals=[];
  for(const d of ds){const blob=await loadOriginal(c,{...d,storage_backend:'database'},'rr_lease_wallet_download_chunk');if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(blob.type))throw Error('Unsupported offline original');originals.push({...d,bytes:base64Bytes(new Uint8Array(await blob.arrayBuffer()))})}
  await dotStore(scope,'put',await sealDotPack(scope,pin,originals));setPin('');setCached(true);
 }
 return <section className={css.panel}><div className={css.detail}> <button className={css.primary} type="button" onClick={()=>{setOpened(true);setPack(null);setPin('');setError('')}}>DOT Inspection Mode</button><small>{cached?'Encrypted pack saved on this device':'Prepare a pack while online'}</small>
 <details><summary>Road document status</summary><p>Expiry indicators for current originals. Confirm requirements for your truck and route.</p>
 <ReadState state={docs}>{ds=>ds.filter(d=>road.has(d.category)||['2290','ifta'].some(k=>d.slot_key?.toLowerCase().includes(k))).map(d=><div className={css.bar} key={d.id}><span>{d.title}</span><span className={traffic(d)[1]}>{traffic(d)[0]} · {d.expires_on||'No date'}</span></div>)}</ReadState>
</details>
 <details><summary>Prepare six-document offline DOT pack</summary><div className={css.stack}><p>Choose six current road originals and a separate local PIN. Only encrypted originals are stored on this device. This is a selected document pack; it does not certify inspection compliance. Keep paper copies or Files available.</p><ReadState state={docs}>{ds=>ds.filter(d=>road.has(d.category)).map(d=><label key={d.id} className={css.checkbox}><input type="checkbox" checked={selected.includes(d.id)} disabled={!selected.includes(d.id)&&selected.length>=6} onChange={e=>setSelected(xs=>e.target.checked?[...xs,d.id]:xs.filter(x=>x!==d.id))}/>{d.title}</label>)}</ReadState><label>DOT PIN<input type="password" inputMode="numeric" minLength={6} maxLength={12} autoComplete="off" value={pin} onChange={e=>setPin(e.target.value)}/></label><Action run={save}>Encrypt and save six originals</Action>{cached&&<Action run={async()=>{await dotStore(scope,'delete');setCached(false);setPack(null);setPin('')}}>Remove offline pack from device</Action>}</div></details>
</div>
 {opened&&<div className={css.dotOverlay} role="dialog" aria-modal="true" aria-label="DOT inspection mode"><div className={css.stack}><div className={css.bar}><h2>DOT Inspection Mode</h2><button type="button" onClick={()=>{setOpened(false);setPack(null);setPin('')}}>Exit</button></div>{pack?<><p>Offline copy prepared {new Date(pack.createdAt).toLocaleString()}. Confirm freshness when online.</p><button type="button" onClick={()=>{setPack(null);setPin('')}}>Lock</button>{pack.docs.map(d=><OfflineFile key={d.id} d={d}/>)}</>:<form className={css.form} onSubmit={async e=>{e.preventDefault();setError('');try{setPack(await openDotPack(scope,pin,await dotStore(scope,'get')));setPin('')}catch{setError('Incorrect PIN or no saved pack');setPin('')}}}><label>Unlock DOT documents<input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e=>setPin(e.target.value)}/></label><button className={css.primary}>Unlock</button>{error&&<p role="alert">{error}</p>}</form>}</div></div>}</section>;
}
