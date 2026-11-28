'use client';

import React, {useState} from 'react';
import {parseUSDCents} from '../../lib/rr-lease/intake-contract.js';
import {money} from './Step3Workspace.jsx';
import css from './maintenance.module.css';

function ConfirmTotal({amountText, reason, originalUrl, onConfirm}) {
  const [amount, setAmount] = useState(amountText || '');
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    let cents;
    try {
      cents = parseUSDCents(amount);
    } catch {
      setError('Enter a USD amount with up to two decimal places.');
      return;
    }
    if (cents < 0) {
      setError('Enter a receipt total of zero or more.');
      return;
    }
    setError('');
    onConfirm(cents);
  }

  return <form className={css.box} onSubmit={submit}>
    {reason && <p>{reason}</p>}
    <label className={css.totalLabel}>Receipt total (USD)
      <input name="receiptTotal" type="text" className={css.totalInput} inputMode="decimal"
        autoComplete="off" enterKeyHint="done" placeholder="0.00" required value={amount}
        aria-invalid={Boolean(error)} aria-describedby={error ? 'receipt-amount-error' : undefined}
        onChange={event => {setAmount(event.target.value);setError('');}}/>
    </label>
    {originalUrl && <a className={css.receiptLink} href={originalUrl} target="_blank" rel="noreferrer">View original receipt</a>}
    {error && <p role="alert" id="receipt-amount-error" className={css.notice}>{error}</p>}
    <button type="submit" className={css.primary}>Confirm &amp; save</button>
  </form>;
}

const headings = {
  reading:'Reading receipt',
  saving:'Saving receipt',
  confirm:'Confirm receipt total',
  retry:'Receipt save unconfirmed',
  duplicate:'Similar receipt found',
  freight:'Bill of lading detected',
  multiple:'Choose one invoice',
  foreign:'USD receipt needed',
};

export default function ScanReceiptTotal({
  scan, originalUrl, onConfirm, onRetry, onCancel, onManual, onChooseFile, onChooseLoad,
  onSaveSeparate, onKeepExisting, matched,
}) {
  const {phase, amountCents, progress} = scan;
  return <section className={css.page} aria-label="Maintenance receipt">
    <header><h2>{headings[phase]}</h2></header>

    {phase === 'confirm' && <ConfirmTotal amountText={scan.amountText} reason={scan.reason}
      originalUrl={originalUrl} onConfirm={onConfirm}/>}

    {phase === 'reading' && <div className={css.box}>
      <p role="status">{progress?.label || 'Looking for the printed total…'}</p>
      <progress className={css.readProgress} aria-label="Receipt reading progress" max="1"
        value={Number.isFinite(progress?.fraction) ? progress.fraction : undefined}/>
      <button type="button" onClick={() => onManual()}>Enter total</button>
    </div>}

    {phase === 'saving' && <p role="status" className={css.box}>
      {amountCents != null ? 'Saving '+money(amountCents)+' with the original receipt…' : 'Saving original receipt…'}
    </p>}

    {phase === 'retry' && <div className={css.box}>
      <p role="alert">{scan.error || 'The save could not be confirmed. Retry with this receipt.'}</p>
      <button type="button" className={css.primary} onClick={() => onRetry()}>Retry save</button>
    </div>}

    {phase === 'duplicate' && <div className={css.box}>
      <p>A receipt in your history has the same vendor, invoice reference and total.</p>
      {matched}
      <button type="button" className={css.primary} onClick={() => onKeepExisting()}>Keep existing receipt</button>
      <button type="button" onClick={() => onSaveSeparate()}>Save as separate receipt</button>
    </div>}

    {phase === 'freight' && <div className={css.box}>
      <p>Choose its load to attach this freight document.</p>
      <button type="button" className={css.primary} onClick={() => onChooseLoad()}>Choose load</button>
      <button type="button" onClick={() => onChooseFile()}>Choose another receipt</button>
    </div>}
    {phase === 'multiple' && <div className={css.box}>
      <p>This file appears to contain several invoices. Choose a file for one invoice to save its total.</p>
      <button type="button" className={css.primary} onClick={() => onChooseFile()}>Choose receipt</button>
    </div>}
    {phase === 'foreign' && <div className={css.box}>
      <p>This receipt shows a foreign or mixed currency. Choose an original showing the final amount in USD.</p>
      <button type="button" className={css.primary} onClick={() => onChooseFile()}>Choose USD receipt</button>
    </div>}

    {scan.error && phase !== 'retry' && <p role="alert" className={css.notice}>{scan.error}</p>}
    {phase !== 'saving' && <button type="button" className={css.back} onClick={() => onCancel()}>Cancel</button>}
  </section>;
}
