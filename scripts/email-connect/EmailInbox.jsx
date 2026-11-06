'use client';
import React,{useEffect,useRef,useState} from 'react';
import {emailApi,readEmailDocument,retryEmailReceipts} from '../../../../lib/email-import/client.js';
import styles from './EmailInbox.module.css';

export default function EmailInbox({onClose,onReady}){
  const [status,setStatus]=useState(null),[folder,setFolder]=useState('inbox'),[items,setItems]=useState([]),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState('');
  const request=useRef(null),generation=useRef(0);
  function start(){request.current?.abort();const controller=new AbortController();request.current=controller;const id=++generation.current;setBusy(true);setError('');setNotice('');return {id,signal:controller.signal};}
  async function run(work){const context=start();try{await work(context);}catch(e){if(context.id===generation.current&&e.name!=='AbortError')setError(e.message);}finally{if(context.id===generation.current)setBusy(false);}}
  async function list(account,nextFolder,nextCursor,context){
    const result=await emailApi('list',{connectionId:account.connectionId,folder:nextFolder,cursor:nextCursor},context.signal);
    if(context.id!==generation.current)return;
    setItems(old=>nextCursor?[...old,...result.items.filter(item=>!old.some(o=>o.messageId===item.messageId&&o.attachmentId===item.attachmentId))]:result.items);
    setCursor(result.nextCursor);if(!result.items.length)setNotice(nextCursor?'No documents in this page. You can continue to older emails.':'No PDF or photo attachments in this page.');
  }
  function refresh(){return run(async context=>{const value=await emailApi('status',undefined,context.signal);if(context.id!==generation.current)return;setStatus(value);if(value.connected){await retryEmailReceipts(context.signal);await list(value,folder,null,context);}});}
  useEffect(()=>{void refresh();return()=>{generation.current++;request.current?.abort();};},[]);
  function changeFolder(next){setFolder(next);setItems([]);setCursor(null);setQuery('');void run(context=>list(status,next,null,context));}
  async function choose(item){await run(async context=>{
    const result=await readEmailDocument(item,status.connectionId,context.signal);if(context.id!==generation.current)return;
    if(result.duplicate){setNotice('Already saved in Documents. This copy was skipped.');return;}
    onReady(result.file,'auto',{source:'email-import',imported:true,originalFileName:result.file.name,emailImport:result.provenance});
  });}
  const visible=items.filter(item=>[item.name,item.subject,item.sender].join(' ').toLowerCase().includes(query.toLowerCase()));
  return <section className={styles.screen} aria-label="Documents from email">
    <header><button type="button" onClick={onClose}>Back</button><div><small>SMART SCAN</small><h1>Documents from email</h1></div></header>
    <p>Choose a RateCon, POD or other attachment. Check the reading and load before saving.</p>
    {error&&<div role="alert" className={styles.message}>{error}<button type="button" disabled={busy} onClick={refresh}>Try again</button></div>}
    {status&&!status.configured?<div className={styles.card}><h2>Outlook setup is in progress</h2><p>Email connection will be available after the one-time Microsoft setup.</p><p>You can save the attachment from Outlook and use Choose a file today.</p><button type="button" onClick={onClose}>Choose a file</button></div>:null}
    {status?.configured&&!status.connected?<div className={styles.card}><h2>Connect Outlook / Hotmail</h2><p>Allow Road Ready to read your email attachments. You choose which documents to import.</p><p>No sending, deleting or marking email as read.</p><button className={styles.primary} type="button" disabled={busy} onClick={()=>run(async context=>{const result=await emailApi('connect',{},context.signal);if(context.id===generation.current)window.location.assign(result.authorizeUrl);})}>Connect Outlook</button></div>:null}
    {status?.connected?<>
      <div className={styles.account}><span>{status.account.email}</span><button type="button" disabled={busy} onClick={()=>run(async context=>{await emailApi('disconnect',{},context.signal);if(context.id!==generation.current)return;setStatus({...status,connected:false});setItems([]);setCursor(null);})}>Disconnect</button></div>
      <div className={styles.tabs} aria-label="Email folders">{[['inbox','Inbox'],['sentitems','Sent']].map(([value,label])=><button type="button" key={value} aria-pressed={folder===value} disabled={busy} onClick={()=>changeFolder(value)}>{label}</button>)}<button type="button" disabled={busy} onClick={refresh}>Refresh</button></div>
      <input aria-label="Search listed email documents" placeholder="Search loaded emails" type="search" value={query} onChange={e=>setQuery(e.target.value)}/>
      <small>Newest first · PDF and photo attachments up to 12 MB</small>
      <div className={styles.list}>{visible.map(item=><button className={styles.document} type="button" key={item.messageId+':'+item.attachmentId} disabled={busy} onClick={()=>choose(item)}><b>{item.name}</b><span>{item.subject||'Email attachment'}</span><small>{item.sender} · {item.receivedAt?new Date(item.receivedAt).toLocaleDateString():''}</small><em>Open in Smart Scan →</em></button>)}</div>
      {query&&!visible.length&&<p>No matches in the loaded emails.</p>}
      {cursor&&<button type="button" disabled={busy} onClick={()=>run(context=>list(status,folder,cursor,context))}>Load older emails</button>}
      <p className={styles.hint}>Attachments only. Booking and upload links stay in Outlook.</p>
    </>:null}
    {notice&&<p className={styles.message} role="status">{notice}</p>}
    {busy&&<p role="status">{status?.connected?'Reading email documents…':'Checking email connection…'}</p>}
  </section>;
}
