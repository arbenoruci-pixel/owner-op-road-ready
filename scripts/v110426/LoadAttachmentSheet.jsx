'use client';
import React, {useEffect, useRef, useState} from 'react';
import {localDateKey, readBusinessStore, writeBusinessStore} from '../business/businessStore.js';
import {buildVaultDocumentV105, upsertVaultDocumentV105} from '../documents/documentFoundationV105.js';
import {saveScannedDocumentQuotaSafeV10963} from './quotaSafeScanStorageV10963.js';
import {saveLoadAttachment} from './attachmentContextV110426.js';

export default function LoadAttachmentSheet({state, context, onClose}) {
  const [file, setFile] = useState(null), [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
  const camera = useRef(null), files = useRef(null), saving = useRef(false);
  useEffect(() => {if (!file) {setUrl('');return;}const next = URL.createObjectURL(file);setUrl(next);return () => URL.revokeObjectURL(next);}, [file]);
  function choose(event) {
    const selected = event.target.files?.[0];event.target.value = '';
    if (!selected) return;
    if (!(selected.type.startsWith('image/') || selected.type === 'application/pdf' || /\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(selected.name))) {setError('Choose a photo or PDF.');return;}
    setFile(selected);setError('');
  }
  async function add() {
    if (!file || saving.current) return;
    saving.current = true;setBusy(true);setError('');
    try {
      await saveLoadAttachment({file, context, date:localDateKey(), state, storage:saveScannedDocumentQuotaSafeV10963, buildRecord:buildVaultDocumentV105, upsertRecord:upsertVaultDocumentV105, readStore:readBusinessStore, writeStore:writeBusinessStore});
      window.__ROAD_READY_PENDING_DOCUMENT_REFRESH_V10972__ = {type:context.type, loadNo:context.loadNo, savedAt:Date.now()};
      setSaved(true);
    } catch {setError('Could not save. Your document is still here. Try Add again.');}
    finally {saving.current = false;setBusy(false);}
  }
  const label = context.type.toUpperCase();
  return <section className="screen load-attachment-v110426">
    <header><button type="button" disabled={busy} onClick={onClose}>Back</button><h1>Add {label}</h1></header>
    <main><h2>Load {context.loadNo}</h2>
      {saved ? <><p role="status">{label} saved to this load.</p><button type="button" onClick={onClose}>Done</button></> : <>
        {context.type === 'pod' ? <p>Add the signed delivery document.</p> : null}
        <input hidden ref={camera} type="file" accept="image/*" capture="environment" onChange={choose}/>
        <input hidden ref={files} type="file" accept="image/*,application/pdf,.heic,.heif" onChange={choose}/>
        <div className="attachment-choices"><button type="button" disabled={busy} onClick={() => camera.current.click()}>Take photo</button><button type="button" disabled={busy} onClick={() => files.current.click()}>Choose photo / PDF</button></div>
        {file ? <div className="attachment-preview">{file.type.startsWith('image/') && !/hei[cf]/i.test(file.type) ? <img src={url} alt={`${label} preview`}/> : <p>{file.name}</p>}</div> : null}
        {error ? <p role="alert">{error}</p> : null}
        <button className="attachment-save" type="button" disabled={!file || busy} onClick={add}>{busy ? 'Saving…' : 'Add'}</button>
      </>}
    </main>
  </section>;
}
