import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildBillingPacketPdfV102, downloadPdfBytesV102 } from './ownerOpsPdfV102.js';
import { planInvoiceSubmission, requireCompletePacket, submitInvoiceOnce } from './invoiceSubmissionV110320.js';
import { connectedOutlook, connectOutlook, disconnectOutlook, outlookAccessToken, outlookConfiguration, outlookOwnerKey } from './outlookConnectionV110320.js';
import './invoiceSendV110320.css';

export default function InvoiceSendPanel({ load, documents, profile, invoices, onAccepted, onFirstLine }) {
  const [config, setConfig] = useState(null);
  const [account, setAccount] = useState(() => connectedOutlook());
  const [packet, setPacket] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const running = useRef(false);
  const planning = useMemo(() => {
    try { return { plan: planInvoiceSubmission({ load, documents, profile, invoices }) }; }
    catch (e) { return { error: e.message }; }
  }, [load, documents, profile, invoices]);
  const plan = planning.plan;
  const recordKey = plan && `road-ready-invoice-send-v110320:${outlookOwnerKey()}:${profile.mcNumber || profile.carrierName}:${plan.load.id || plan.load.loadNo}`;
  useEffect(() => { let live = true; outlookConfiguration().then(value => { if (live) setConfig(value); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  useEffect(() => {
    let live = true; setPacket(null); setError('');
    try { setReceipt(recordKey ? JSON.parse(localStorage.getItem(recordKey) || 'null') : null); } catch { setReceipt(null); }
    if (plan) buildBillingPacketPdfV102({ ...plan, download: false }).then(result => {
      requireCompletePacket(plan, result); if (live) setPacket({ ...result, plan });
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [plan, recordKey]);
  async function connect() {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { setAccount(await connectOutlook(config, profile.email)); } catch (e) { setError(e.message); } finally { running.current = false; setBusy(false); }
  }
  async function send() {
    if (running.current || !packet || packet.plan !== plan) return;
    running.current = true; setBusy(true); setError('');
    try {
      const token = await outlookAccessToken();
      const sendingAccount = connectedOutlook();
      if (!sendingAccount || sendingAccount.email !== account?.email) throw Error('The Outlook account changed. Review the sender before sending.');
      const execute = () => submitInvoiceOnce({ storage: localStorage, recordKey, plan, bytes: packet.bytes, from: sendingAccount.email, send: payload => fetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000) }) });
      const accepted = navigator.locks ? await navigator.locks.request(recordKey, execute) : await execute();
      setReceipt(accepted); onAccepted?.(accepted);
    } catch (e) {
      setError(e.message); setAccount(connectedOutlook());
      try { setReceipt(JSON.parse(localStorage.getItem(recordKey) || 'null')); } catch { /* keep visible prior state */ }
    } finally { running.current = false; setBusy(false); }
  }
  function preview() {
    if (!packet || packet.plan !== plan) return;
    const url = URL.createObjectURL(new Blob([packet.bytes], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
  const tooLarge = packet?.bytes?.length >= 3_000_000;
  const accepted = receipt?.status === 'accepted';
  const uncertain = ['sending', 'unknown'].includes(receipt?.status);
  return <section className="invoice-send-v110320" aria-label="Send invoice">
    <header><span>INVOICE & DELIVERY PAPERWORK</span><h3>{accepted ? 'Invoice sent to Outlook' : 'Send your invoice'}</h3><p>{accepted ? 'Outlook accepted the email for sending. A copy is saved in Sent Items.' : 'Your invoice, rate confirmation and delivery pages travel together in one PDF.'}</p></header>
    <dl><div><dt>To</dt><dd>{plan?.to || (profile.factoring?.enabled ? profile.factoring.email : load?.billingEmail) || 'Choose a billing recipient below'}</dd></div><div><dt>Amount</dt><dd>{plan ? plan.invoice.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'Confirm load rate'}</dd></div><div><dt>From</dt><dd>{account?.email || 'Connect your Outlook account'}</dd></div></dl>
    {!profile.factoring?.email && <button type="button" onClick={onFirstLine}>Use FirstLine Funding Group</button>}
    {planning.error && <p role="status">{planning.error}</p>}
    {error && <p role="alert">{error}</p>}
    {uncertain && <p role="alert">The previous send may have gone through. Check Outlook Sent Items before resending this invoice.</p>}
    {plan && !packet && !error && <p role="status">Preparing the original documents…</p>}
    {tooLarge && <p role="alert">This packet exceeds Outlook’s direct attachment limit. Download the PDF and attach it in Outlook.</p>}
    {packet && <p>{packet.included.length} original document{packet.included.length === 1 ? '' : 's'} attached with invoice {plan.invoice.invoiceNo}.</p>}
    <div className="invoice-send-actions-v110320">
      <button type="button" disabled={!packet || busy} onClick={preview}>Preview packet</button>
      <button type="button" disabled={!packet || busy} onClick={() => downloadPdfBytesV102(packet.bytes, plan.fileName)}>Download PDF</button>
      {!account && <button type="button" disabled={!config?.ready || busy} onClick={connect}>{busy ? 'Connecting…' : 'Connect Outlook'}</button>}
      {account && <button type="button" className="invoice-send-primary-v110320" disabled={!packet || tooLarge || busy || accepted || uncertain} onClick={send}>{busy ? 'Sending…' : accepted ? 'Sent' : 'Send invoice'}</button>}
    </div>
    {config && !config.ready && <p role="status">Direct Outlook sending needs its one-time app connection setup. You can preview and download the complete packet now.</p>}
    {account && <button type="button" className="invoice-send-disconnect-v110320" disabled={busy} onClick={() => { disconnectOutlook(); setAccount(null); }}>Disconnect {account.email}</button>}
    {(accepted || uncertain) && <a href="https://outlook.live.com/mail/0/sentitems" target="_blank" rel="noreferrer">Open Outlook Sent Items</a>}
  </section>;
}
