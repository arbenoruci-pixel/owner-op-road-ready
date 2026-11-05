'use client';
import React,{useEffect,useRef,useState} from 'react';
import {extractDocumentFields} from './readerAiFallbackV110398.js';
import {missingAiFields} from '../../../../lib/reader-ai/extract.js';
import {keyReadingFields,pageProposals,confirmReadingBatch} from './compactReadingV1104101.js';
import styles from './CompactReadingV1104101.module.css';

function Original({file}){
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!file)return;const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
  return url?<div className={styles.original}><img src={url} alt="Original document page for checking the reading"/></div>:null;
}
export default function CompactReading({analysis,result,group,sources,signal,disabled,onStage,onConfirm,onField,onKind,suggestion}){
  const available=result.pages.filter(p=>group.pageIds.includes(p.id)&&sources[`${result.documentId}:${p.id}:original`]);
  const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[checking,setChecking]=useState(null),[drafts,setDrafts]=useState({}),[error,setError]=useState('');
  const page=available.find(p=>p.id===selected)||available[0],fields=keyReadingFields(group),proposals=pageProposals(result,group,page?.id);
  const latest=useRef(null),active=useRef(0),controller=useRef(null),attempted=useRef(new Set());
  latest.current={result,onStage,onConfirm,disabled};
  const missing=missingAiFields(group).filter(key=>fields.includes(key));
  const canRead=page&&!group.boundaryReview&&['supported','confirmed'].includes(group.identityStatus)&&missing.length>0;
  useEffect(()=>{
    active.current++;setBusy(false);setChecking(null);setError('');setMessage('');
    const key=`${result.documentId}:${group.id}:${group.kind}:${page?.id}`;
    let cancelled=false;
    // One bounded attempt for this page. Opening advanced details never starts
    // another request, and background renders cannot overwrite driver edits.
    Promise.resolve().then(()=>{if(!cancelled&&canRead&&!disabled&&!attempted.current.has(key)){attempted.current.add(key);read();}});
    return()=>{cancelled=true;active.current++;controller.current?.abort();};
  },[analysis,result.documentId,group.id,group.kind,page?.id,canRead]);
  async function read(){
    if(!canRead||busy||disabled)return;
    const token=++active.current,revision=result.reviewRevision,id=result.documentId;
    const request=new AbortController();controller.current?.abort();controller.current=request;
    const abort=()=>request.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    setBusy(true);setMessage('Reading the page…');setError('');
    try{
      const sourceImageId=`${id}:${page.id}:original`;
      const stage=await extractDocumentFields({analysis,result,groupId:group.id,pageId:page.id,sourceImageId,file:sources[sourceImageId],signal:request.signal,allowVisual:true,requestedFields:fields});
      if(token!==active.current)return;
      const current=latest.current;
      if(current.disabled||current.result.documentId!==id||current.result.reviewRevision!==revision){setMessage('Your changes are kept.');return;}
      current.onStage(stage);
      const count=stage.candidates.filter(c=>c.groupId===group.id&&c.provenance?.providerImage?.pageId===page.id&&fields.includes(c.field)).length;
      setMessage(count?'Check the reading against the original below.':stage.state==='attempted'?'Some details are unclear. You can enter them from the original.':'Image reading is unavailable. Your document can still be saved for review.');
    }catch(e){if(token===active.current)setMessage(e.name==='AbortError'?'Reading stopped.':'Image reading is unavailable. Check the original.');}
    finally{signal?.removeEventListener('abort',abort);if(token===active.current)setBusy(false);}
  }
  function openCheck(){
    setChecking({documentId:result.documentId,groupId:group.id,pageId:page.id,sourceImageId:`${result.documentId}:${page.id}:original`,expectedRevision:result.reviewRevision});
    setDrafts(Object.fromEntries(proposals.map(c=>[c.field,c.rawValue])));setError('');
  }
  function confirm(){
    try{
      const values=Object.fromEntries(Object.entries(drafts).filter(([,v])=>v.trim()));
      const next=confirmReadingBatch(latest.current.result,{...checking,values,userConfirmed:true});
      latest.current.onConfirm(next);setChecking(null);setMessage('Details checked. Save the document to keep them.');setError('');
    }catch(e){setError(e.message);}
  }
  return <section className={styles.card} aria-label={`Key details for ${group.label}`}>
    <h3>{group.label}{result.documents.length>1?` · Page ${group.pageIds.map(id=>result.pages.find(p=>p.id===id)?.number).join(', ')}`:''}</h3>
    {group.boundaryReview?<p role="alert">Check whether these pages belong together in All reading details.</p>:null}
    {suggestion?<><p>Document type: <b>{suggestion.label||suggestion.kind.replaceAll('_',' ')}</b></p><button type="button" disabled={disabled||busy} onClick={onKind}>Check document type</button></>:group.kind==='unknown'?<button type="button" disabled={disabled} onClick={onKind}>Choose document type</button>:null}
    <div className={styles.values}>{fields.map(key=>{
      const field=group.fields[key],value=field.correction?.value??field.value;
      return <div className={styles.value} key={key}><span><b>{field.label}</b><br/>{value!==null&&value!==undefined&&value!==''?String(value):'Not read'}</span><button type="button" disabled={disabled||busy} onClick={()=>onField(key)}>{value?'Edit':'Enter'}</button></div>;
    })}</div>
    {available.length>1?<label>Original page<select aria-label={`Reading page for ${group.label}`} disabled={busy||disabled||Boolean(checking)} value={page?.id||''} onChange={e=>setSelected(e.target.value)}>{available.map(p=><option key={p.id} value={p.id}>Page {p.number}</option>)}</select></label>:null}
    {message?<p role="status">{message}</p>:null}
    {checking?<>
      <Original file={sources[checking.sourceImageId]}/>
      <p>Check these values against the page. Clear a value to leave it unchecked. Use YYYY-MM-DD for dates.</p>
      <div className={styles.fields}>{Object.entries(drafts).map(([key,value])=><label key={key}>{group.fields[key]?.label||key}<input aria-label={`Check ${group.fields[key]?.label||key}`} disabled={disabled} value={value} onChange={e=>setDrafts(old=>({...old,[key]:e.target.value}))}/></label>)}</div>
      {error?<p role="alert">{error}</p>:null}
      <button type="button" className={styles.primary} disabled={disabled||!Object.values(drafts).some(v=>v.trim())} onClick={confirm}>Use checked details</button>
      <button type="button" disabled={disabled} onClick={()=>{setChecking(null);setError('');}}>Close</button>
    </>:proposals.length?<button type="button" className={styles.primary} disabled={busy||disabled} onClick={openCheck}>Check {proposals.length} read {proposals.length===1?'detail':'details'}</button>:null}
    {!checking&&canRead&&!busy&&!proposals.length?<button type="button" disabled={disabled} onClick={read}>Read page again</button>:null}
    {busy?<button type="button" onClick={()=>controller.current?.abort()}>Stop reading</button>:null}
  </section>;
}
