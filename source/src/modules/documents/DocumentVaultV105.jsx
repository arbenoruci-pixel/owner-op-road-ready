'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  BUSINESS_STORE_EVENT,
  readBusinessStore,
  writeBusinessStore,
} from '../business/businessStore.js';
import { documentTypeMeta, SMART_DOCUMENT_TYPES } from '../scan/smartScan.js';
import { getScannedDocumentBlob } from '../scan/scanStorage.js';
import {
  collectLoadCandidatesV105,
  documentFolderV105,
  migrateBusinessStoreV105,
  normalizeCanonicalLoadNoV105,
  normalizeDateV105,
  searchVaultDocumentsV105,
  upsertVaultDocumentV105,
  vaultFoldersV105,
} from './documentFoundationV105.js';

function Icon({ name, size = 20 }) {
  const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.9', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'back') return <svg {...p}><path d="m15 18-6-6 6-6"/></svg>;
  if (name === 'search') return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
  if (name === 'folder') return <svg {...p}><path d="M3 6h7l2 2h9v11H3z"/></svg>;
  if (name === 'file') return <svg {...p}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6M9 16h5"/></svg>;
  if (name === 'scan') return <svg {...p}><path d="M4 8V5h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10"/></svg>;
  if (name === 'edit') return <svg {...p}><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10zM13.5 6.5 17 10"/></svg>;
  if (name === 'eye') return <svg {...p}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.4"/></svg>;
  if (name === 'archive') return <svg {...p}><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"/></svg>;
  if (name === 'check') return <svg {...p}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'alert') return <svg {...p}><path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9"/></svg>;
}

function fmtDate(value = '') {
  const day = normalizeDateV105(value);
  if (!day) return 'Date not confirmed';
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}

function statusLabel(document = {}) {
  if (document.status === 'archived') return 'Archived';
  if (document.status === 'needs_review' || document.reviewStatus === 'needs_review') return 'Needs review';
  if (document.reviewStatus === 'duplicate') return 'Possible duplicate';
  return 'Filed';
}

function virtualLocation(document = {}) {
  if (document.canonicalLoadNo) return `Load ${document.canonicalLoadNo}${document.stopSequence ? ` · Stop ${document.stopSequence}` : ''}`;
  if (document.folder === 'ifta') return 'IFTA & Fuel';
  if (document.folder === 'maintenance') return 'Maintenance';
  if (document.folder === 'compliance') return 'Compliance Wallet';
  if (document.folder === 'expenses') return 'Expenses';
  return document.status === 'needs_review' ? 'Needs Review' : 'Documents';
}

function readMigratedStore(state = {}) {
  const raw = readBusinessStore();
  const migrated = migrateBusinessStoreV105(raw, state);
  const rawSignature = JSON.stringify((raw.documents || []).map(document => ({
    id:document.id,
    canonicalLoadNo:document.canonicalLoadNo,
    status:document.status,
    folder:document.folder,
    foundationVersion:document.foundationVersion,
  })));
  const nextSignature = JSON.stringify((migrated.documents || []).map(document => ({
    id:document.id,
    canonicalLoadNo:document.canonicalLoadNo,
    status:document.status,
    folder:document.folder,
    foundationVersion:document.foundationVersion,
  })));
  return rawSignature === nextSignature ? migrated : writeBusinessStore(migrated);
}

function FolderCard({ folder, selected, onClick, tone = '' }) {
  return (
    <button type="button" className={`vault-folder-v105 ${tone} ${selected ? 'selected' : ''}`} onClick={onClick}>
      <span><Icon name={folder.kind === 'system' && folder.id === 'needs_review' ? 'alert' : 'folder'} size={19}/></span>
      <div><b>{folder.label}</b><em>{folder.broker || folder.detail || `${folder.count || 0} document${folder.count === 1 ? '' : 's'}`}</em></div>
      {folder.needsReview ? <strong>{folder.needsReview}</strong> : folder.count ? <strong>{folder.count}</strong> : null}
    </button>
  );
}

