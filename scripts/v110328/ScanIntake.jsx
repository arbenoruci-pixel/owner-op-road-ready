'use client';
import React,{useEffect,useRef,useState} from 'react';
import CameraAdapterV3 from './v3/CameraAdapterV3.jsx';
import ReviewScreenV3 from './v3/ReviewScreenV3.jsx';
import {scannerEngineV3} from './v3/ScannerEngineV3.js';
import {decodeImageFileV3,imageDataToFileV3} from './v3/imageUtilsV3.js';
import {loadPdfJs} from './pdfTextV102.js';
import {FULL_PAGE,PHOTO_ACCEPT,FILE_ACCEPT,MAX_PHOTO_PAGES,normalizeScanFile,validateSelection,movePage,photoPagesToPdf} from './scanIntakeV110328.js';

function Glyph({name}) {
  const paths={camera:<><path d="M8 5 6 8H3v12h18V8h-3l-2-3Z"/><circle cx="12" cy="14" r="4"/></>,photos:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,file:<><path d="M14 3H5v18h14V8Z M14 3v5h5 M8 12h8 M8 16h6"/></>,back:<path d="m15 5-7 7 7 7"/>,plus:<path d="M12 5v14 M5 12h14"/>,check:<path d="m5 12 4 4 10-10"/>};
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.file}</svg>;
}
function useBlobUrl(blob) {
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!blob){setUrl('');return;}const next=URL.createObjectURL(blob);setUrl(next);return()=>URL.revokeObjectURL(next);},[blob]);
  return url;
}
function Thumbnail({file,alt=''}) {const url=useBlobUrl(file);return url?<img src={url} alt={alt}/>:<Glyph name="file"/>;}

