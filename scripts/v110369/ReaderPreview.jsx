'use client';
import React,{useEffect,useRef,useState} from 'react';
import {reviewScanAnalysis} from './ownedReaderAdapter.js';
import SourceImage from './OwnedReaderSourceFocusV110360.jsx';
import {confirmPageField,confirmDocumentKind,reviewQueue,reviewKinds,savedReadingReview} from '../../../../packages/smart-reader-core/src/recovery.js';
import {recognizeDocumentText} from './webOcr.js';
import {fieldsForProfile} from '../../../../packages/smart-reader-core/src/engine.js';
import {resolveEvidence,confirmField} from '../../../../packages/smart-reader-core/src/index.js';
import {clearestEvidence,clearestCandidate} from '../../../../packages/smart-reader-core/src/reviewEvidence.js';

function loadImage(file) {
  const url=URL.createObjectURL(file);
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{const dimensions={width:image.naturalWidth,height:image.naturalHeight};URL.revokeObjectURL(url);resolve(dimensions);};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Source preview could not be opened'));};
    image.src=url;
  });
}

// SourceImage uses the focused, exact-source viewer.

function sourcePages(candidate) {
  const pages=new Map();
  for(const evidence of candidate.evidence){
    pages.set(evidence.pageId,clearestEvidence([...(pages.has(evidence.pageId)?[pages.get(evidence.pageId)]:[]),evidence]));
  }
  return [...pages.values()];
}

