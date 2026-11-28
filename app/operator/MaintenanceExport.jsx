'use client';
import React,{useEffect,useRef,useState} from 'react';
import {prepareMaintenanceArchive,buildMaintenanceArchivePart} from './maintenanceArchive.js';
import css from './maintenanceExport.module.css';

function canShare(file) {
  try { return typeof navigator.canShare === 'function' && navigator.canShare({files:[file]}); }
  catch { return false; }
}

export default function MaintenanceExport({records,client,onClose}) {
  // Keep the original selection and its part numbers stable across dashboard refreshes.
  const [selection] = useState(()=>records.slice());
  const [plan,setPlan] = useState(null),[part,setPart] = useState(1),[attempt,setAttempt] = useState(0);
  const [progress,setProgress] = useState('Preparing register…'),[ready,setReady] = useState(null),[error,setError] = useState('');
  const [shared,setShared] = useState('');
  const [handedOff,setHandedOff] = useState(()=>new Set());
  const heading = useRef(null),active = useRef(null),snapshot = useRef(null),sharing = useRef(false);

  useEffect(()=>{heading.current?.focus();},[]);
  useEffect(()=>{
    const controller = new AbortController();
    const {signal} = controller;
    active.current = controller;
    let url;
    setReady(null);setError('');setShared('');setProgress('Preparing register…');
    async function prepare() {
      await Promise.resolve();
      signal.throwIfAborted();
      const archive = snapshot.current || await prepareMaintenanceArchive(selection,signal);
      signal.throwIfAborted();
      snapshot.current = archive;
      setPlan(archive);
      const file = await buildMaintenanceArchivePart(client,archive,part,signal,(n,total)=>{
        if (!signal.aborted) setProgress('Preparing original '+n+' of '+total+'…');
      });
      signal.throwIfAborted();
      url = URL.createObjectURL(file);
      setReady({file,url,part,share:canShare(file)});setProgress('');
    }
    prepare().catch(e=>{if (!signal.aborted){setError(e.message || 'Could not prepare the ZIP.');setProgress('');}});
    return ()=>{controller.abort();if(url) URL.revokeObjectURL(url);};
  },[client,selection,part,attempt]);

  function close() {
    active.current?.abort();
    onClose();
  }
  function markDownload(number) {
    setHandedOff(previous=>new Set(previous).add(number));
  }
  async function share() {
    if (!ready || sharing.current) return;
    const controller = active.current;
    setShared('');sharing.current = true;
    try {
      await navigator.share({files:[ready.file]});
      if (!controller.signal.aborted) markDownload(ready.part);
    } catch(e) {
      if (!controller.signal.aborted && e.name !== 'AbortError') setShared('Use Download ZIP to save this file.');
    } finally {sharing.current = false;}
  }

  const many = plan?.parts.length > 1;
  return <section className={css.panel} aria-label="Export maintenance">
    <header className={css.top}><h3 ref={heading} tabIndex={-1}>Export maintenance</h3>
      <button className={css.close} type="button" onClick={close}>{ready || error ? 'Close' : 'Cancel'}</button></header>
    <p>All maintenance records in one CSV, with their original receipts.</p>
    {many && <>
      <label className={css.picker}>ZIP part
        <select value={part} onChange={e=>setPart(Number(e.target.value))}>
          {plan.parts.map(({number})=><option key={number} value={number}>
            Part {number} of {plan.parts.length}{handedOff.has(number) ? ' · requested' : ''}
          </option>)}
        </select>
      </label>
      <p>Save each part for all originals. Each ZIP includes the complete register.</p>
    </>}
    {progress && <p role="status">{progress}</p>}
    {error && <><p role="alert" className={css.error}>{error}</p>
      <button className={css.secondary} type="button" onClick={()=>setAttempt(n=>n+1)}>Retry export</button></>}
    {ready?.part===part && <div className={css.actions}>
      <a className={css.download} href={ready.url} download={ready.file.name} onClick={()=>markDownload(part)}>
        {many ? 'Download part '+part : 'Download ZIP'}</a>
      {ready.share && <button className={css.secondary} type="button" onClick={share}>Share ZIP</button>}
    </div>}
    {shared && <p role="status">{shared}</p>}
  </section>;
}