// PDF preview is bounded and cancellable. Failure leaves the original selectable
// for the offline reader; it never claims the page count or preview was checked.
function PdfPreview({file,onDetails}) {
  const canvasRef=useRef(null),[message,setMessage]=useState('Opening preview…'),[count,setCount]=useState(0),[pageNumber,setPageNumber]=useState(1),[expanded,setExpanded]=useState(false);
  useEffect(()=>{if(!expanded)return;const close=event=>{if(event.key==='Escape')setExpanded(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[expanded]);
  useEffect(()=>{
    let alive=true,task,renderTask,pdf,timer;
    (async()=>{try{
      const pdfjs=await Promise.race([loadPdfJs(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Preview unavailable')),12000);})]);
      clearTimeout(timer);if(!alive)return;
      task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true});
      timer=setTimeout(()=>{if(alive){setMessage('Preview unavailable. You can still read the original file.');task?.destroy();}},15000);
      pdf=await task.promise;if(!alive)return;
      setCount(pdf.numPages);onDetails?.(pdf.numPages);
      const page=await pdf.getPage(Math.min(pageNumber,pdf.numPages)),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1.8,900/base.width)});
      if(!alive)return;
      const canvas=canvasRef.current;canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await renderTask.promise;
      if(alive)setMessage('');page.cleanup?.();
    }catch(error){if(alive)setMessage(error?.name==='PasswordException'?'This PDF is password protected. Choose an unlocked copy.':'Preview unavailable. You can still read the original file.');}
    finally{clearTimeout(timer);await pdf?.destroy?.();}})();
    return()=>{alive=false;clearTimeout(timer);renderTask?.cancel();task?.destroy?.();};
  },[file,pageNumber]);
  return <div className={expanded?"scan-pdf-v328 scan-pdf-expanded-v328":"scan-pdf-v328"} role={expanded?"dialog":undefined} aria-modal={expanded?true:undefined} aria-label={expanded?"PDF page preview":undefined}>{expanded&&<button autoFocus type="button" className="scan-pdf-close-v328" onClick={()=>setExpanded(false)}>Close PDF preview</button>}<div className="scan-paper-preview-v328"><canvas ref={canvasRef} aria-label={`PDF preview, page ${pageNumber}`} hidden={Boolean(message)}/>{!expanded&&!message&&<button type="button" className="scan-preview-expand-v328" onClick={()=>setExpanded(true)}>Enlarge PDF preview</button>}{message&&<p role="status"><Glyph name="file"/>{message}</p>}</div>{count>0&&<div className="scan-pdf-pages-v328"><button type="button" disabled={pageNumber===1} aria-label="Previous PDF page" onClick={()=>setPageNumber(n=>n-1)}>‹</button><span>Page {pageNumber} of {count}</span><button type="button" disabled={pageNumber===count} aria-label="Next PDF page" onClick={()=>setPageNumber(n=>n+1)}>›</button></div>}</div>;
}

export default function ScanIntakeV110328({onReady,onClose,initialDraft}) {
  const [pages,setPages]=useState(()=>initialDraft?.pages||[]),[selected,setSelected]=useState(()=>initialDraft?.pages?.[0]?.id||''),[mode,setMode]=useState('pages'),[crop,setCrop]=useState(null),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[pdfCount,setPdfCount]=useState(0),[zoom,setZoom]=useState(false);
  const photosRef=useRef(null),fileRef=useRef(null),generation=useRef(0),busyRef=useRef(false);
  useEffect(()=>()=>{generation.current++;},[]);
  const current=pages.find(page=>page.id===selected)||pages[0],isImage=current?.file.type.startsWith('image/'),imagePages=pages.every(page=>page.file.type.startsWith('image/'));
  const preview=current?.result?.displayFile||current?.preview;
  function start(message){busyRef.current=true;setBusy(true);setError('');setStatus(message);return ++generation.current;}
  function finish(token){if(token===generation.current){busyRef.current=false;setBusy(false);setStatus('');}}
  function close(){generation.current++;onClose?.();}
  async function addFiles(selection) {
    if(!selection.length||busyRef.current)return;
    const token=start('Opening your document…');
    try{
      const files=[];for(const item of selection){files.push(await normalizeScanFile(item));if(token!==generation.current)return;}
      validateSelection(pages.map(page=>page.file),files);
      const added=[];
      for(const file of files){
        let preview=null;
        if(file.type.startsWith('image/')){
          setStatus(`Preparing photo ${added.length+1} of ${files.length}…`);
          try {const pixels=await decodeImageFileV3(file,{maxDimension:1400});preview=await imageDataToFileV3(pixels,'page-preview.jpg',.9);}
          catch{throw new Error(`“${file.name}” could not be opened. Try a JPG, PNG or a new photo.`);}
        }
        if(token!==generation.current)return;
        added.push({id:crypto.randomUUID(),file,preview,corners:FULL_PAGE,rotation:0});
      }
      setPages(previous=>[...previous,...added]);setSelected(added[0].id);setPdfCount(0);setMode('pages');
    }catch(cause){if(token===generation.current)setError(cause.message||'The file could not be opened. Try another copy.');}
    finally{finish(token);}
  }
  function inputChanged(event){const files=Array.from(event.target.files||[]);event.target.value='';void addFiles(files);}
  function remove(id){setPages(previous=>{const next=previous.filter(page=>page.id!==id);if(selected===id)setSelected(next[0]?.id||'');return next;});setError('');setPdfCount(0);}
  async function editPage(){
    if(!current||busyRef.current)return;
    const token=start('Finding the paper edges…');
    try{
      let session=await scannerEngineV3.prepare(current.file,{source:'page-review'});
      for(let i=0;i<(current.rotation||0)/90;i++)session=await scannerEngineV3.rotate(session);
      if(token!==generation.current)return;
      // Keep the entire source on first open. Auto edges is an explicit choice.
      session.corners=current.corners||FULL_PAGE;
      setCrop({id:current.id,session});setMode('crop');
    }catch(cause){if(token===generation.current)setError(cause.message||'Could not open the page editor.');}
    finally{finish(token);}
  }
  async function rotateCrop(){
    if(busyRef.current)return;const token=start('Rotating page…');
    try{const session=await scannerEngineV3.rotate(crop.session);if(token===generation.current)setCrop({...crop,session});}
    catch(cause){if(token===generation.current)setError(cause.message||'Could not rotate this page.');}finally{finish(token);}
  }
  async function applyCrop(corners){
    if(busyRef.current)return;const token=start('Preparing the corrected page…');
    try{const result=await scannerEngineV3.finalize(crop.session,corners);if(token!==generation.current)return;
      setPages(previous=>previous.map(page=>page.id===crop.id?{...page,result,corners,rotation:crop.session.rotation}:page));setMode('pages');setCrop(null);
    }catch(cause){if(token===generation.current)setError(cause.message||'Could not apply this crop. Try Full page.');}finally{finish(token);}
  }
  async function readDocument(){
    if(!pages.length||busyRef.current)return;const token=start('Preparing your document…');
    try{
      const draft={pages};
      if(!imagePages){
        const file=pages[0].file;
        onReady?.(file,'auto',{source:'file-intake-v110328',imported:true,pageCount:pdfCount||undefined,originalFileName:file.name,intakeDraftV110328:draft});return;
      }
      const prepared=[];
      for(let i=0;i<pages.length;i++){
        setStatus(`Preparing page ${i+1} of ${pages.length}…`);
        const page=pages[i];let result=page.result;
        if(!result){const session=await scannerEngineV3.prepare(page.file,{source:'photo-intake'});if(token!==generation.current)return;result=await scannerEngineV3.finalize(session,FULL_PAGE);}
        if(token!==generation.current)return;
        prepared.push({...page,result});
        // Keep completed work if a later page fails or the driver returns.
        setPages(previous=>previous.map(item=>item.id===page.id?{...item,result}:item));
      }
      const captures=prepared.map(page=>page.result),captureAssets=captures.flatMap((result,index)=>result.metadata.captureAssets.map(asset=>({...asset,pageIndex:index})));
      let file=captures[0].displayFile;
      if(captures.length>1){
        const pdfPages=[];
        for(const result of captures){const pixels=await decodeImageFileV3(result.displayFile,{maxDimension:3000});pdfPages.push({file:result.displayFile,width:pixels.width,height:pixels.height});if(token!==generation.current)return;}
        file=await photoPagesToPdf(pdfPages);
      }
      if(token!==generation.current)return;
      const issues=[...new Set(captures.flatMap((capture,index)=>(capture.metadata.documentQualityV11036?.issues||[]).map(issue=>`Page ${index+1}: ${issue}`)))];
      onReady?.(file,'auto',{...captures[0].metadata,source:'page-intake-v110328',scannerVersion:'110.3.28',pageCount:captures.length,displayFile:captures[0].displayFile,ocrFile:captures[0].ocrFile,pageFiles:captures.map(c=>c.ocrFile),captureAssets,documentQualityV11036:{...captures[0].metadata.documentQualityV11036,issues},captureManifest:{version:'110.3.28',pageCount:captures.length,pages:captures.map(c=>c.metadata.captureManifest)},originalFileName:pages.length===1?pages[0].file.name:file.name,intakeDraftV110328:{pages:prepared}});
    }catch(cause){if(token===generation.current)setError(cause.message||'Could not prepare this document. Your selected pages are still here.');}finally{finish(token);}
  }
  if(mode==='camera')return <CameraAdapterV3 onCancel={()=>setMode('pages')} onCapture={file=>{setMode('pages');void addFiles([file]);}}/>;
  if(mode==='crop'&&crop)return <ReviewScreenV3 session={crop.session} onRotate={rotateCrop} onRetake={()=>{setMode('pages');setCrop(null);setError('');}} onDone={applyCrop} processing={busy} status={status} error={error}/>;
  return <section className="scan-intake-v328" aria-label="Document scanner" aria-busy={busy}>
    <header className="scan-intake-head-v328"><button type="button" className="scan-icon-v328" onClick={close} aria-label="Close scanner"><Glyph name="back"/></button><div><span>ROAD READY</span><b>Smart Scan</b></div><span className="scan-private-v328"><Glyph name="check"/> On device</span></header>
    <main>
      <nav className="scan-stages-v328" aria-label="Scan progress"><b aria-current="step"><span>1</span>Pages</b><i/><span><em>2</em>Read & review</span><i/><span><em>3</em>Save</span></nav>
      {!pages.length?<>
        <div className="scan-intake-title-v328"><span>YOUR PAPERWORK, IN ORDER</span><h1>A clear scan.<br/>An easier day.</h1><p>Capture a document or choose your files.<br/>Check the pages before we read them.</p></div>
        <button type="button" className="scan-camera-action-v328" disabled={busy} onClick={()=>setMode('camera')}><span className="scan-action-icon-v328"><Glyph name="camera"/></span><span><b>Scan with camera</b><small>Capture a clear photo of each page</small></span><span aria-hidden="true">↗</span></button>
        <div className="scan-import-actions-v328"><button type="button" disabled={busy} onClick={()=>photosRef.current?.click()}><Glyph name="photos"/><b>Choose photos</b><small>Select up to {MAX_PHOTO_PAGES} pages</small></button><button type="button" disabled={busy} onClick={()=>fileRef.current?.click()}><Glyph name="file"/><b>Choose a file</b><small>PDF, photo, TXT or CSV</small></button></div>
        <div className="scan-intake-tip-v328"><Glyph name="file"/><p><b>One document at a time</b><span>Keep every corner visible. Include all pages of the same BOL, POD, receipt or rate confirmation.</span></p></div>
      </>:<>
        <div className="scan-pages-heading-v328"><div><h1>Check your pages</h1><p>{imagePages?`${pages.length} of ${MAX_PHOTO_PAGES} photos · One document`:pdfCount?`${pdfCount} PDF ${pdfCount===1?"page":"pages"} · Original file`:'Original file'}</p></div>{imagePages&&<span className="scan-page-badge-v328">{pages.findIndex(p=>p.id===current?.id)+1}/{pages.length}</span>}</div>
        {isImage?<>
          <button type="button" className="scan-paper-preview-v328 scan-preview-button-v328" disabled={busy} onClick={()=>setZoom(true)} aria-label="Enlarge selected page"><Thumbnail file={preview} alt={`Page ${pages.findIndex(p=>p.id===current.id)+1} preview`}/><span>Tap to enlarge</span></button>
          <div className="scan-page-tools-v328"><button type="button" disabled={busy} onClick={editPage}>Crop & rotate</button><button type="button" disabled={busy} onClick={()=>remove(current.id)}>Remove page</button></div>
          <ol className="scan-page-list-v328" aria-label="Document page order">{pages.map((page,index)=><li key={page.id} aria-current={page.id===current.id?'true':undefined}><button type="button" disabled={busy} onClick={()=>setSelected(page.id)} aria-label={`Select page ${index+1}`}><Thumbnail file={page.result?.displayFile||page.preview}/><span><b>Page {index+1}</b><small>{page.file.name}</small></span></button><div><button type="button" aria-label={`Move page ${index+1} earlier`} disabled={busy||index===0} onClick={()=>setPages(previous=>movePage(previous,page.id,-1))}>↑</button><button type="button" aria-label={`Move page ${index+1} later`} disabled={busy||index===pages.length-1} onClick={()=>setPages(previous=>movePage(previous,page.id,1))}>↓</button></div></li>)}</ol>
          <div className="scan-add-actions-v328"><button type="button" disabled={busy||pages.length>=MAX_PHOTO_PAGES} onClick={()=>photosRef.current?.click()}><Glyph name="plus"/>Add photos</button><button type="button" disabled={busy||pages.length>=MAX_PHOTO_PAGES} onClick={()=>setMode('camera')}><Glyph name="camera"/>Camera</button></div>
        </>:<>
          {current.file.type==='application/pdf'?<PdfPreview key={current.id} file={current.file} onDetails={setPdfCount}/>:<div className="scan-text-preview-v328"><Glyph name="file"/><b>Ready to read</b><p>The original file will be included with your document.</p></div>}
          <div className="scan-file-row-v328"><Glyph name="file"/><div><b>{current.file.name}</b><span>{current.file.size<1024*1024?`${Math.max(1,Math.round(current.file.size/1024))} KB`:`${(current.file.size/1024/1024).toFixed(1)} MB`}</span></div><button type="button" disabled={busy} onClick={()=>remove(current.id)}>Remove</button></div>
        </>}
      </>}
      {error&&<div className="scan-error-v328" role="alert">{error}</div>}
      {busy&&<div className="scan-working-v328" role="status"><span/>{status}</div>}
    </main>
    <footer className="scan-intake-footer-v328">{pages.length>0?<><button type="button" className="scan-read-v328" disabled={busy} onClick={readDocument}>{busy?'Preparing…':'Read document'}<span aria-hidden="true">→</span></button><p>Review the details before saving.</p></>:<p>Photos stay in their original form. Nothing is saved until you confirm.</p>}</footer>
    <input ref={photosRef} type="file" accept={PHOTO_ACCEPT} multiple hidden onChange={inputChanged} disabled={busy}/><input ref={fileRef} type="file" accept={FILE_ACCEPT} hidden onChange={inputChanged} disabled={busy}/>
    {zoom&&<div className="scan-zoom-v328" role="dialog" aria-modal="true" aria-label="Full page preview"><button autoFocus type="button" onClick={()=>setZoom(false)}>Close preview</button><div tabIndex="0" onKeyDown={event=>{if(event.key==='Escape')setZoom(false);}}><Thumbnail file={preview} alt="Full document page"/></div><p>Scroll to inspect the small print.</p></div>}
  </section>;
}
