'use client';
import React,{useEffect,useRef,useState} from 'react';
import {fillFromReceiptText} from './maintenanceReview.js';
import css from './maintenance.module.css';

const labels = {
  vendor:'Shop', date:'Date', invoiceNumber:'Reference', totalCents:'Total',
  subtotalCents:'Subtotal', taxCents:'Tax', paidCents:'Payment', balanceDueCents:'Balance', lines:'Items',
};

export default function ReceiptTextRecovery({draft,setDraft}) {
  const text = useRef(null), active = useRef(false);
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState('');
  useEffect(()=>{
    active.current = true;
    return ()=>{active.current = false;};
  },[]);

  async function fill() {
    const input = text.current?.value.trim();
    if (!input) {setMessage('Paste text from the attached receipt first.');return;}
    if (input.length > 20000) {setMessage('Paste up to 20,000 characters from one receipt.');return;}
    if (pending) return;
    setPending(true);
    try {
      const {parseMaintenanceReceipt} = await import('./maintenanceReceiptFields.js');
      if (!active.current) return;
      const receipt = parseMaintenanceReceipt([{source:'pasted',text:input}]);
      setDraft(prev => fillFromReceiptText(prev,receipt));
      text.current.value = '';
      setMessage('');
    } catch {
      if (active.current) setMessage('Could not read the pasted text. You can still fill the fields below.');
    } finally {
      if (active.current) setPending(false);
    }
  }
  const info = draft.scanDetails;
  const missing = ['vendor','date','invoiceNumber','amount'].filter(key=>!draft[key])
    .map(key=>labels[key === 'amount' ? 'totalCents' : key]);
  const conflicts = draft.conflictFields.map(key=>labels[key]).filter(Boolean);
  return <div className={css.fields}>
    <details className={css.box} onToggle={event=>{if(!event.currentTarget.open && text.current) text.current.value='';}}>
      <summary>Use text from receipt</summary>
      <label>Receipt text<textarea ref={text} rows={3} spellCheck={false} autoComplete="off"
        placeholder="Paste the text you copied from the original receipt."/></label>
      <button type="button" disabled={pending} onClick={fill}>Fill empty fields</button>
    </details>
    {(message || draft.pasteNote) && <p role="status">{message || draft.pasteNote}</p>}
    {info && <details className={css.next}><summary>Scan details</summary>
      <p>{info.source} · {info.pagesRead}/{info.pagesTotal} pages read · {info.observations} readings</p>
      {(info.native || info.rectified) && <p>{[info.native && 'PDF text',info.rectified && 'Straightened image'].filter(Boolean).join(' · ')}</p>}
      {missing.length > 0 && <p><strong>Empty fields</strong> · {missing.join(', ')}</p>}
      {conflicts.length > 0 && <p><strong>Conflicting readings</strong> · {conflicts.join(', ')}</p>}
    </details>}
  </div>;
}
