'use client';

import React, {useEffect, useRef, useState} from 'react';
import {usePortalClient} from './PortalSession.jsx';
import {loadOriginal,appointment} from './portalData.js';
import {rpc, useRead, ReadState, money} from './Step3Workspace.jsx';
import {PdfDialog} from './PilotRateconReview.jsx';
import styles from './step3.module.css';

const invoiceStatuses = {
  pending_review:'Pending office review', ready:'Ready for billing review',
  factoring_recorded:'Factoring record on file', correction_review:'Correction needs office review',
};
const mailStatuses = {
  pending:'Queued', processing:'Processing', sending:'Submitting', accepted:'Accepted by Outlook',
  retry:'Waiting for retry', review:'Check Hotmail before retrying',
};

async function readPod(client, id) {
  const name = 'rr_lease_pod_workflow_original';
  const first = await rpc(client, name, {p_document_id:id, p_index:0});
  if (!first?.base64) throw Error('The original is unavailable for this office account.');
  const source = {
    async rpc(_, args) {
      if (args.p_index === 0) return {data:first.base64};
      const chunk = await rpc(client, name, args);
      return {data:chunk?.base64};
    },
  };
  return loadOriginal(source, {...first, id, is_ready:true, storage_backend:'database'}, name);
}

function AttachmentViewer({file,onClose}) {
  const dialog = useRef(null);
  const [url,setUrl] = useState('');
  useEffect(() => {
    if (file.type === 'application/pdf') return;
    const element = dialog.current;
    const src = URL.createObjectURL(file);
    setUrl(src);
    element.showModal();
    return () => { element.close(); URL.revokeObjectURL(src); };
  }, [file]);
  if (file.type === 'application/pdf') return <PdfDialog cachedBlob={file} heading="Signed POD" onClose={onClose}/>;
  return <dialog ref={dialog} aria-label="POD original" className={styles.panel}
    style={{maxWidth:'94vw',maxHeight:'94dvh',color:'var(--fg)'}}
    onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className={styles.detail}><button type="button" autoFocus onClick={onClose}>Close</button>
      {url && <img src={url} alt="Original proof of delivery" style={{maxWidth:'100%',height:'auto'}}/>}
    </div>
  </dialog>;
}

function DraftDocument({draft,preview}) {
  const [file,setFile] = useState(null);
  const [url,setUrl] = useState('');
  const [open,setOpen] = useState(false);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const opener = useRef(null);
  useEffect(() => {
    if (!file) return;
    const src = URL.createObjectURL(file);
    setUrl(src);
    return () => URL.revokeObjectURL(src);
  }, [file]);
  async function openDraft(){
    if (file) {setOpen(true); return;}
    setBusy(true);
    setError('');
    try {
      const {buildPodInvoiceDraft} = await import('./podInvoicePdf.js');
      const bytes = await buildPodInvoiceDraft(draft, {preview});
      setFile(new Blob([bytes], {type:'application/pdf'}));
      setOpen(true);
    } catch {
      setError('Could not open the invoice draft. Try again.');
    } finally {setBusy(false);}
  }
  return <div className={styles.row}>
    <button type="button" aria-haspopup="dialog" ref={opener} disabled={busy} onClick={openDraft}>
      {busy ? 'Preparing PDF…' : 'View draft invoice'}
    </button>
    {file && url && <a href={url} download={'DRAFT-Narta-' + draft.draft_id + '.pdf'}>Download draft PDF</a>}
    {file && open && <PdfDialog heading="Freight invoice draft" cachedBlob={file} onClose={() => {
      setOpen(false);
      requestAnimationFrame(() => opener.current?.focus());
    }}/>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

function DeliveryCoverage({draft,document,onRecord}) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const current = draft.deliveries?.covered || [];
  const assignments = draft.deliveries?.assignments || current;
  const total = draft.deliveries?.total;
  const covered = current.find(s => s.document_id === document.document_id);
  if (covered) return <small>Verified proof for delivery {covered.delivery} of {total}.</small>;
  return <details className={styles.panel}><summary>Assign verified POD to a delivery</summary>
    <form className={styles.detail} onSubmit={async e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const delivery = Number(form.get('delivery')), count = Number(form.get('total'));
      const previous = assignments.find(s => s.delivery === delivery);
      if (delivery > count) {setError('The delivery number exceeds the total.');return;}
      if (previous && !form.has('replace')) {setError('Confirm replacement of the existing proof for this delivery.');return;}
      setBusy(true); setError('');
      try {await onRecord(draft.load_id, delivery, count, document.document_id, previous?.document_id || null);}
      catch (cause) {setError(cause.message || 'Could not save the delivery.');}
      finally {setBusy(false);}
    }}>
      <label>Delivery number<input type="number" name="delivery" min="1" max={total || 100} step="1" required/></label>
      <label>Total deliveries on rate confirmation<input type="number" name="total" min="1" max="100" step="1" required defaultValue={total ?? ''} readOnly={!!total}/></label>
      {assignments.length > 0 && <label className={styles.checkbox}><input type="checkbox" name="replace"/>Replace prior proof if this delivery has one</label>}
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record delivery coverage'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </details>;
}

