'use client';
import React,{useEffect,useRef,useState} from 'react';
import {reviewScanAnalysis} from './ownedReaderAdapter.js';
import {resolveEvidence,confirmField} from '../../../../packages/smart-reader-core/src/index.js';

function loadImage(file) {
  const url=URL.createObjectURL(file);
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{const dimensions={width:image.naturalWidth,height:image.naturalHeight};URL.revokeObjectURL(url);resolve(dimensions);};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Source preview could not be opened'));};
    image.src=url;
  });
}

function SourceImage({file,evidence}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{
    if(!file){setUrl('');return;}
    const next=URL.createObjectURL(file);setUrl(next);
    return ()=>URL.revokeObjectURL(next);
  },[file]);
  if(!url)return null;
  const box=evidence.box;
  return <div className="owned-reader-source">
    <img src={url} alt={`Source image for page ${evidence.pageNumber}`}/>
    {box?<span aria-label="Source line highlight" className="owned-reader-highlight" style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.width*100}%`,height:`${box.height*100}%`}}/>:null}
  </div>;
}

function sourcePages(candidate) {
  const pages=new Map();
  for(const evidence of candidate.evidence){
    if(!pages.has(evidence.pageId)||!pages.get(evidence.pageId).box&&evidence.box)pages.set(evidence.pageId,evidence);
  }
  return [...pages.values()];
}

function ReviewBody({analysis}) {
  const [result,setResult]=useState(null),[sources,setSources]=useState({}),[selection,setSelection]=useState(null),[draft,setDraft]=useState(''),[error,setError]=useState('');
  const active=useRef(0);
  useEffect(()=>{
    const generation=++active.current;
    setResult(null);setSelection(null);setError('');
    (async()=>{
      const documentId=`review-${crypto.randomUUID()}`,dimensions={},files={};
      for(const pass of analysis.ocrEvidenceV110323||[]){
        if(active.current!==generation)return;
        if(!(pass.sourceImageFile instanceof Blob))continue;
        const pageId=`page-${pass.page}`,key=`${pageId}:${pass.id}`;
        try{dimensions[key]=await loadImage(pass.sourceImageFile);files[`${documentId}:${key}`]=pass.sourceImageFile;}catch{/* Text evidence remains available. */}
      }
      if(active.current!==generation)return;
      setSources(files);setResult(reviewScanAnalysis(analysis,{documentId,dimensions}));
    })().catch(e=>{if(active.current===generation)setError(e.message);});
    return ()=>{active.current++;};
  },[analysis]);

  function select(group,key,field,candidate,evidence) {
    setSelection({groupId:group.id,key,field,candidate,evidence});
    setDraft(field.correction?.value??candidate.value??candidate.rawValue);setError('');
  }
  function confirm() {
    try{
      const next=confirmField(result,{documentId:result.documentId,groupId:selection.groupId,field:selection.key,rawValue:draft,evidence:selection.evidence,userConfirmed:true,expectedRevision:result.reviewRevision,expectedRawValues:selection.field.candidates.map(c=>c.rawValue)});
      setResult(next);setSelection(null);setError('');
    }catch(e){setError(e.message);}
  }
  function download() {
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='document-reader-review.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(!result)return <p role="status">{error||'Preparing source evidence…'}</p>;
  const source=selection?resolveEvidence(result,selection.evidence):null;
  return <div className="owned-reader-body">
    <p>Experimental reading review. Check each value against its source. Export the review to keep your corrections.</p>
    <p role="status">{result.pageCount} {result.pageCount===1?'page':'pages'} · {result.documents.length} {result.documents.length===1?'document':'documents'}</p>
    {result.unreadablePageIds.length>0?<p>Some pages have no readable text. Check their originals.</p>:null}
    {result.documents.map(group=><article key={group.id} className="owned-reader-document">
      <h3>{group.label} · {group.pageIds.map(id=>result.pages.find(p=>p.id===id)?.number).join(', ')}</h3>
      {group.boundaryReview?<p>Check whether these pages belong together.</p>:null}
      {group.checks.some(check=>check.id==='invoice_arithmetic'&&check.status==='needs_review')?<p role="alert">Subtotal plus tax does not match the total. Check the amounts.</p>:null}
      {group.kind==='unknown'?<p>Document type needs review. The page remains included.</p>:null}
      {Object.entries(group.fields).filter(([,field])=>field.required||field.status!=='missing').map(([key,field])=><div key={key} className="owned-reader-field">
        <b>{field.label}</b><span>{field.status==='confirmed'?'Confirmed in preview':field.status==='supported'?'Source found':field.status==='missing'?'Missing':'Check reading'}</span>
        {field.correction?<p>{field.correction.value}</p>:null}
        {field.candidates.map((candidate,ci)=><div key={ci}>{sourcePages(candidate).map(e=><button type="button" key={e.pageId} onClick={()=>select(group,key,field,candidate,e)}>{candidate.rawValue} · Page {e.pageNumber}</button>)}</div>)}
      </div>)}
      <details><summary>Read page text</summary>{group.pageIds.map(id=>{
        const page=result.pages.find(p=>p.id===id);
        return <div key={id}><b>Page {page.number}</b><pre>{page.observations[0]?.lines.map(l=>l.text).join('\n')||'No readable text'}</pre></div>;
      })}</details>
    </article>)}
    {selection?<section className="owned-reader-inspect" aria-label="Check source">
      <h3>{selection.field.label} · Page {selection.evidence.pageNumber}</h3>
      <blockquote>{source.line.text.slice(0,selection.evidence.start)}<mark>{selection.evidence.quote}</mark>{source.line.text.slice(selection.evidence.end)}</blockquote>
      <SourceImage file={sources[selection.evidence.sourceImageId]} evidence={selection.evidence}/>
      <label>Confirmed value<input aria-label="Confirmed value" value={draft} onChange={e=>setDraft(e.target.value)}/></label>
      <button type="button" onClick={confirm}>Confirm value in preview</button>
      <button type="button" onClick={()=>setSelection(null)}>Close source</button>
    </section>:null}
    {error?<p role="alert">{error}</p>:null}
    <button type="button" onClick={download}>Export reading review</button>
  </div>;
}

export default function ReaderPreview({analysis}) {
  const [open,setOpen]=useState(false);
  return <section className="owned-reader-preview">
    <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Reader preview · {open?'Close':'Check source'}</button>
    {open?<ReviewBody analysis={analysis}/>:null}
  </section>;
}
