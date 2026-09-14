'use client';

import React, {useEffect, useMemo, useState} from 'react';
import {vaultBlobV102} from './documentVaultV102.js';
import './savedDocumentFilesV110344.css';

const text = value => String(value ?? '').trim();
const identity = doc => text(doc.client_document_id || doc.local_id || doc.id);
const fileName = doc => text(doc.original_file_name || doc.fileName || doc.title) || 'Document';
function savedTime(doc) {
  const value = doc.created_at || doc.createdAt;
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : 0;
}
function timeLabel(doc) {
  const time = savedTime(doc);
  return time ? `Saved ${new Date(time).toLocaleString(undefined, {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'})}` : 'Saved time unavailable';
}

// One original is loaded at a time. The share click uses a prepared File so
// iOS user activation is not lost while reading IndexedDB.
export function SavedFileActionsV110344({document: doc}) {
  const [ready, setReady] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [sharing, setSharing] = useState(false);
  const id = identity(doc || {});
  const name = fileName(doc || {});
  const mime = text(doc?.mime_type);
  useEffect(() => {
    let active = true, url = '';
    setReady(null); setError(''); setSharing(false);
    (async () => {
      try {
        const blob = await vaultBlobV102({client_document_id: doc?.client_document_id});
        if (!active) return;
        if (!blob?.size) { setError('The original file is unavailable on this device. Try the device where you saved it, or add the original again.'); return; }
        const type = blob.type || mime || 'application/octet-stream';
        const extension = type === 'application/pdf' ? '.pdf' : type === 'image/jpeg' ? '.jpg' : type === 'image/png' ? '.png' : '';
        const safeName = name.replace(/[\\/\u0000-\u001f]/g, '-');
        const downloadName = extension && !/\.[a-z0-9]{2,5}$/i.test(safeName) ? safeName + extension : safeName;
        const file = new File([blob], downloadName, {type});
        url = URL.createObjectURL(file);
        let canShare = false;
        try { canShare = Boolean(navigator.share && navigator.canShare?.({files:[file]})); } catch {}
        setReady({id, name, url, file, canShare, pdf:type === 'application/pdf'});
      } catch { if (active) setError('Could not open the saved file. Try again.'); }
    })();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id, name, mime, doc?.client_document_id, retry]);

  async function share() {
    if (!ready || sharing) return;
    setSharing(true); setError('');
    try { await navigator.share({files:[ready.file]}); }
    catch (failure) {
      if (failure?.name !== 'AbortError') setError('Sharing could not open. Use Download to save a copy.');
    } finally { setSharing(false); }
  }
  const current = ready?.id === id && ready?.name === name ? ready : null;
  return <div className="saved-file-actions-v344" aria-label="Saved file actions">
    {!current && !error ? <p role="status">Opening saved file…</p> : null}
    {current ? <>
      <p>Original available on this device.</p>
      <div className="saved-file-buttons-v344">
        <a href={current.url} target="_blank" rel="noopener noreferrer">{current.pdf ? 'Open PDF' : 'Open file'}</a>
        {current.canShare ? <button type="button" disabled={sharing} onClick={share}>{sharing ? 'Opening share…' : 'Share / Save to Files'}</button> : null}
        <a href={current.url} download={current.file.name}>Download</a>
      </div>
      <p>{current.canShare ? 'To keep a copy in your phone’s Files app, tap Share / Save to Files, then choose Save to Files.' : 'Download saves a separate copy. Your original stays in Road Ready.'}</p>
    </> : null}
    {error ? <div role="alert"><p>{error}</p>{!current ? <button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button> : null}</div> : null}
  </div>;
}

export default function SavedDocumentFilesV110344({documents = [], loading = false}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(5);
  const [selected, setSelected] = useState('');
  const files = useMemo(() => documents.filter(doc => doc && identity(doc))
    .slice().sort((a, b) => savedTime(b) - savedTime(a)), [documents]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return files.filter(doc => !needle || [fileName(doc), doc.load_no, doc.type, timeLabel(doc)].some(value => text(value).toLowerCase().includes(needle)));
  }, [files, query]);

  return <section className="saved-documents-v344" aria-labelledby="saved-documents-title-v344">
    <header><h2 id="saved-documents-title-v344">Recent documents</h2><span>{files.length} saved</span></header>
    <p>Find your scans here, newest first. Open a file to view it or save a copy to your phone.</p>
    {files.length ? <label>Find a saved document<input type="search" value={query} onChange={event => {setQuery(event.target.value); setLimit(5); setSelected('');}} placeholder="File name, load or saved date"/></label> : null}
    {loading ? <p role="status">Loading saved documents…</p> : !files.length ? <p>No saved documents yet. Tap Add scan to get started.</p> : !matches.length ? <p>No saved documents match your search.</p> : <ul>
      {matches.slice(0, limit).map(doc => {
        const id = identity(doc), expanded = selected === id;
        return <li key={id}>
          <button type="button" className="saved-document-row-v344" aria-expanded={expanded} onClick={() => setSelected(expanded ? '' : id)}>
            <span><strong>{fileName(doc)}</strong><small>{timeLabel(doc)}</small><small>{doc.load_no ? `Load ${doc.load_no}` : 'Load not assigned'}</small></span>
            <b>{expanded ? 'Close' : 'View file'}</b>
          </button>
          {expanded ? <SavedFileActionsV110344 key={id} document={doc}/> : null}
        </li>;
      })}
    </ul>}
    {matches.length > limit ? <button type="button" className="saved-documents-more-v344" onClick={() => setLimit(n => n + 10)}>Show more documents ({matches.length - limit})</button> : null}
  </section>;
}
