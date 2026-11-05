'use client';
import {confirmReviewedKind} from '../../../../lib/reader-ai/confirm.js';
import {aiReadingDiagnostics} from '../../../../lib/reader-ai/diagnostics.js';
import {AI_LABELS} from '../../../../lib/reader-ai/policy.js';
import AiClassificationSummary from './AiClassificationSummaryV110398.jsx';
import {createAnalysisProjection} from '../../../../packages/smart-reader-core/src/analysisProjection.js';
import AiExtractionReview from './AiExtractionReviewV110398.jsx';
import React,{useEffect,useRef,useState} from 'react';
import CompactReading from './CompactReadingV1104101.jsx';
import {restoreConfirmedReading} from '../../../../packages/smart-reader-core/src/continuity.js';
import {reviewScanAnalysis} from './ownedReaderAdapter.js';
import {retainedReviewPageSources} from './readerPageSourcesV110373.js';
import SourceImage from './OwnedReaderSourceFocusV110360.jsx';
import {confirmPageField,confirmDocumentKind,reviewQueue,reviewKinds,savedReadingReview} from '../../../../packages/smart-reader-core/src/recovery.js';
import {recognizeDocumentText} from './webOcr.js';
import {fieldsForProfile} from '../../../../packages/smart-reader-core/src/engine.js';
import {resolveEvidence,confirmField} from '../../../../packages/smart-reader-core/src/index.js';
import {clearestEvidence,clearestCandidate} from '../../../../packages/smart-reader-core/src/reviewEvidence.js';
import MeasurementReview,{WeightUnitChoices} from './MeasurementReviewV110387.jsx';
import {reviewSteps} from '../../../../packages/smart-reader-core/src/reviewSteps.js';
import {confirmMeasurementGroup} from '../../../../packages/smart-reader-core/src/measurementReview.js';
import {visibleMeasurementCandidates} from '../../../../packages/smart-reader-core/src/measurementConsensus.js';
import {referenceDiscrepancies} from '../../../../packages/smart-reader-core/src/referenceDiscrepancies.js';

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

function aiReadingSummary(result,analysis){
  const diagnostics=aiReadingDiagnostics({...analysis,aiExtraction:result.aiExtraction||analysis.aiExtraction});
  const enriched={...analysis,...diagnostics};
  return {...savedReadingReview(result),...diagnostics,readerAnalysisV1:createAnalysisProjection({analysis:enriched,review:{analysis:enriched,result},selectedType:analysis.type?.id||''})};
}
function sourcePages(candidate) {
  const pages=new Map();
  for(const evidence of candidate.evidence){
    pages.set(evidence.pageId,clearestEvidence([...(pages.has(evidence.pageId)?[pages.get(evidence.pageId)]:[]),evidence]));
  }
  return [...pages.values()];
}

