'use client';
import React,{useEffect,useRef,useState} from 'react';
import {extractDocumentFields} from './readerAiFallbackV110398.js';
import {missingAiFields} from '../../../../lib/reader-ai/extract.js';
import {aiStatusMessage} from '../../../../lib/reader-ai/policy.js';

export default function AiExtractionReview({analysis,result,group,sources,signal,disabled,onStage,onCandidate}){
  const available=result.pages.filter(page=>group.pageIds.includes(page.id)&&sources[`${result.documentId}:${page.id}:original`]);
  const [selectedPage,setSelectedPage]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const page=available.find(item=>item.id===selectedPage)||available[0];
  const active=useRef(0),controller=useRef(null),latest=useRef(null);
  latest.current={result,onStage,onCandidate};
  useEffect(()=>{active.current++;setBusy(false);setMessage('');return ()=>{active.current++;controller.current?.abort();};},[analysis,group.id,group.kind,page?.id]);
  if(!missingAiFields(group).length||group.boundaryReview||!['supported','confirmed'].includes(group.identityStatus))return null;
  const proposals=(result.aiExtraction?.candidates||[]).filter(candidate=>candidate.groupId===group.id&&candidate.provenance?.providerImage?.pageId===page?.id&&missingAiFields(group).includes(candidate.field));
  async function read(){
    if(busy||!page||disabled)return;
    const generation=++active.current,startRevision=result.reviewRevision;
    controller.current?.abort();const requestController=new AbortController();controller.current=requestController;
    const abort=()=>requestController.abort();signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    setBusy(true);setMessage('Reading this page for missing fields. Nothing will be applied automatically.');
    try{
      const sourceImageId=`${result.documentId}:${page.id}:original`;
      const stage=await extractDocumentFields({analysis,result,groupId:group.id,pageId:page.id,sourceImageId,file:sources[sourceImageId],signal:requestController.signal});
      if(generation!==active.current)return;
      const current=latest.current;
      if(current.result.documentId!==result.documentId||current.result.reviewRevision!==startRevision){setMessage('The reading changed. AI proposals were discarded; review the current document.');return;}
      current.onStage(stage);
      const matched=stage.candidates.filter(candidate=>candidate.groupId===group.id&&candidate.provenance?.providerImage?.pageId===page.id).length;
      setMessage(stage.state==='attempted'?(matched?`${matched} source-linked suggestions. Check each original before confirming.`:'No source-linked suggestions. Enter missing values from the original page.'):aiStatusMessage(stage.reason));
    }catch(error){if(generation===active.current)setMessage(error.name==='AbortError'?'AI field reading cancelled.':'AI field reading is unavailable. Your local values are unchanged.');}
    finally{signal?.removeEventListener('abort',abort);if(generation===active.current)setBusy(false);}
  }
  return <aside aria-label={`AI field suggestions for ${group.label}`} style={{padding:12,border:'1px solid #bdcfc9',borderRadius:12,margin:'8px 0'}}>
    <b>Read missing fields with AI</b>
    <p>Reads only the selected original page. AI suggestions cannot change fields, document type or load assignment until you review and confirm them.</p>
    {available.length>1?<label>AI source page<select aria-label={`AI source page for ${group.label}`} disabled={busy||disabled} value={page?.id||''} onChange={event=>setSelectedPage(event.target.value)}>{available.map(item=><option key={item.id} value={item.id}>Page {item.number}</option>)}</select></label>:page?<p>Original page {page.number}</p>:<p>The original page image is unavailable.</p>}
    <button type="button" disabled={busy||disabled||!page} onClick={read}>{busy?'Reading missing fields…':'Read missing fields with AI'}</button>
    {busy?<button type="button" onClick={()=>controller.current?.abort()}>Cancel AI field reading</button>:null}
    {message?<p role="status">{message}</p>:null}
    {proposals.map((candidate,index)=><div key={candidate.field+':'+index}>
      <p><b>{group.fields[candidate.field]?.label||candidate.field}: {candidate.rawValue}</b></p>
      <p>Source quote: {candidate.provenance.evidence[0]?.quote} · Page {candidate.provenance.providerImage.pageNumber}</p>
      <button type="button" disabled={busy||disabled} onClick={()=>latest.current.onCandidate(candidate)}>Review {group.fields[candidate.field]?.label||candidate.field} suggestion</button>
    </div>)}
  </aside>;
}