function MailReconciliation({documentId,onResolve}) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const lock = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    const fields = new FormData(event.currentTarget);
    const outcome = fields.get('outcome'), reference = fields.get('reference').trim();
    if (!['received','declined'].includes(outcome) || reference.length < 5) {
      setError('Select a confirmed outcome and enter its evidence reference.');
      return;
    }
    lock.current = true;
    setBusy(true); setError('');
    try {await onResolve(documentId,outcome === 'received',reference);}
    catch (cause) {setError(cause.message || 'Could not record the mail outcome.');}
    finally {lock.current = false;setBusy(false);}
  }
  return <details className={styles.panel}>
    <summary>Resolve Hotmail notification</summary>
    <form className={styles.detail} onSubmit={submit}>
      <p>Search the mailbox for <strong>{'RR-POD-' + documentId}</strong>. A retry requires a provider report confirming the message was declined.</p>
      <label>Verified outcome<select name="outcome" defaultValue="" required>
        <option value="" disabled>Select confirmed outcome</option>
        <option value="received">Receipt confirmed in Hotmail</option>
        <option value="declined">Provider confirmed non-acceptance · queue retry</option>
      </select></label>
      <label>Mailbox or provider evidence reference<input name="reference" required minLength={5} maxLength={400}/></label>
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record confirmed outcome'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </details>;
}

