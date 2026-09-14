'use client';
import React,{useEffect,useRef,useState} from 'react';
import {reviewScanAnalysis} from './ownedReaderAdapter.js';
import {confirmPageField,confirmDocumentKind,reviewQueue,reviewKinds,savedReadingReview} from '../../../../packages/smart-reader-core/src/recovery.js';
import {recognizeDocumentText} from './webOcr.js';
import {fieldsForProfile} from '../../../../packages/smart-reader-core/src/engine.js';
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

function ReviewBody({analysis,reviewState,onReviewChange}) {
  const [result,setResult]=useState(null),[sources,setSources]=useState({}),[selection,setSelection]=useState(null),[draft,setDraft]=useState(''),[error,setError]=useState('');
  const active=useRef(0),inspect=useRef(null),retryGeneration=useRef(0);
  const [busy,setBusy]=useState(false),[rereadText,setRereadText]=useState('');
  useEffect(()=>()=>{retryGeneration.current++;},[]);
  useEffect(()=>{if(selection)inspect.current?.scrollIntoView({block:'start',behavior:'smooth'});},[selection]);
  useEffect(()=>{
    const generation=++active.current;
    setResult(null);setSelection(null);setError('');
    (async()=>{
      const documentId=reviewState?.result?.documentId||`review-${crypto.randomUUID()}`,dimensions={},files={};
      for(const pass of analysis.ocrEvidenceV110323||[]){
        if(active.current!==generation)return;
        if(!(pass.sourceImageFile instanceof Blob))continue;
        const pageId=`page-${pass.page}`,key=`${pageId}:${pass.id}`;
        try{dimensions[key]=await loadImage(pass.sourceImageFile);files[`${documentId}:${key}`]=pass.sourceImageFile;}catch{/* Text evidence remains available. */}
      }
      if(active.current!==generation)return;
      const next=reviewState?.result||reviewScanAnalysis(analysis,{documentId,dimensions});
      for(const page of next.pages){
        if(page.observations.some(o=>files[o.sourceImageId]))continue;
        const fallback=(analysis.scanMeta?.captureAssets||[]).find(a=>Number(a.pageIndex||0)===page.number-1&&a.kind==='perspective-corrected')?.file||analysis.scanMeta?.pageFiles?.[page.number-1];
        if(!(fallback instanceof Blob))continue;
        const id=`${documentId}:${page.id}:original`;
        try{await loadImage(fallback);files[id]=fallback;if(!page.observations.length)page.observations.push({id:'original',source:'source-image',lines:[]});page.observations[0].sourceImageId=id;}catch{}
      }
      if(active.current!==generation)return;
      setSources(files);setResult(next);
    })().catch(e=>{if(active.current===generation)setError(e.message);});
    return ()=>{active.current++;};
  },[analysis]);

  function update(next){setResult(next);onReviewChange?.({analysis,result:next,summary:savedReadingReview(next)});}
  function sourceOptions(group){
    return result.pages.filter(p=>group.pageIds.includes(p.id)).flatMap(page=>{
      const observation=page.observations.find(o=>sources[o.sourceImageId]);
      return observation?[{pageId:page.id,pageNumber:page.number,sourceImageId:observation.sourceImageId}]:[];
    });
  }
  function sourceFor(group){return sourceOptions(group)[0]||null;}
  function openItem(item,current=result){
    retryGeneration.current++;setBusy(false);setRereadText('');
    if(!item){setSelection(null);return;}
    const group=current.documents.find(g=>g.id===item.groupId),field=group.fields[item.key];
    if(!field){setSelection({groupId:group.id,key:null,field:null,evidence:sourceFor(group)});setDraft(group.kind==='unknown'?'':group.kind);setError('');return;}
    const candidate=field.candidates.find(c=>c.issue!=='form_instructions');
    select(group,item.key,field,candidate,candidate?.evidence.find(e=>sources[e.sourceImageId])||candidate?.evidence[0]||sourceFor(group));
  }
  function select(group,key,field,candidate,evidence) {
    setSelection({groupId:group.id,key,field,candidate,evidence});
    retryGeneration.current++;setBusy(false);setRereadText('');
    setDraft(field.correction?.value??candidate?.value??candidate?.rawValue??'');setError('');
  }
  function confirm(advance=false) {
    try{
      const request={documentId:result.documentId,groupId:selection.groupId,field:selection.key,rawValue:draft,userConfirmed:true,expectedRevision:result.reviewRevision,...selection.evidence};
      const next=selection.key===null?confirmDocumentKind(result,{...request,kind:draft}):selection.candidate?confirmField(result,{...request,evidence:selection.evidence,expectedRawValues:selection.field.candidates.map(c=>c.rawValue)}):confirmPageField(result,request);
      update(next);setError('');setRereadText('');
      if(advance)openItem(reviewQueue(next)[0],next);else setSelection(null);
    }catch(e){setError(e.message);}
  }
  async function retryArea(){
    const token=++retryGeneration.current,source=sources[selection?.evidence?.sourceImageId];if(!source||busy)return;
    setBusy(true);setError('');setRereadText('');
    try{
      const dimensions=await loadImage(source),box=selection.evidence.box;
      const rectangle=box?{left:Math.max(0,Math.floor(box.x*dimensions.width)-8),top:Math.max(0,Math.floor(box.y*dimensions.height)-6),width:0,height:0}:null;
      if(rectangle){rectangle.width=Math.min(dimensions.width-rectangle.left,Math.ceil(box.width*dimensions.width)+16);rectangle.height=Math.min(dimensions.height-rectangle.top,Math.ceil(box.height*dimensions.height)+12);}
      const read=await recognizeDocumentText(source,{pageSegMode:box?'7':'11',returnLayout:false,thresholdingMethod:'2',...(rectangle?{rectangle}:{})});
      if(token!==retryGeneration.current)return;
      const group=result.documents.find(g=>g.id===selection.groupId),text=read?.text?.trim()||'';
      const fields=fieldsForProfile([{id:'retry',number:1,observations:[{id:'retry',lines:text.split(/\r?\n/).map((text,i)=>({id:String(i),text,confidence:null}))}]}],group.kind);
      const candidate=fields[selection.key]?.candidates.find(c=>c.value!==null);
      setRereadText(candidate?`New reading: ${candidate.rawValue}. Check it against the image before confirming.`:text?`Reread text: ${text.slice(0,600)}`:'No clearer reading. Enter the value from the source image, or skip this field.');
      if(candidate)setDraft(candidate.rawValue);
    }catch{if(token===retryGeneration.current)setError('Rereading failed. You can still enter the value or skip this field.');}
    finally{if(token===retryGeneration.current)setBusy(false);}
  }
  function download() {
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='document-reader-review.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(!result)return <p role="status">{error||'Preparing source evidence…'}</p>;
  const source=selection?.candidate?resolveEvidence(result,selection.evidence):null;
  const queue=reviewQueue(result);
  const selectablePages=selection&&!selection.candidate?sourceOptions(result.documents.find(g=>g.id===selection.groupId)):[];
  return <div className="owned-reader-body">
    <p>Check uncertain readings against the page. Confirmed details stay with this scan and are saved on this device when you save the document.</p>
    <div className="owned-reader-recovery"><b>{queue.length} items to check</b><button type="button" disabled={!queue.length||busy} onClick={()=>openItem(queue[0])}>Fix next reading</button></div>
    <p role="status">{result.pageCount} {result.pageCount===1?'page':'pages'} · {result.documents.length} {result.documents.length===1?'document':'documents'}</p>
    {result.unreadablePageIds.length>0?<p>Some pages have no readable text. Check their originals.</p>:null}
    {result.documents.map(group=><article key={group.id} className="owned-reader-document">
      <h3>{group.label} · {group.pageIds.map(id=>result.pages.find(p=>p.id===id)?.number).join(', ')}</h3>
      {group.boundaryReview?<p>Check whether these pages belong together.</p>:null}
      {group.identityStatus==='needs_review'?<p>Shipping fields suggest this type. Confirm it against the page.</p>:null}
      {group.checks.some(check=>check.id==='invoice_arithmetic'&&check.status==='needs_review')?<p role="alert">Subtotal plus tax does not match the total. Check the amounts.</p>:null}
      {group.checks.some(check=>check.id==='receipt_arithmetic'&&check.status==='needs_review')?<p role="alert">Unloading amount plus fee does not match the receipt total. Check the amounts.</p>:null}
      {group.checks.some(check=>check.id==='receipt_arithmetic'&&check.status==='passed')?<p>Unloading amount plus fee matches the receipt total.</p>:null}
      {group.kind==='unknown'?<p>Choose the document type to review its fields. The page stays included. <button type="button" onClick={()=>openItem({groupId:group.id,key:null})}>Choose document type</button></p>:null}
      {Object.entries(group.fields).map(([key,field])=><div key={key} className="owned-reader-field">
        <b>{field.label}</b><span>{field.status==='confirmed'?'Confirmed':field.status==='supported'?'Source found':field.status==='missing'?'Missing':'Check reading'}</span>
        {field.correction?<p>{field.correction.value}</p>:null}
        {!field.candidates.some(c=>c.issue!=='form_instructions')?<button type="button" onClick={()=>openItem({groupId:group.id,key})}>Enter {field.label.toLowerCase()} from page</button>:null}
        {field.candidates.filter(candidate=>candidate.issue!=='form_instructions').map((candidate,ci)=><div key={ci}>{sourcePages(candidate).map(e=><button type="button" key={e.pageId} onClick={()=>select(group,key,field,candidate,e)}>{candidate.rawValue} · Page {e.pageNumber}</button>)}</div>)}
      </div>)}
      <details><summary>Read page text</summary>{group.pageIds.map(id=>{
        const page=result.pages.find(p=>p.id===id);
        return <div key={id}><b>Page {page.number}</b><pre>{page.observations[0]?.lines.map(l=>l.text).join('\n')||'No readable text'}</pre></div>;
      })}</details>
    </article>)}
    {selection?<section ref={inspect} className="owned-reader-inspect" aria-label="Check source">
      <h3>{selection.field?.label||'Document type'} · Page {selection.evidence?.pageNumber||'?'}</h3>
      {source?<blockquote>{source.line.text.slice(0,selection.evidence.start)}<mark>{selection.evidence.quote}</mark>{source.line.text.slice(selection.evidence.end)}</blockquote>:<p>Read the value directly from this original page.</p>}
      {selectablePages.length>1?<label>Source page<select aria-label="Source page" value={selection.evidence?.pageId||''} onChange={event=>{retryGeneration.current++;setBusy(false);setRereadText('');setDraft('');setError('');setSelection({...selection,evidence:selectablePages.find(p=>p.pageId===event.target.value)});}}>{selectablePages.map(p=><option key={p.pageId} value={p.pageId}>Page {p.pageNumber}</option>)}</select></label>:null}
      {selection.evidence?<SourceImage file={sources[selection.evidence.sourceImageId]} evidence={selection.evidence}/>:<p>The source image is unavailable. Skip this item and check the original file.</p>}
      <label>{selection.key===null?'Document type':'Confirmed value'}{selection.key===null?<select aria-label="Document type in reader" value={draft} onChange={e=>setDraft(e.target.value)}><option value="">Choose type</option>{reviewKinds.map(k=><option key={k.id} value={k.id}>{k.id==='invoice'?'Carrier invoice':k.label}</option>)}</select>:<input aria-label="Confirmed value" value={draft} onChange={e=>setDraft(e.target.value)}/>}</label>
      {selection.key&&sources[selection.evidence?.sourceImageId]?<button type="button" disabled={busy} onClick={retryArea}>{busy?'Reading area…':'Reread this area'}</button>:null}
      {rereadText?<p role="status">{rereadText}</p>:null}
      <button type="button" disabled={busy||!selection.evidence||!draft.trim()} onClick={()=>confirm(true)}>Save &amp; next</button>
      <button type="button" disabled={busy||!selection.evidence||!draft.trim()} onClick={()=>confirm(false)}>Confirm value</button>
      <button type="button" disabled={busy} onClick={()=>{const index=queue.findIndex(q=>q.groupId===selection.groupId&&q.key===selection.key);openItem(queue[index+1]);}}>Skip for now</button>
      <button type="button" onClick={()=>{retryGeneration.current++;setBusy(false);setSelection(null);}}>Close source</button>
    </section>:null}
    {error?<p role="alert">{error}</p>:null}
    <button type="button" onClick={download}>Export reading review</button>
  </div>;
}

export default function ReaderPreview({analysis,reviewState,onReviewChange}) {
  const [open,setOpen]=useState(Boolean(analysis?.typeEvidenceV110334?.mixedDocuments));
  return <section className="owned-reader-preview">
    <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Reader preview · {open?'Close':'Check source'}</button>
    <div hidden={!open}><ReviewBody analysis={analysis} reviewState={reviewState?.analysis===analysis?reviewState:null} onReviewChange={onReviewChange}/></div>
  </section>;
}
