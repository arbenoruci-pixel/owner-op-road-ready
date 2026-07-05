import React, { useMemo, useRef, useState } from 'react';
import {
  DOC_SECTIONS,
  DOT_DOCUMENT_REQUIREMENTS,
  evaluateDotWallet,
  normalizeWallet,
  requirementById,
  sectionSummary,
  nextExpiringRows,
} from '../../core/wallet/dotWallet.js';

function prettyDate(value) {
  if (!value) return 'No date';
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}

function statusText(row) {
  if (!row?.active) return 'Not used';
  if (row.status === 'missing') return 'Missing';
  if (row.status === 'expired') return 'Expired';
  if (row.status === 'expires_soon') return row.label;
  if (row.status === 'watch') return row.label;
  return 'OK';
}

function requirementPill(required) {
  if (required === 'roadside') return 'Roadside';
  if (required === 'roadside_if_used') return 'Roadside if used';
  if (required === 'trip') return 'Trip';
  if (required === 'carrier_file') return 'Carrier file';
  if (required === 'supporting_docs') return 'Support';
  if (required === 'conditional') return 'If needed';
  return 'Recommended';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function WalletOverview({ summary, onEditDoc }) {
  const nextExpiring = nextExpiringRows(summary.rows, 3);
  return (
    <div className={`wallet-status wallet-status-${summary.status}`}>
      <div>
        <span className="wallet-eyebrow">Roadside wallet</span>
        <b>{summary.title}</b>
        <em>{summary.detail}</em>
      </div>
      <div className="wallet-score">
        <strong>{summary.counts.ok}</strong>
        <span>ready</span>
      </div>
      {nextExpiring.length ? (
        <div className="wallet-next-list">
          {nextExpiring.map(row => (
            <button key={row.requirement.id} type="button" onClick={() => onEditDoc(row.requirement.id)}>
              <span>{row.requirement.shortTitle}</span>
              <em>{row.days <= 0 ? 'expires today' : `${row.days}d left`}</em>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SectionGrid({ rows, onSelectSection, activeSection }) {
  return (
    <div className="wallet-section-grid">
      {DOC_SECTIONS.map(section => {
        const sum = sectionSummary(rows, section.id);
        return (
          <button
            key={section.id}
            type="button"
            className={`wallet-section-card ${activeSection === section.id ? 'active' : ''} ${sum.status}`}
            onClick={() => onSelectSection(section.id)}
          >
            <span>{section.shortTitle}</span>
            <b>{sum.label}</b>
          </button>
        );
      })}
    </div>
  );
}

function DocRow({ row, onEdit }) {
  const doc = row.doc || {};
  return (
    <button type="button" className={`wallet-doc-row ${row.severity}`} onClick={() => onEdit(row.requirement.id)}>
      <span className="wallet-doc-main">
        <b>{row.requirement.title}</b>
        <em>{row.requirement.detail}</em>
        <small>{requirementPill(row.requirement.required)}{row.expiresOn ? ` · expires ${prettyDate(row.expiresOn)}` : ''}</small>
      </span>
      <span className="wallet-doc-side">
        <strong>{statusText(row)}</strong>
        <em>{doc.attachmentDataUrl ? 'File saved' : 'No file'}</em>
      </span>
    </button>
  );
}

function DocEditor({ wallet, docId, onClose, onSave }) {
  const req = requirementById(docId);
  const fileInputRef = useRef(null);
  const existing = wallet.documents?.[docId] || {};
  const [draft, setDraft] = useState({ present:true, ...existing });
  const [busy, setBusy] = useState(false);
  if (!req) return null;

  async function attachFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setDraft(d => ({
        ...d,
        attachmentDataUrl:dataUrl,
        attachmentName:file.name,
        attachmentType:file.type,
        attachmentSize:file.size,
        attachedAt:Date.now(),
        present:true,
      }));
    } finally {
      setBusy(false);
    }
  }

  function patch(field, value) {
    setDraft(d => ({ ...d, [field]:value }));
  }

  function save() {
    onSave(docId, {
      ...draft,
      present: !!draft.present,
      updatedAt: Date.now(),
    });
  }

  return (
    <div className="wallet-editor-backdrop">
      <div className="wallet-editor sheet-panel" role="dialog" aria-modal="true">
        <div className="wallet-editor-head">
          <button type="button" onClick={onClose}>‹</button>
          <div>
            <span>DOT Wallet</span>
            <b>{req.title}</b>
          </div>
          <button type="button" className="wallet-save-small" onClick={save}>Save</button>
        </div>

        <div className="wallet-editor-body">
          {req.required === 'conditional' ? (
            <label className="wallet-check-row">
              <input type="checkbox" checked={!!draft.enabled} onChange={e => patch('enabled', e.target.checked)} />
              <span>This document applies to me</span>
            </label>
          ) : null}

          <label className="wallet-check-row">
            <input type="checkbox" checked={!!draft.present} onChange={e => patch('present', e.target.checked)} />
            <span>Document is in my wallet</span>
          </label>

          <div className="wallet-field-grid">
            {req.fields.includes('number') ? <label><span>Number</span><input value={draft.number || ''} onChange={e => patch('number', e.target.value)} /></label> : null}
            {req.fields.includes('state') ? <label><span>State</span><input value={draft.state || ''} maxLength={2} onChange={e => patch('state', e.target.value.toUpperCase())} /></label> : null}
            {req.fields.includes('unit') ? <label><span>Unit</span><input value={draft.unit || ''} onChange={e => patch('unit', e.target.value)} /></label> : null}
            {req.fields.includes('trailer') ? <label><span>Trailer / chassis</span><input value={draft.trailer || ''} onChange={e => patch('trailer', e.target.value)} /></label> : null}
            {req.fields.includes('plate') ? <label><span>Plate</span><input value={draft.plate || ''} onChange={e => patch('plate', e.target.value)} /></label> : null}
            {req.fields.includes('vin') ? <label><span>VIN</span><input value={draft.vin || ''} onChange={e => patch('vin', e.target.value)} /></label> : null}
            {req.fields.includes('carrier') ? <label><span>Insurance carrier</span><input value={draft.carrier || ''} onChange={e => patch('carrier', e.target.value)} /></label> : null}
            {req.fields.includes('policyNo') ? <label><span>Policy no.</span><input value={draft.policyNo || ''} onChange={e => patch('policyNo', e.target.value)} /></label> : null}
            {req.fields.includes('mcNumber') ? <label><span>MC number</span><input value={draft.mcNumber || ''} onChange={e => patch('mcNumber', e.target.value)} /></label> : null}
            {req.fields.includes('usdotNumber') ? <label><span>USDOT</span><input value={draft.usdotNumber || ''} onChange={e => patch('usdotNumber', e.target.value)} /></label> : null}
            {req.fields.includes('year') ? <label><span>Year</span><input value={draft.year || ''} inputMode="numeric" onChange={e => patch('year', e.target.value)} /></label> : null}
            {req.fields.includes('quarter') ? <label><span>Quarter</span><input value={draft.quarter || ''} placeholder="Q1 2026" onChange={e => patch('quarter', e.target.value)} /></label> : null}
            {req.fields.includes('loadNo') ? <label><span>Load no.</span><input value={draft.loadNo || ''} onChange={e => patch('loadNo', e.target.value)} /></label> : null}
            {req.fields.includes('bolNo') ? <label><span>BOL / shipping no.</span><input value={draft.bolNo || ''} onChange={e => patch('bolNo', e.target.value)} /></label> : null}
            {req.fields.includes('inspectionDate') ? <label><span>Inspection date</span><input type="date" value={draft.inspectionDate || ''} onChange={e => patch('inspectionDate', e.target.value)} /></label> : null}
            {req.fields.includes('expiresOn') ? <label><span>Expiration date</span><input type="date" value={draft.expiresOn || ''} onChange={e => patch('expiresOn', e.target.value)} /></label> : null}
          </div>

          <label className="wallet-full-field"><span>Notes</span><textarea value={draft.notes || ''} onChange={e => patch('notes', e.target.value)} placeholder="Optional note" /></label>

          <div className="wallet-file-card">
            <div>
              <b>{draft.attachmentName || 'Attach photo / PDF'}</b>
              <span>{draft.attachmentDataUrl ? 'Saved locally in this app' : 'Take photo or upload document'}</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" hidden onChange={e => attachFile(e.target.files?.[0])} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>{busy ? 'Saving…' : 'Attach'}</button>
          </div>

          <div className="wallet-editor-actions">
            <button type="button" className="primary" onClick={save}>Save document</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DigitalWalletScreen({ state, onBack, onSaveDocument, onOpenLogs, onOpenLoad }) {
  const wallet = normalizeWallet(state.dotWallet || {});
  const [activeSection, setActiveSection] = useState('driver');
  const [editingDocId, setEditingDocId] = useState(null);
  const summary = useMemo(() => evaluateDotWallet(wallet), [wallet]);
  const sectionRows = summary.rows.filter(row => row.active && row.requirement.section === activeSection);

  function saveDoc(id, doc) {
    onSaveDocument(id, doc);
    setEditingDocId(null);
  }

  return (
    <section className="screen wallet-screen">
      <header className="wallet-head">
        <button type="button" onClick={onBack}>‹</button>
        <div>
          <span>DOT</span>
          <b>Digital Wallet</b>
        </div>
        <button type="button" onClick={() => setActiveSection('load')}>Load</button>
      </header>

      <WalletOverview summary={summary} onEditDoc={setEditingDocId} />
      <SectionGrid rows={summary.rows} activeSection={activeSection} onSelectSection={setActiveSection} />

      <div className="wallet-roadside-note">
        <b>Roadside package</b>
        <span>CDL, medical, registration, insurance, annual inspection, RODS, and BOL/shipping papers stay one tap away.</span>
      </div>

      <div className="wallet-doc-list">
        {sectionRows.map(row => <DocRow key={row.requirement.id} row={row} onEdit={setEditingDocId} />)}
      </div>

      <div className="wallet-link-actions">
        <button type="button" onClick={onOpenLogs}>Open logs / RODS</button>
        <button type="button" onClick={onOpenLoad}>Open load docs</button>
      </div>

      {editingDocId ? (
        <DocEditor wallet={wallet} docId={editingDocId} onClose={() => setEditingDocId(null)} onSave={saveDoc} />
      ) : null}
    </section>
  );
}