function DocumentRow({ document, onOpen }) {
  const meta = documentTypeMeta(document.type || 'other');
  const needsReview = document.status === 'needs_review' || document.reviewStatus === 'needs_review';
  return (
    <button type="button" className={`vault-document-row-v105 ${needsReview ? 'review' : ''}`} onClick={onOpen}>
      <span className="vault-document-icon-v105"><Icon name="file" size={22}/></span>
      <div className="vault-document-copy-v105">
        <span><b>{document.title || meta.label}</b><em>{statusLabel(document)}</em></span>
        <p>{virtualLocation(document)}</p>
        <small>{[fmtDate(document.documentDate || document.date), document.broker, document.fileName].filter(Boolean).join(' · ')}</small>
      </div>
      <i>›</i>
    </button>
  );
}

function Detail({ document, state, store, onClose, onStoreChange }) {
  const loads = useMemo(() => collectLoadCandidatesV105(state, store), [state, store]);
  const [draft, setDraft] = useState(() => ({
    title:document.title || '',
    type:document.type || 'other',
    documentDate:normalizeDateV105(document.documentDate || document.date),
    canonicalLoadNo:document.canonicalLoadNo || '',
    broker:document.broker || '',
    stopSequence:Number(document.stopSequence || 0),
    notes:document.notes || '',
  }));
  const [message, setMessage] = useState('');

  const selectedLoad = loads.find(load => load.loadNo === normalizeCanonicalLoadNoV105(draft.canonicalLoadNo)) || null;
  const deliveryStops = (selectedLoad?.stops || []).filter(stop => stop.type === 'delivery');

  async function viewOriginal() {
    setMessage('Opening original…');
    try {
      const blob = await getScannedDocumentBlob(document.clientDocumentId);
      if (!blob) {
        setMessage('Original is not stored on this device. The metadata remains in the Vault.');
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage('');
    } catch (error) {
      setMessage(`Could not open original: ${String(error?.message || error)}`);
    }
  }

  function save() {
    const canonicalLoadNo = normalizeCanonicalLoadNoV105(draft.canonicalLoadNo);
    const stop = deliveryStops.find(item => Number(item.deliverySequence || item.sequence || 0) === Number(draft.stopSequence || 0)) || null;
    const verified = !['rate_confirmation','bol','pod','lumper_receipt','scale_ticket'].includes(draft.type) || Boolean(canonicalLoadNo);
    const now = Date.now();
    const updated = {
      ...document,
      ...draft,
      type:draft.type,
      label:documentTypeMeta(draft.type).label,
      canonicalLoadNo,
      loadNo:canonicalLoadNo,
      documentDate:normalizeDateV105(draft.documentDate),
      date:normalizeDateV105(draft.documentDate),
      stopId:stop?.id || '',
      stopSequence:Number(draft.stopSequence || 0),
      stopCompany:stop?.company || '',
      stopLocation:stop?.cityState || '',
      broker:draft.broker || selectedLoad?.broker || '',
      status:verified ? 'verified' : 'needs_review',
      reviewStatus:verified ? 'verified' : 'needs_review',
      folder:documentFolderV105(draft.type, { canonicalLoadNo, status:verified ? 'verified' : 'needs_review' }),
      auditTrail:[
        ...(document.auditTrail || []),
        { id:`audit_${now}`, action:'edited', at:now, detail:'Document details updated in Vault', source:'document_vault_v105' },
      ],
      updatedAt:now,
    };
    const next = upsertVaultDocumentV105(store, updated, state);
    onStoreChange(writeBusinessStore(next));
    setMessage('Saved');
    setTimeout(onClose, 250);
  }

  function toggleArchive() {
    const now = Date.now();
    const archived = document.status !== 'archived';
    const updated = {
      ...document,
      status:archived ? 'archived' : (document.canonicalLoadNo || !['rate_confirmation','bol','pod'].includes(document.type) ? 'verified' : 'needs_review'),
      reviewStatus:archived ? document.reviewStatus : (document.canonicalLoadNo ? 'verified' : 'needs_review'),
      archivedAt:archived ? now : null,
      folder:archived ? 'archived' : documentFolderV105(document.type, document),
      auditTrail:[
        ...(document.auditTrail || []),
        { id:`audit_${now}`, action:archived ? 'archived' : 'restored', at:now, detail:archived ? 'Moved to Archive' : 'Restored to Vault', source:'document_vault_v105' },
      ],
      updatedAt:now,
    };
    const next = upsertVaultDocumentV105(store, updated, state);
    onStoreChange(writeBusinessStore(next));
    onClose();
  }

  return (
    <section className="screen vault-detail-screen-v105">
      <header className="vault-head-v105">
        <button type="button" onClick={onClose} aria-label="Back"><Icon name="back"/></button>
        <div><span>Document Vault</span><b>{documentTypeMeta(draft.type).label}</b></div>
        <button type="button" className="vault-head-action-v105" onClick={toggleArchive}><Icon name="archive" size={18}/></button>
      </header>
      <main className="vault-detail-body-v105">
        <section className="vault-original-card-v105">
          <span><Icon name="file" size={34}/></span>
          <div><b>{document.fileName || document.title}</b><em>Original file preserved · {document.syncState === 'synced' ? 'Cloud synced' : 'Available offline'}</em></div>
          <button type="button" onClick={viewOriginal}><Icon name="eye" size={17}/> Open</button>
        </section>

        <section className="vault-detail-card-v105">
          <header><b>File details</b><em>Edit anytime</em></header>
          <label><span>Title</span><input value={draft.title} onChange={event => setDraft({ ...draft, title:event.target.value })}/></label>
          <label><span>Document type</span><select value={draft.type} onChange={event => setDraft({ ...draft, type:event.target.value })}>{SMART_DOCUMENT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
          <label><span>Document date</span><input type="date" value={draft.documentDate || ''} onChange={event => setDraft({ ...draft, documentDate:event.target.value })}/></label>
          <label><span>Load folder</span><select value={draft.canonicalLoadNo || ''} onChange={event => setDraft({ ...draft, canonicalLoadNo:event.target.value, stopSequence:0 })}><option value="">Needs Review / No load</option>{loads.map(load => <option key={load.loadNo} value={load.loadNo}>Load {load.loadNo}{load.broker ? ` · ${load.broker}` : ''}</option>)}</select></label>
          {deliveryStops.length ? <label><span>Delivery stop</span><select value={draft.stopSequence || 0} onChange={event => setDraft({ ...draft, stopSequence:Number(event.target.value) })}><option value="0">Load level / Pickup</option>{deliveryStops.map(stop => <option key={stop.id || stop.deliverySequence} value={stop.deliverySequence || stop.sequence}>{`Stop ${stop.deliverySequence || stop.sequence} · ${stop.company || stop.cityState}`}</option>)}</select></label> : null}
          <label><span>Broker / customer</span><input value={draft.broker} onChange={event => setDraft({ ...draft, broker:event.target.value })}/></label>
          <label><span>Notes</span><textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes:event.target.value })} placeholder="Optional"/></label>
        </section>

        {document.references?.length ? <section className="vault-evidence-v105"><header><b>Identifiers found</b><em>Kept separate from Load #</em></header><div>{document.references.map((reference, index) => <span key={`${reference.kind}_${reference.value}_${index}`}><b>{String(reference.kind || 'reference').replaceAll('_', ' ')}</b><em>{reference.value}</em></span>)}</div></section> : null}
        {message ? <p className="vault-message-v105">{message}</p> : null}
        <button type="button" className="vault-save-v105" onClick={save}><Icon name="check" size={18}/> Save changes</button>
      </main>
    </section>
  );
}