function ReviewBody({analysis,reviewState,onReviewChange,onReady,signal,onSaveReading,previousReadings=[],onAiExtraction,compact=false,disabled=false}) {
  const [result,setResult]=useState(null),[sources,setSources]=useState({}),[selection,setSelection]=useState(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false),[saving,setSaving]=useState(false);
  const active=useRef(0),inspect=useRef(null),retryGeneration=useRef(0),visited=useRef(new Set());
  const latestCallbacks=useRef({onReady,onReviewChange});latestCallbacks.current={onReady,onReviewChange};
  const [busy,setBusy]=useState(false),[rereadText,setRereadText]=useState(''),[advanced,setAdvanced]=useState(false);
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
      const documentId=reviewState?.result?.documentId||`review-${crypto.randomUUID()}`,dimensions={},files={},originalSources={};
      for(const pass of analysis.ocrEvidenceV110323||[]){
        if(active.current!==generation)return;
        if(!(pass.sourceImageFile instanceof Blob))continue;
        const pageId=`page-${pass.page}`,key=`${pageId}:${pass.id}`;
        try{dimensions[key]=await loadImage(pass.sourceImageFile);files[`${documentId}:${key}`]=pass.sourceImageFile;}catch{/* Text evidence remains available. */}
      }
      if(active.current!==generation)return;
      for(const {pageNumber,file}of [...retainedReviewPageSources(analysis),...(analysis.aiSourcePages||[])]){
        if(active.current!==generation)return;
        const pageId=`page-${pageNumber}`,prefix=`${documentId}:${pageId}:`;
        if(!(file instanceof Blob))continue;
        const id=prefix+'original';
        try{if(!Object.values(files).includes(file))await loadImage(file);files[id]=file;originalSources[pageId]=id;}catch{/* Keep text review available when its original cannot be opened. */}
      }
      if(active.current!==generation)return;
      const next=reviewState?.result||previousReadings.reduce((value,previous)=>restoreConfirmedReading(value,previous),reviewScanAnalysis(analysis,{documentId,dimensions,originalSources}));
      for(const page of next.pages){
        if(page.observations.some(o=>files[o.sourceImageId]))continue;
        const fallback=(analysis.scanMeta?.captureAssets||[]).find(a=>Number(a.pageIndex||0)===page.number-1&&a.kind==='perspective-corrected')?.file||analysis.scanMeta?.pageFiles?.[page.number-1];
        if(!(fallback instanceof Blob))continue;
        const id=`${documentId}:${page.id}:original`;
        try{await loadImage(fallback);files[id]=fallback;if(!page.observations.length)page.observations.push({id:'original',source:'source-image',lines:[]});page.observations[0].sourceImageId=id;}catch{}
      }
      if(active.current!==generation)return;
      for(const page of next.pages){
        const sourceImageId=originalSources[page.id];
        const hasAiSuggestion=analysis.aiClassification?.pages?.some(p=>p.pageNumber===page.number&&p.status==='suggested');
        if(sourceImageId&&!page.observations.some(o=>o.sourceImageId===sourceImageId))page.observations.push({id:'original-source',source:'source-image',sourceImageId,lines:[]});
      }
      setSources(files);setResult(next);latestCallbacks.current.onReady?.({analysis,result:next,summary:aiReadingSummary(next,analysis)});
    })().catch(e=>{if(active.current===generation)setError(e.message);});
    return ()=>{active.current++;};
  },[analysis]);

  function update(next){setResult(next);onAiExtraction?.(next.aiExtraction);latestCallbacks.current.onReviewChange?.({analysis,result:next,summary:aiReadingSummary(next,analysis)});}
  function sourceOptions(group){
    return result.pages.filter(p=>group.pageIds.includes(p.id)).flatMap(page=>{
      const observation=page.observations.find(o=>sources[o.sourceImageId]);
      return observation?[{pageId:page.id,pageNumber:page.number,sourceImageId:observation.sourceImageId}]:[];
    });
  }
  function sourceFor(group){return sourceOptions(group)[0]||null;}
  function aiSuggestion(group){
    if(group.pageIds.length!==1 || group.typeCorrection || Object.values(group.fields).some(field=>field.status==='confirmed'))return null;
    const page=result.pages.find(p=>p.id===group.pageIds[0]);
    return analysis.aiClassification?.pages?.find(p=>p.pageNumber===page?.number&&p.status==='suggested'&&reviewKinds.some(k=>k.id===p.result?.kind))?.result||null;
  }
  function checkAiSuggestion(group){
    const suggestion=aiSuggestion(group);if(!suggestion)return;
    openItem({groupId:group.id,key:null});setDraft(suggestion.kind);
    // Match the retained original sent to AI, not an OCR filter derivative.
    const page=result.pages.find(p=>p.id===group.pageIds[0]),sourceImageId=result.documentId+':'+page.id+':original';
    const evidence=sources[sourceImageId]?{pageId:page.id,pageNumber:page.number,sourceImageId}:sourceFor(group);
    setSelection(value=>({...value,evidence}));
  }
  function checkAiFieldSuggestion(candidate){
    const group=result.documents.find(item=>item.id===candidate.groupId),field=group?.fields[candidate.field];
    const source=candidate.provenance?.providerImage;
    if(!field || field.status==='confirmed' || !source || !group.pageIds.includes(source.pageId) || !sources[source.sourceImageId])return;
    openItem({groupId:group.id,key:candidate.field});setDraft(candidate.rawValue);
    // Manual source confirmation, never an injected OCR candidate.
    setSelection(value=>({...value,candidate:null,evidence:{pageId:source.pageId,pageNumber:source.pageNumber,sourceImageId:source.sourceImageId,boxScope:'page'},aiCandidate:true}));
  }
  function steps(current=result,seen=new Set()){
    return reviewSteps(current,{visited:seen,canGroup:proposal=>proposal.entries.every(entry=>Boolean(sources[entry.evidence.sourceImageId]))});
  }
  function viewWeightSource(groupId,key){
    openItem({groupId,key},result,true);setSelection(value=>({...value,returnToWeights:groupId}));
  }
  function openItem(item,current=result,continuing=false){
    if(!continuing)visited.current.clear();setComplete(false);
    retryGeneration.current++;setBusy(false);setRereadText('');
    if(!item){setSelection(null);return;}
    const group=current.documents.find(g=>g.id===item.groupId),field=group.fields[item.key];
    if(item.kind==='weights'){
      setSelection({groupId:group.id,weightGroup:true,keys:item.keys||['netWeight','tareWeight','weight']});setDraft('');setError('');return;
    }
    if(!field){setSelection({groupId:group.id,key:null,field:null,evidence:typeSource(group,current)||sourceFor(group)});setDraft(group.kind==='unknown'?'':group.kind);setError('');return;}
    const choice=clearestCandidate(field.candidates,evidence=>Boolean(sources[evidence.sourceImageId]));
    select(group,item.key,field,choice?.candidate,choice?.evidence||sourceFor(group));
  }
  function typeSource(group,current){
    const votes=current.pageIdentities.filter(p=>group.pageIds.includes(p.pageId)).flatMap(p=>p.evidence||[]);
    return clearestEvidence(votes.map(v=>v.evidence).filter(e=>e?.box&&sources[e.sourceImageId]))||null;
  }
  function advanceReview(next){
    const item=steps(next,visited.current)[0];
    if(item)openItem(item,next,true);else{setSelection(null);setComplete(Boolean(onSaveReading));}
  }
  function skip(){
    for(const key of selection.weightGroup?selection.keys:[selection.key])visited.current.add(selection.groupId+':'+key);
    advanceReview(result);
  }
  function closeSource(){
    if(saving)return;
    if(selection?.returnToWeights&&steps().some(item=>item.kind==='weights'&&item.groupId===selection.returnToWeights)){
      openItem({kind:'weights',groupId:selection.returnToWeights},result,true);return;
    }
    retryGeneration.current++;setBusy(false);setSelection(null);setComplete(false);
  }
  async function finish(next=result){
    if(saving)return;setSaving(true);setError('');
    try{const value={analysis,result:next,summary:aiReadingSummary(next,analysis)};await onSaveReading?.(value);setSelection(null);setComplete(false);}
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
      const next=selection.key===null?confirmReviewedKind(result,{...request,kind:draft}):selection.candidate?confirmField(result,{...request,evidence:selection.evidence,expectedRawValues:selection.field.candidates.map(c=>c.rawValue)}):confirmPageField(result,request);
      if(selection.key)delete next.documents.find(group=>group.id===selection.groupId).fields[selection.key].retainedConfirmation;
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
  function confirmWeights(groupId,unit,expectedSignature){
    const next=confirmMeasurementGroup(result,{documentId:result.documentId,groupId,unit,expectedSignature,expectedRevision:result.reviewRevision,userConfirmed:true});
    if(!selection?.weightGroup)visited.current.clear();
    update(next);setError('');advanceReview(next);
  }
  function download() {
    const url=URL.createObjectURL(new Blob([JSON.stringify({...result,readerAnalysisV1:aiReadingSummary(result,analysis).readerAnalysisV1,referenceWarnings:referenceDiscrepancies(result),...aiReadingDiagnostics({...analysis,aiExtraction:result.aiExtraction||analysis.aiExtraction})},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='document-reader-review.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(!result)return <p role="status">{error||'Preparing source evidence…'}</p>;
  const source=selection?.candidate?resolveEvidence(result,selection.evidence):null;
  const queue=reviewQueue(result),reviewActions=steps();
  const referenceWarnings=referenceDiscrepancies(result);
  const selectablePages=selection&&!selection.candidate?sourceOptions(result.documents.find(g=>g.id===selection.groupId)):[];
  return <div className="owned-reader-body">
    {result.restoredConfirmationCount?<p role="status">{result.restoredConfirmationCount} saved confirmations kept. Review a saved value to change it.</p>:null}
    {result.continuityWarning?<p role="alert">{result.continuityWarning}</p>:null}
    {compact?result.documents.map(group=><CompactReading key={result.documentId+':'+group.id} analysis={analysis} result={result} group={group} sources={sources} signal={signal} disabled={disabled||busy||saving||modalOpen} onStage={stage=>update({...result,aiExtraction:stage})} onConfirm={update} onField={key=>openItem({groupId:group.id,key})} suggestion={aiSuggestion(group)} onKind={()=>aiSuggestion(group)?checkAiSuggestion(group):openItem({groupId:group.id,key:null})}/>):null}
    {compact?<button type="button" aria-expanded={advanced} disabled={disabled} onClick={()=>setAdvanced(value=>!value)}>All reading details</button>:null}
    <div hidden={compact&&!advanced}>
    <p>Check uncertain readings against the page. Confirmed details stay with this scan and are saved on this device when you save the document.</p>
    <div className="owned-reader-recovery"><b>{queue.length} items to check{reviewActions.length<queue.length?` · ${reviewActions.length} review ${reviewActions.length===1?'step':'steps'}`:''}</b><button type="button" disabled={!reviewActions.length||busy||saving} onClick={()=>openItem(reviewActions[0])}>Fix next reading</button></div>
    {!queue.length&&result.documents.some(g=>g.fields.weight?.correction?.confirmationMethod==='measurement_group')?<p role="status" className="reader-weight-complete">Weights confirmed.{onSaveReading?' Your confirmed values are ready to save.':' Save the document to keep this reading.'}</p>:null}
    <p role="status">{result.pageCount} {result.pageCount===1?'page':'pages'} · {result.documents.length} {result.documents.length===1?'document':'documents'}</p>
    {result.unreadablePageIds.length>0?<p>Some pages have no readable text. Check their originals.</p>:null}
    {result.documents.map(group=><article key={group.id} className="owned-reader-document">
      <h3>{group.label} · {group.pageIds.map(id=>result.pages.find(p=>p.id===id)?.number).join(', ')}</h3>
      {group.boundaryReview?<p>Check whether these pages belong together.</p>:null}
      {aiSuggestion(group)?<aside aria-label="AI type suggestion"><b>AI suggests {AI_LABELS[aiSuggestion(group).kind]}</b><p>Check the original before confirming. AI evidence:</p><ul>{aiSuggestion(group).evidence.map((e,i)=><li key={i}>{e.quote} · {e.location} of page</li>)}</ul><button type="button" onClick={()=>checkAiSuggestion(group)}>Check AI suggestion</button></aside>:null}
      {referenceWarnings.filter(w=>w.groupId===group.id).map((warning,i)=><div key={i} role="alert" className="reader-reference-warning-v373"><p>{warning.message}</p><p><b>{warning.value}</b> versus <b>{warning.expected}</b></p>{warning.status==='confirmed_difference'?<p>You confirmed the different source reference. These documents remain separate.</p>:null}<button type="button" onClick={()=>openItem({groupId:group.id,key:warning.key})}>Check document reference</button></div>)}
      {group.identityStatus==='needs_review'?<p>Document fields suggest this type. Confirm it against the page.</p>:null}
      {group.checks.some(check=>check.id==='invoice_arithmetic'&&check.status==='needs_review')?<p role="alert">Subtotal plus tax does not match the total. Check the amounts.</p>:null}
      {group.checks.some(check=>check.id==='receipt_arithmetic'&&check.status==='needs_review')?<p role="alert">Unloading amount plus fee does not match the receipt total. Check the amounts.</p>:null}
      {group.checks.some(check=>check.id==='receipt_arithmetic'&&check.status==='passed')?<p>Unloading amount plus fee matches the receipt total.</p>:null}
      {group.checks.filter(check=>check.id==='bol_weight_arithmetic'&&check.status!=='not_checked').map(check=><p key={check.id} role={check.status==='needs_review'?'alert':undefined}>{check.message}</p>)}
      {group.checks.filter(check=>check.id==='bol_barcode_comparison').map((check,i)=><div className="reader-barcode-check" key={check.id+i}>
        <p role={check.status==='needs_review'?'alert':undefined}><b>Barcode: {check.value}</b> · {check.message}</p>
        <button type="button" onClick={()=>openItem({groupId:group.id,key:'bolNumber'})}>Check BOL number</button>
        {sources[check.evidence.sourceImageId]?<details><summary>View barcode source</summary><SourceImage file={sources[check.evidence.sourceImageId]} evidence={check.evidence}/></details>:null}
      </div>)}
      <MeasurementReview key={result.documentId+':'+result.reviewRevision+':'+group.id} group={group} sources={sources} disabled={busy||saving} onSource={key=>openItem({groupId:group.id,key})} onConfirm={(unit,signature)=>confirmWeights(group.id,unit,signature)}/>
      {group.kind==='unknown'?<p>Choose the document type to review its fields. The page stays included. <button type="button" onClick={()=>openItem({groupId:group.id,key:null})}>Choose document type</button></p>:null}
      {Object.entries(group.fields).filter(([,field])=>!field.displayWhenFound||field.candidates.length||field.correction).map(([key,field])=><div key={key} className="owned-reader-field">
        <b>{field.label}</b>{field.status==='needs_review'?<button type="button" className="owned-reader-check-source" aria-label={`Check ${field.label} source`} onClick={()=>openItem({groupId:group.id,key})}>Check reading · View source</button>:<span>{field.status==='confirmed'?'Confirmed':field.status==='supported'?'Source found':'Missing'}</span>}
        {field.correction?<p>{field.correction.value}</p>:null}
        {field.numberSupport?.resolvedRawValues.length?<details><summary>Other readings</summary>{field.candidates.filter(c=>field.numberSupport.resolvedRawValues.includes(c.rawValue)).map((candidate,ci)=><div key={ci}>{sourcePages(candidate).map(e=><button type="button" key={e.pageId} onClick={()=>select(group,key,field,candidate,e)}>{candidate.rawValue} · Page {e.pageNumber}</button>)}</div>)}</details>:null}
        {field.retainedConfirmation?<div className="reader-retained-v371"><span>Saved confirmation kept</span><button type="button" aria-label={`Review saved ${field.label}`} onClick={()=>openItem({groupId:group.id,key})}>Review saved value</button><small>Readings below are source suggestions. Your saved value stays until you confirm a change.</small></div>:null}
        {!field.candidates.some(c=>c.issue!=='form_instructions')?<button type="button" onClick={()=>openItem({groupId:group.id,key})}>Enter {field.label.toLowerCase()} from page</button>:null}
        {visibleMeasurementCandidates(field).filter(candidate=>candidate.issue!=='form_instructions').map((candidate,ci)=><div key={ci}>{sourcePages(candidate).map(e=><button type="button" key={e.pageId} onClick={()=>select(group,key,field,candidate,e)}>{candidate.continuationKind==='address'&&candidate.value?candidate.value:candidate.rawValue} · Page {e.pageNumber}</button>)}</div>)}
      </div>)}
      {!compact?<AiExtractionReview analysis={analysis} result={result} group={group} sources={sources} signal={signal} disabled={busy||saving||modalOpen} onStage={stage=>update({...result,aiExtraction:stage})} onCandidate={checkAiFieldSuggestion}/>:null}
      <details><summary>Read page text</summary>{group.pageIds.map(id=>{
        const page=result.pages.find(p=>p.id===id);
        return <div key={id}><b>Page {page.number}</b><pre>{page.observations[0]?.lines.map(l=>l.text).join('\n')||'No readable text'}</pre></div>;
      })}</details>
    </article>)}
    </div>
    {modalOpen?<dialog ref={inspect} className="owned-reader-inspect owned-reader-fullscreen" aria-label="Check source" onCancel={event=>{event.preventDefault();closeSource();}}>
      {selection?.weightGroup?<>
        <header className="reader-review-header"><div><small>Three weights · one unit</small><h3 tabIndex={-1}>Shipment weights</h3></div><button type="button" aria-label="Close source" disabled={saving} onClick={closeSource}>Close</button></header>
        <div className="reader-weight-modal">
          <MeasurementReview key={result.documentId+':'+result.reviewRevision+':'+selection.groupId} group={result.documents.find(g=>g.id===selection.groupId)} sources={sources} disabled={busy||saving} onSource={key=>viewWeightSource(selection.groupId,key)} onConfirm={(unit,signature)=>confirmWeights(selection.groupId,unit,signature)}/>
          <button type="button" className="reader-review-skip" disabled={busy||saving} onClick={skip}>Skip weights for now</button>
        </div>
      </>:selection?<>
      <header className="reader-review-header"><div><small>{queue.length} items to check</small><h3 tabIndex={-1}>{selection.field?.label||'Document type'} · Page {selection.evidence?.pageNumber||'?'}</h3></div><button type="button" aria-label="Close source" disabled={saving} onClick={closeSource}>{selection.returnToWeights?'Back to weights':'Close'}</button></header>
      {selection.evidence?<SourceImage key={[selection.groupId,selection.key,selection.evidence.sourceImageId,selection.evidence.observationId,selection.evidence.lineId].join(':')} file={sources[selection.evidence.sourceImageId]} evidence={selection.evidence} continuations={selection.candidate?.continuationEvidence||[]}/>:<p>The source image is unavailable. Skip this item and check the original file.</p>}
      <div className="reader-review-controls">
      {source?<blockquote>{source.line.text.slice(0,selection.evidence.start)}<mark>{selection.evidence.quote}</mark>{source.line.text.slice(selection.evidence.end)}</blockquote>:null}
      {selection.candidate?.continuationEvidence?.filter(e=>e.pageId===selection.evidence?.pageId&&e.observationId===selection.evidence?.observationId).map((e,i)=><blockquote key={i}>{selection.candidate.continuationKind==='weight_unit'?'Weight unit:':selection.candidate.continuationKind==='address'?'Address continuation:':selection.candidate.continuationKind==='party_block'?'Additional company line:':'Adjacent company suffix:'} <mark>{e.quote}</mark></blockquote>)}
      {selectablePages.length>1?<label>Source page<select aria-label="Source page" value={selection.evidence?.pageId||''} onChange={event=>{retryGeneration.current++;setBusy(false);setRereadText('');setDraft('');setError('');setSelection({...selection,evidence:selectablePages.find(p=>p.pageId===event.target.value)});}}>{selectablePages.map(p=><option key={p.pageId} value={p.pageId}>Page {p.pageNumber}</option>)}</select></label>:null}
      <label>{selection.key===null?'Document type':'Confirmed value'}{selection.key===null?<select aria-label="Document type in reader" value={draft} onChange={e=>setDraft(e.target.value)}><option value="">Choose type</option>{reviewKinds.map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select>:<input aria-label="Confirmed value" disabled={busy||saving} value={draft} onChange={e=>setDraft(e.target.value)}/>}</label>
      {selection.field?.kind==='shipping_weight'?<WeightUnitChoices value={draft} onChange={value=>{setDraft(value);setError('');}} disabled={busy||saving}/>:null}
      {selection.field?.kind==='temperature_instruction'?<p>This is the printed temperature setting instruction. Check the sign and any condition, such as “Frozen loads”.</p>:null}
      {selection.aiCandidate?<p>AI suggested this value. Check the original page before confirming. No field has been changed yet.</p>:null}
      {rereadText?<p role="status">{rereadText}</p>:null}
      {error?<p role="alert">{error}</p>:null}
      <div className="reader-review-actions">
        <button type="button" className="owned-reader-confirm-primary" aria-label="Save & next" disabled={busy||saving||!selection.evidence||!draft.trim()} onClick={()=>confirm(true)}>Confirm &amp; Next →</button>
        <button type="button" className="reader-review-skip" aria-label="Skip for now" disabled={busy||saving} onClick={skip}>Skip for now</button>
      </div>
      <div className="reader-review-tools">
        {selection.key&&sources[selection.evidence?.sourceImageId]?<button type="button" disabled={busy||saving} onClick={retryArea}>{busy?'Reading area…':'Reread this area'}</button>:<span/>}
        <button type="button" disabled={busy||saving||!selection.evidence||!draft.trim()} onClick={()=>confirm(false)}>Confirm value</button>
      </div>
      {onSaveReading?<button type="button" className="reader-review-save" disabled={busy||saving} onClick={()=>{if(selection.evidence&&draft.trim())confirm(false,true);else{setSelection(null);setComplete(true);}}}>Finish review</button>:null}
      </div>
      </>:<div className="reader-review-complete"><h3>Save this reading</h3><p>{queue.length?`${queue.length} items remain unchecked. Confirmed values and source suggestions will be saved with their review status.`:'All requested corrections are ready to save.'}</p>{error?<p role="alert">{error}</p>:null}<button type="button" className="reader-review-save" disabled={saving} onClick={()=>finish()}>{saving?'Saving reading…':'Save reading'}</button>{queue.length?<button type="button" disabled={saving} onClick={()=>openItem(reviewActions[0])}>Review remaining</button>:null}<button type="button" disabled={saving} onClick={closeSource}>Return to document</button></div>}
    </dialog>:null}
    {error&&!modalOpen?<p role="alert">{error}</p>:null}
    {!compact||advanced?<button type="button" onClick={download}>Export reading review</button>:null}
  </div>;
}

export default function ReaderPreview({analysis,reviewState,onReviewChange,onReady,signal,defaultExpanded=false,onSaveReading,previousReadings=[],compact=false,disabled=false}) {
  const [aiExtractionView,setAiExtractionView]=useState({analysis,stage:analysis.aiExtraction});
  const [open,setOpen]=useState(Boolean(defaultExpanded || analysis?.typeEvidenceV110334?.mixedDocuments));
  return <section className="owned-reader-preview">
    {!compact?<AiClassificationSummary analysis={{...analysis,aiExtraction:aiExtractionView.analysis===analysis&&aiExtractionView.stage?aiExtractionView.stage:reviewState?.analysis===analysis?reviewState?.result?.aiExtraction||analysis.aiExtraction:analysis.aiExtraction}}/>:null}
    {!compact?<button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Reader preview · {open?'Close':'Check source'}</button>:null}
    <div hidden={!compact&&!open}><ReviewBody compact={compact} disabled={disabled} onAiExtraction={stage=>setAiExtractionView({analysis,stage})} analysis={analysis} reviewState={reviewState?.analysis===analysis?reviewState:null} onReviewChange={onReviewChange} onReady={onReady} signal={signal} onSaveReading={onSaveReading} previousReadings={previousReadings}/></div>
  </section>;
}