function DraftCard({draft,preview,focused,onOpenOriginal,onRecordCoverage,renderReview,onResolveMail}) {
  const [file,setFile] = useState(null);
  const [loading,setLoading] = useState(null);
  const [error,setError] = useState('');
  const opener = useRef(null);
  const working = ['ready','pending_review'].includes(draft.status);
  const reasons = draft.blocking_reasons || [];
  const docs = draft.notifications || [];
  async function openOriginal(id, button) {
    setError(''); setLoading(id);
    opener.current = button;
    try {
      const blob = await onOpenOriginal(id);
      if (!(blob instanceof Blob)) throw Error('Original unavailable');
      setFile(blob);
    } catch {setError('Could not open the POD original. Try again.');}
    finally {setLoading(null);}
  }
  return <details className={styles.panel} open={focused || undefined}><summary>
    <span><strong>{draft.broker_name} · {draft.load_number}</strong>
      <small>{invoiceStatuses[draft.status] || 'Office review'} · {draft.gross_cents == null ? 'Rate pending' : money(draft.gross_cents)}</small></span>
  </summary><div className={styles.detail}>
    <dl className={styles.pairs}><div><dt>Bill to</dt><dd>{draft.broker_name}</dd></div>
      <div><dt>Driver</dt><dd>{draft.driver_name}</dd></div>
      <div><dt>Approved broker gross</dt><dd>{draft.gross_cents == null ? 'Pending rate verification' : money(draft.gross_cents)}</dd></div>
      {draft.invoice_number && <div><dt>Invoice on file</dt><dd>{draft.invoice_number}</dd></div>}
      {draft.deliveries?.total && <div><dt>Deliveries with verified POD</dt><dd>{draft.deliveries.covered.length} of {draft.deliveries.total}</dd></div>}
    </dl>
    {reasons.length > 0 && <ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
    {working && <DraftDocument key={JSON.stringify([draft.draft_id,draft.invoice_number,draft.status,draft.gross_cents,
      draft.broker_name,draft.load_number,draft.pickup_address,draft.delivery_address,preview])} draft={draft} preview={preview}/>}
    {docs.length > 0 && <section className={styles.stack}><h3>POD originals</h3>
      {docs.map(doc => <div className={styles.stack} key={doc.document_id}>
        <div><strong>{doc.file_name || 'Signed POD'}</strong>
          <small>{doc.addendum ? 'Post-billing correction · ' : ''}{preview ? 'Test Hotmail' : 'Hotmail'} · {mailStatuses[doc.status] || 'Awaiting status'}</small>
          {doc.received_at && <small>Received {appointment(doc.received_at,'America/Chicago')}</small>}
          {doc.reason && <small>{doc.reason}</small>}
        </div>
        {onOpenOriginal && <button type="button" disabled={!!loading} onClick={e => openOriginal(doc.document_id,e.currentTarget)}>
          {loading === doc.document_id ? 'Opening…' : 'View POD original'}
        </button>}
        {doc.status === 'review' && onResolveMail && <MailReconciliation documentId={doc.document_id} onResolve={onResolveMail}/>}
        {doc.review_status && <small>Office review · {doc.review_status}</small>}
        {working && !doc.addendum && doc.review_status?.toUpperCase() === 'PENDING' && renderReview &&
          <details className={styles.panel}><summary>Review this POD</summary><div className={styles.detail}>
            <p>Confirm the load and signed delivery. For a wrong-load POD, reject it and record the reason.</p>
            {renderReview(doc)}
          </div></details>}
        {working && doc.verified_for_billing && !doc.addendum && onRecordCoverage &&
          <DeliveryCoverage draft={draft} document={doc} onRecord={onRecordCoverage}/>}
      </div>)}
    </section>}
    {file && <AttachmentViewer file={file} onClose={() => {setFile(null);requestAnimationFrame(() => opener.current?.focus());}}/>}
    {error && <p role="alert">{error}</p>}
  </div></details>;
}

export function PodInvoiceDrafts({drafts,preview = false,focused = false,onOpenOriginal,onRecordCoverage,renderReview,onResolveMail}) {
  return <section aria-label="Freight invoice drafts" className={styles.stack}>
    <h2>Freight invoice drafts</h2>
    {!drafts.length && <p>{focused ? 'This load has no invoice draft available to this office.' : 'No POD invoice drafts.'}</p>}
    {drafts.map(draft => <DraftCard key={draft.load_id} draft={draft} preview={preview} focused={focused || drafts.length === 1}
      onOpenOriginal={onOpenOriginal} onRecordCoverage={onRecordCoverage} renderReview={renderReview} onResolveMail={onResolveMail}/>)}
  </section>;
}

export default function CarrierPodInvoiceInbox({refresh,done,loadId,onClear,renderReview}) {
  const client = usePortalClient();
  const [cursors,setCursors] = useState([null]);
  const after = cursors.at(-1);
  const state = useRead(() => rpc(client,'rr_lease_pod_invoice_drafts', {
    p_after_load_id:after, p_limit:50, p_load_id:loadId || null,
  }), [client,refresh,after,loadId]);
  const loadDocs = id => readPod(client,id);
  const resolveMail = async (documentId,hasReceipt,reference) => {
    const changed = await rpc(client,'rr_lease_pod_mail_reconcile',{
      p_document:documentId,p_has_receipt:hasReceipt,p_reference:reference,
    });
    if (!changed) throw Error('This notice has changed. Refresh to see the latest mail status.');
    done();
  };
  const record = async (id,delivery,total,document,previous) => {
    await rpc(client,'rr_lease_pod_cover_delivery',{
      p_load_id:id, p_delivery:delivery, p_total:total, p_document_id:document, p_previous_document_id:previous,
    });
    done();
  };
  return <div className={styles.stack}>
    {loadId && <button type="button" onClick={onClear}>All invoice drafts</button>}
    <ReadState state={state}>{drafts => <>
      <PodInvoiceDrafts drafts={drafts} focused={!!loadId} onOpenOriginal={loadDocs} onRecordCoverage={record} renderReview={renderReview} onResolveMail={resolveMail}/>
      {!loadId && <div className={styles.row}>
        {cursors.length > 1 && <button type="button" onClick={() => setCursors(c => c.slice(0,-1))}>Previous drafts</button>}
        {drafts.length === 50 && <button type="button" onClick={() => setCursors(c => [...c,drafts.at(-1).load_id])}>More drafts</button>}
      </div>}
    </>}</ReadState>
  </div>;
}