export default function DocumentVaultV105({ state, onBack, onScan }) {
  const [store, setStore] = useState(() => readMigratedStore(state));
  const [folder, setFolder] = useState('recent');
  const [query, setQuery] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');

  useEffect(() => {
    function refresh(event) {
      const next = migrateBusinessStoreV105(event?.detail || readBusinessStore(), state);
      setStore(next);
    }
    window.addEventListener(BUSINESS_STORE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(BUSINESS_STORE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [state]);

  const documents = useMemo(() => migrateBusinessStoreV105(store, state).documents || [], [store, state]);
  const folders = useMemo(() => vaultFoldersV105(documents), [documents]);
  const visible = useMemo(() => {
    let list = documents;
    if (folder === 'needs_review') list = list.filter(document => document.status === 'needs_review' || document.reviewStatus === 'needs_review');
    else if (folder === 'archived') list = list.filter(document => document.status === 'archived');
    else if (folder.startsWith('load:')) list = list.filter(document => `load:${document.canonicalLoadNo}` === folder);
    else if (folder.startsWith('broker:')) list = list.filter(document => document.broker && `broker:${document.broker.toLowerCase()}` === folder);
    else list = list.filter(document => document.status !== 'archived');
    return searchVaultDocumentsV105(list, query).sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
  }, [documents, folder, query]);
  const selected = documents.find(document => document.id === selectedDocumentId) || null;

  if (selected) {
    return <Detail document={selected} state={state} store={store} onClose={() => setSelectedDocumentId('')} onStoreChange={setStore}/>;
  }

  return (
    <section className="screen document-vault-screen-v105">
      <header className="vault-head-v105">
        <button type="button" onClick={onBack} aria-label="Back"><Icon name="back"/></button>
        <div><span>Road Ready OS</span><b>Documents</b></div>
        <button type="button" className="vault-head-action-v105" onClick={onScan}><Icon name="scan" size={18}/></button>
      </header>
      <main className="vault-body-v105">
        <section className="vault-hero-v105">
          <div><span>DOCUMENT VAULT</span><h1>Every document has a home.</h1><p>Search by load, broker, document type, date, PO, BOL or receiver.</p></div>
          <strong>{documents.filter(document => document.status !== 'archived').length}<em>saved</em></strong>
        </section>

        <label className="vault-search-v105"><Icon name="search" size={19}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search load, broker, BOL, PO, city…"/>{query ? <button type="button" onClick={() => setQuery('')}>×</button> : null}</label>

        <section className="vault-system-folders-v105">
          <FolderCard folder={folders.recent} selected={folder === 'recent'} onClick={() => setFolder('recent')}/>
          <FolderCard folder={folders.needsReview} selected={folder === 'needs_review'} onClick={() => setFolder('needs_review')} tone={folders.needsReview.count ? 'warning' : ''}/>
          <FolderCard folder={{ id:'archived', kind:'system', label:'Archive', count:documents.filter(document => document.status === 'archived').length }} selected={folder === 'archived'} onClick={() => setFolder('archived')}/>
        </section>

        {folders.loads.length ? <section className="vault-folder-section-v105"><header><b>Load folders</b><em>{folders.loads.length}</em></header><div>{folders.loads.slice(0, 12).map(item => <FolderCard key={item.id} folder={item} selected={folder === item.id} onClick={() => setFolder(item.id)}/>)}</div></section> : null}
        {folders.brokers.length ? <section className="vault-folder-section-v105"><header><b>Broker folders</b><em>{folders.brokers.length}</em></header><div>{folders.brokers.slice(0, 8).map(item => <FolderCard key={item.id} folder={item} selected={folder === item.id} onClick={() => setFolder(item.id)}/>)}</div></section> : null}

        <section className="vault-document-section-v105">
          <header><b>{folder === 'recent' ? 'Recent documents' : folder === 'needs_review' ? 'Needs review' : folder === 'archived' ? 'Archived documents' : 'Folder documents'}</b><em>{visible.length}</em></header>
          {visible.length ? <div>{visible.map(document => <DocumentRow key={document.id} document={document} onOpen={() => setSelectedDocumentId(document.id)}/>)}</div> : <div className="vault-empty-v105"><span><Icon name="folder" size={28}/></span><b>No documents here</b><p>Scan or import a document and Road Ready will file the original.</p><button type="button" onClick={onScan}>Scan document</button></div>}
        </section>
      </main>
      <button type="button" className="vault-scan-fab-v105" onClick={onScan}><Icon name="scan" size={20}/> Scan anything</button>
    </section>
  );
}