function ReviewBody({analysis,reviewState,onReviewChange,onReady,signal,onSaveReading}) {
  const [result,setResult]=useState(null),[sources,setSources]=useState({}),[selection,setSelection]=useState(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false),[saving,setSaving]=useState(false);
  const active=useRef(0),inspect=useRef(null),retryGeneration=useRef(0),visited=useRef(new Set());
  const [busy,setBusy]=useState(false),[rereadText,setRereadText]=useState('');
  useEffect(()=>()=>{retryGeneration.current++;},[]);
  const modalOpen=Boolean(selection||complete);
  useEffect(()=>{
    if(!modalOpen)return;
    const dialog=inspect.current,previous=document.activeElement,overflow=document.body.style.overflow;
    if(!dialog.open)dialog.showModal();document.body.style.overflow='hidden';
    const fit=()=>{dialog.style.height=(window.visualViewport?.height||window.innerHeight)+'px';dialog.style.top=(window.visualViewport?.offsetTop||0)+'px';};
    fit();window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit);
    return ()=>{window.visualViewport?.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('scroll',fit);document.body.style.overflow=overflow;dialog.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[modalOpen]);
  useEffect(()=>{if(selection)inspect.current?.querySelector('h3')?.focus({preventScroll:true});},[selection]);
  useEffect(()=>{
    const generation=++active.current;
    setResult(null);setSelection(null);setComplete(false);setError('');visited.current.clear();
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
      setSources(files);setResult(next);onReady?.({analysis,result:next,summary:savedReadingReview(next)});
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
  function openItem(item,current=result,continuing=false){
    if(!continuing)visited.current.clear();setComplete(false);
    retryGeneration.current++;setBusy(false);setRereadText('');
    if(!item){setSelection(null);return;}
    const group=current.documents.find(g=>g.id===item.groupId),field=group.fields[item.key];
    if(!field){setSelection({groupId:group.id,key:null,field:null,evidence:typeSource(group,current)||sourceFor(group)});setDraft(group.kind==='unknown'?'':group.kind);setError('');return;}
    const choice=clearestCandidate(field.candidates,evidence=>Boolean(sources[evidence.sourceImageId]));
    select(group,item.key,field,choice?.candidate,choice?.evidence||sourceFor(group));
  }
  function typeSource(group,current){
    const votes=current.pageIdentities.filter(p=>group.pageIds.includes(p.pageId)).flatMap(p=>p.evidence||[]);
    return clearestEvidence(votes.map(v=>v.evidence).filter(e=>e?.box&&sources[e.sourceImageId]))||null;
  }
  function advanceReview(next){
    const item=reviewQueue(next).find(q=>!visited.current.has(q.groupId+':'+q.key));
    if(item)openItem(item,next,true);else{setSelection(null);setComplete(Boolean(onSaveReading));}
  }
  function skip(){visited.current.add(selection.groupId+':'+selection.key);advanceReview(result);}
  function closeSource(){if(saving)return;retryGeneration.current++;setBusy(false);setSelection(null);setComplete(false);}
  async function finish(next=result){
    if(saving)return;setSaving(true);setError('');
    try{const value={analysis,result:next,summary:savedReadingReview(next)};await onSaveReading?.(value);setSelection(null);setComplete(false);}
    catch(failure){setError(failure.message||'Reading was not saved. Try again.');}
    finally{setSaving(false);}
  }
  function select(group,key,field,candidate,evidence) {
    setComplete(false);
    setSelection({groupId:group.id,key,field,candidate,evidence});
    retryGeneration.current++;setBusy(false);setRereadText('');
    setDraft(field.correction?.value??candidate?.value??candidate?.rawValue??'');setError('');
  }
  function confirm(advance=false,finishAfter=false) {
    try{
      const request={documentId:result.documentId,groupId:selection.groupId,field:selection.key,rawValue:draft,userConfirmed:true,expectedRevision:result.reviewRevision,...selection.evidence};
      const next=selection.key===null?confirmDocumentKind(result,{...request,kind:draft}):selection.candidate?confirmField(result,{...request,evidence:selection.evidence,expectedRawValues:selection.field.candidates.map(c=>c.rawValue)}):confirmPageField(result,request);
      update(next);setError('');setRereadText('');
      if(finishAfter){setSelection(null);setComplete(true);}else if(advance){visited.current.add(selection.groupId+':'+selection.key);advanceReview(next);}else setSelection(null);
    }catch(e){setError(e.message);}
  }
  async function retryArea(){
    const token=++retryGeneration.current,source=sources[selection?.evidence?.sourceImageId];if(!source||busy)return;
    setBusy(true);setError('');setRereadText('');
    try{
      const dimensions=await loadImage(source),box=selection.evidence.box;
      const rectangle=box?{left:Math.max(0,Math.floor(box.x*dimensions.width)-8),top:Math.max(0,Math.floor(box.y*dimensions.height)-6),width:0,height:0}:null;
      if(rectangle){rectangle.width=Math.min(dimensions.width-rectangle.left,Math.ceil(box.width*dimensions.width)+16);rectangle.height=Math.min(dimensions.height-rectangle.top,Math.ceil(box.height*dimensions.height)+12);}
      const read=await recognizeDocumentText(source,{signal,pageSegMode:box?'7':'11',returnLayout:false,thresholdingMethod:'2',...(rectangle?{rectangle}:{})});
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
      {group.identityStatus==='needs_review'?<p>Document fields suggest this type. Confirm it against the page.</p>:null}
      {group.checks.some(check=>check.id==='invoice_arithmetic'&&check.status==='needs_review')?<p role="alert">Subtotal plus tax does not match the total. Check the amounts.</p>:null}
      {group.checks.some(check=>check.id==='receipt_arithmetic'&&check.status==='needs_review')?<p role="alert">Unloading amount plus fee does not match the receipt total. Check the amounts.</p>:null}
      {group.checks.some(check=>check.id==='receipt_arithmetic'&&check.status==='passed')?<p>Unloading amount plus fee matches the receipt total.</p>:null}
      {group.kind==='unknown'?<p>Choose the document type to review its fields. The page stays included. <button type="button" onClick={()=>openItem({groupId:group.id,key:null})}>Choose document type</button></p>:null}
      {Object.entries(group.fields).map(([key,field])=><div key={key} className="owned-reader-field">
        <b>{field.label}</b>{field.status==='needs_review'?<button type="button" className="owned-reader-check-source" aria-label={`Check ${field.label} source`} onClick={()=>openItem({groupId:group.id,key})}>Check reading · View source</button>:<span>{field.status==='confirmed'?'Confirmed':field.status==='supported'?'Source found':'Missing'}</span>}
        {field.correction?<p>{field.correction.value}</p>:null}
        {!field.candidates.some(c=>c.issue!=='form_instructions')?<button type="button" onClick={()=>openItem({groupId:group.id,key})}>Enter {field.label.toLowerCase()} from page</button>:null}
        {field.candidates.filter(candidate=>candidate.issue!=='form_instructions').map((candidate,ci)=><div key={ci}>{sourcePages(candidate).map(e=><button type="button" key={e.pageId} onClick={()=>select(group,key,field,candidate,e)}>{candidate.rawValue} · Page {e.pageNumber}</button>)}</div>)}
      </div>)}
      <details><summary>Read page text</summary>{group.pageIds.map(id=>{
        const page=result.pages.find(p=>p.id===id);
        return <div key={id}><b>Page {page.number}</b><pre>{page.observations[0]?.lines.map(l=>l.text).join('\n')||'No readable text'}</pre></div>;
      })}</details>
    </article>)}
    {modalOpen?<dialog ref={inspect} className="owned-reader-inspect owned-reader-fullscreen" aria-label="Check source" onCancel={event=>{event.preventDefault();closeSource();}}>
      {selection?<>
      <header className="reader-review-header"><div><small>{queue.length} items to check</small><h3 tabIndex={-1}>{selection.field?.label||'Document type'} · Page {selection.evidence?.pageNumber||'?'}</h3></div><button type="button" aria-label="Close source" disabled={saving} onClick={closeSource}>Close</button></header>
      {selection.evidence?<SourceImage key={[selection.groupId,selection.key,selection.evidence.sourceImageId,selection.evidence.observationId,selection.evidence.lineId].join(':')} file={sources[selection.evidence.sourceImageId]} evidence={selection.evidence} continuations={selection.candidate?.continuationEvidence||[]}/>:<p>The source image is unavailable. Skip this item and check the original file.</p>}
      <div className="reader-review-controls">
      {source?<blockquote>{source.line.text.slice(0,selection.evidence.start)}<mark>{selection.evidence.quote}</mark>{source.line.text.slice(selection.evidence.end)}</blockquote>:null}
      {selection.candidate?.continuationEvidence?.filter(e=>e.pageId===selection.evidence?.pageId&&e.observationId===selection.evidence?.observationId).map((e,i)=><blockquote key={i}>{selection.candidate.continuationKind==='party_block'?'Additional company line:':'Adjacent company suffix:'} <mark>{e.quote}</mark></blockquote>)}
      {selectablePages.length>1?<label>Source page<select aria-label="Source page" value={selection.evidence?.pageId||''} onChange={event=>{retryGeneration.current++;setBusy(false);setRereadText('');setDraft('');setError('');setSelection({...selection,evidence:selectablePages.find(p=>p.pageId===event.target.value)});}}>{selectablePages.map(p=><option key={p.pageId} value={p.pageId}>Page {p.pageNumber}</option>)}</select></label>:null}
      <label>{selection.key===null?'Document type':'Confirmed value'}{selection.key===null?<select aria-label="Document type in reader" value={draft} onChange={e=>setDraft(e.target.value)}><option value="">Choose type</option>{reviewKinds.map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select>:<input aria-label="Confirmed value" disabled={busy||saving} value={draft} onChange={e=>setDraft(e.target.value)}/>}</label>
      {rereadText?<p role="status">{rereadText}</p>:null}
      {error?<p role="alert">{error}</p>:null}
      <div className="reader-review-actions">
        <button type="button" className="owned-reader-confirm-primary" aria-label="Save & next" disabled={busy||saving||!selection.evidence||!draft.trim()} onClick={()=>confirm(true)}>Next →</button>
        <button type="button" className="reader-review-skip" aria-label="Skip for now" disabled={busy||saving} onClick={skip}>Skip for now</button>
      </div>
      <div className="reader-review-tools">
        {selection.key&&sources[selection.evidence?.sourceImageId]?<button type="button" disabled={busy||saving} onClick={retryArea}>{busy?'Reading area…':'Reread this area'}</button>:<span/>}
        <button type="button" disabled={busy||saving||!selection.evidence||!draft.trim()} onClick={()=>confirm(false)}>Confirm value</button>
      </div>
      {onSaveReading?<button type="button" className="reader-review-save" disabled={busy||saving} onClick={()=>{if(selection.evidence&&draft.trim())confirm(false,true);else{setSelection(null);setComplete(true);}}}>Finish review</button>:null}
      </div>
      </>:<div className="reader-review-complete"><h3>Save this reading</h3><p>{queue.length?`${queue.length} items remain unchecked. Confirmed values and source suggestions will be saved with their review status.`:'All requested corrections are ready to save.'}</p>{error?<p role="alert">{error}</p>:null}<button type="button" className="reader-review-save" disabled={saving} onClick={()=>finish()}>{saving?'Saving reading…':'Save reading'}</button>{queue.length?<button type="button" disabled={saving} onClick={()=>openItem(queue[0])}>Review remaining</button>:null}<button type="button" disabled={saving} onClick={closeSource}>Return to document</button></div>}
    </dialog>:null}
    {error&&!modalOpen?<p role="alert">{error}</p>:null}
    <button type="button" onClick={download}>Export reading review</button>
  </div>;
}

export default function ReaderPreview({analysis,reviewState,onReviewChange,onReady,signal,defaultExpanded=false,onSaveReading}) {
  const [open,setOpen]=useState(Boolean(defaultExpanded || analysis?.typeEvidenceV110334?.mixedDocuments));
  return <section className="owned-reader-preview">
    <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Reader preview · {open?'Close':'Check source'}</button>
    <div hidden={!open}><ReviewBody analysis={analysis} reviewState={reviewState?.analysis===analysis?reviewState:null} onReviewChange={onReviewChange} onReady={onReady} signal={signal} onSaveReading={onSaveReading}/></div>
  </section>;
}
