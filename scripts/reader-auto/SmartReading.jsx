'use client';
import React,{useEffect,useRef,useState} from 'react';
import CompactReading from './CompactReadingV1104101.jsx';
import {readDocumentAutomatically} from './readerAiFallbackV110398.js';
import {originalDigest} from '../../../../lib/reader-ai/read.js';
import {applyAutomaticReading} from '../../../../lib/reader-ai/automatic.js';
import {SMART_READING_VERSION} from '../../../../lib/reader-ai/smartReading.js';
import {withAiAbort} from '../../../../lib/reader-ai/diagnostics.js';
import styles from './CompactReadingV1104101.module.css';

export default function SmartReading(props){
  const {analysis,result,group,sources,onConfirm,onField,disabled}=props;
  const [mode,setMode]=useState('reading'),[message,setMessage]=useState('Reading and checking the original…'),[retry,setRetry]=useState(0);
  const latest=useRef(props),active=useRef(0),controller=useRef(null);latest.current=props;
  const page=result.pages.find(p=>group.pageIds.includes(p.id)),sourceImageId=`${result.documentId}:${page?.id}:original`,file=sources[sourceImageId];
  useEffect(()=>{
    const generation=++active.current,request=new AbortController();controller.current=request;
    const timer=setTimeout(()=>request.abort(),120000),revision=result.reviewRevision;
    const abort=()=>request.abort();props.signal?.addEventListener('abort',abort,{once:true});
    const finish=(state,text)=>{if(active.current===generation){setMode(state);setMessage(text);}};
    (async()=>{
      if(result.automaticReading){finish('done',result.automaticReading.message);return;}
      if(!file||result.documents.length!==1||result.pages.length!==1||result.pageCount!==1||group.pageIds.length!==1||group.boundaryReview){finish('legacy','Check these pages together.');return;}
      if(analysis.userSelectedTypeV11036){finish('legacy','');return;}
      const prepared=retry===0&&analysis.automaticReadingStage?analysis:await readDocumentAutomatically(analysis,file,{signal:request.signal});
      if(request.signal.aborted||active.current!==generation)return;
      const stage=prepared?.automaticReadingStage;
      if(!stage){finish('legacy','');return;}
      const {state,reason,httpStatus,limitScope,outputIssue,model,version}=stage;
      const diagnostic={state,reason,httpStatus,limitScope,outputIssue,model,version};
      if(stage.state!=='completed'){
        latest.current.onConfirm({...latest.current.result,automaticReadingDiagnostic:diagnostic});
        finish('attention',stage.message);return;
      }
      const originalHash=await originalDigest(file.arrayBuffer());
      if(stage.version!==SMART_READING_VERSION||stage.pageNumber!==page.number||stage.originalHash!==originalHash)throw new Error('The original could not be verified. Read it again.');
      const {cloudSession}=await import('../../../../lib/owner-op-cloud/client.js');
      const session=await withAiAbort(()=>cloudSession(),request.signal);
      if(session?.user?.id!==stage.accountId){finish('attention','Account changed. Read the document again.');return;}
      if(request.signal.aborted||active.current!==generation)return;
      const current=latest.current;
      if(current.disabled||current.result.documentId!==result.documentId||current.result.reviewRevision!==revision){finish('attention','Your changes are kept.');return;}
      const next=applyAutomaticReading(current.result,stage.result,{groupId:group.id,pageId:page.id,sourceImageId,imageHash:stage.imageHash,originalHash,expectedRevision:revision});
      next.automaticReadingDiagnostic=diagnostic;
      current.onConfirm(next);finish('done',next.automaticReading.message);
    })().catch(e=>finish('attention',e.name==='AbortError'?'Reading stopped. The original is kept.':e.message))
      .finally(()=>clearTimeout(timer));
    return()=>{active.current++;request.abort();clearTimeout(timer);props.signal?.removeEventListener('abort',abort);};
  },[analysis,result.documentId,page?.id,retry]);
  if(mode==='legacy')return <CompactReading {...props} autoRead={!analysis.automaticReadingStage}/>;
  const verified=Object.entries(group.fields).filter(([,f])=>f.status==='confirmed'&&f.value);
  return <section className={styles.card} aria-label={`Automatic reading for ${group.label}`}>
    <h3>{mode==='reading'?'Reading and checking…':result.automaticReading?.ready?'Details ready':group.label}</h3>
    <p role="status">{message}</p>
    <div className={styles.values}>{verified.map(([key,f])=><div className={styles.value} key={key}><span><b>{f.label}</b><br/>{f.value}</span><button type="button" disabled={disabled} onClick={()=>onField(key)}>Edit</button></div>)}</div>
    {mode==='reading'?<button type="button" onClick={()=>controller.current?.abort()}>Stop reading</button>:null}
    {mode==='attention'?<><button type="button" disabled={disabled} onClick={()=>{setMode('reading');setMessage('Reading and checking the original…');setRetry(v=>v+1);}}>Read again</button><button type="button" disabled={disabled} onClick={()=>setMode('legacy')}>Check details</button></>:null}
    {mode==='done'&&!result.automaticReading?.ready?<button type="button" disabled={disabled} onClick={()=>setMode('legacy')}>Check unclear details</button>:null}
  </section>;
}
