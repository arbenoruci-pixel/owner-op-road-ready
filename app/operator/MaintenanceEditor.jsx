'use client';
import React from 'react';
import {maintenanceDraft,newReceiptLine,reviewMaintenance} from './maintenanceReview.js';
import css from './maintenance.module.css';

export default function MaintenanceEditor({draft,setDraft,file,originalUrl,reading,progress,onSkip,busy,duplicate,matched,onSubmit,onBack,onChooseLoad,onChooseReceipt,onRetake,error}) {
  const update = (key, value) => setDraft(prev => ({...prev, [key]:value,
    totalConfirmed:key === 'totalConfirmed' ? value : key === 'amount' ? false : prev.totalConfirmed}));
  const review = reviewMaintenance(draft);
  const canSave = !reading && !busy && !review.message && draft.description.trim() && draft.date;
  const itemized = draft.mode === 'itemized';
  const knownCost = draft.mode !== 'service_only';
  const input = (name, label, props = {}) => <label>{label}<input name={name} {...props}
    value={draft[name]} onChange={e => update(name, e.target.value)}/></label>;
  const setLine = (key, field, value) => setDraft(prev => ({...prev, totalConfirmed:false,
    lines:prev.lines.map(line => line.key === key ? {...line, [field]:value} : line)}));
  const setMode = value => setDraft(prev => ({...prev, mode:value, totalConfirmed:false,
    lines:value === 'itemized' && !prev.lines.length ? [newReceiptLine()] : prev.lines}));
  if (file && draft.documentKind === 'bill_of_lading') return <div className={css.page}>
    <button type="button" className={css.back} onClick={onBack}>‹ Truck</button>
    <header><h2>Bill of lading detected</h2></header>
    <p>If this is a signed delivery document, choose its load to review it for POD upload.</p>
    {originalUrl && <div className={css.original}>
      <a href={originalUrl} target="_blank" rel="noreferrer">View scan</a>
      <a href={originalUrl} download={file.name}>Save a copy</a>
    </div>}
    <button type="button" className={css.primary} onClick={()=>onChooseLoad(file)}>Choose load</button>
    <button type="button" onClick={onChooseReceipt}>Choose another receipt</button>
    <button type="button" onClick={()=>setDraft(maintenanceDraft(null,true))}>This is a service receipt · enter manually</button>
    {error && <p role="alert">{error}</p>}
  </div>;
  return <div className={css.page}>
    <button type="button" className={css.back} disabled={busy} onClick={onBack}>‹ Truck</button>
    <header><h2>{file ? 'Review receipt' : 'Manual service'}</h2></header>
    {file && <details className={css.record}><summary><span><strong>Original receipt</strong><small>{file.name}</small></span><span className={css.chevron} aria-hidden="true">⌄</span></summary>
      {originalUrl && <div className={css.recordBody}>{file.type.startsWith('image/')
        ? <img className={css.preview} src={originalUrl} alt="Original service receipt"/>
        : <object className={css.pdfPreview} type="application/pdf" data={originalUrl} aria-label="Original receipt PDF"/>}
        <a href={originalUrl} target="_blank" rel="noreferrer">Open original</a></div>}</details>}
    {reading && <div className={css.box}><p role="status">{progress?.label || 'Reading receipt…'}</p>
      {progress && <progress aria-label="Receipt reading progress" max="1" value={progress.fraction}/>}
      <button type="button" onClick={onSkip}>Enter details manually</button></div>}
    {draft.issues.length > 0 && <div className={css.notice} role="status">{draft.issues.map((issue,i) => <p key={i}>{issue}</p>)}</div>}
    {file && !reading && !draft.amount && (draft.issues.length > 0 || error) && <div className={css.actions}>
      {onRetake && <button type="button" disabled={busy} onClick={onRetake}>Retake receipt</button>}
      <button type="button" disabled={busy} onClick={onChooseReceipt}>Choose another file</button>
    </div>}
    <form onSubmit={e => {e.preventDefault(); if (canSave) onSubmit(e.currentTarget,review.details);}}>
      <fieldset disabled={busy || reading} className={css.fields}>
        <div className={css.box}><h3>Service details</h3><div className={css.grid}>
          {input('vendor','Shop / vendor',{maxLength:160})}{input('date','Service date',{type:'date',required:true})}
          {file && knownCost && input('amount','Invoice total ($)',{inputMode:'decimal',required:true})}
          {file && knownCost && !draft.amount && draft.suggestedAmount && <div className={css.wide}>
            <p>The total is faint. Compare this reading with the original.</p>
            <button type="button" onClick={()=>update('amount',draft.suggestedAmount)}>Use ${draft.suggestedAmount} from scan</button>
          </div>}
          {input('invoiceNumber','Invoice / order reference',{maxLength:100})}
          <label>Equipment<select name="assetType" value={draft.assetType} onChange={e=>update('assetType',e.target.value)}><option value="unknown">Type unspecified</option><option value="truck">Truck</option><option value="trailer">Trailer</option></select></label>
          {input('unit','Unit number',{maxLength:80})}
          <label>Record type<select name="category" value={draft.category} onChange={e=>update('category',e.target.value)}>
            <option value="PM">Preventive maintenance</option><option value="service">Service / repair</option>
            <option value="warranty">Warranty</option><option value="defect">Defect / safety concern</option></select></label>
          {input('odometer','Odometer miles',{inputMode:'numeric',pattern:'[0-9]{1,8}',maxLength:8})}
          <label className={css.wide}>Service description<textarea required name="description" maxLength={600} rows={2} value={draft.description} onChange={e=>update('description',e.target.value)}/></label>
        </div><details className={css.next}><summary>Next service reminder</summary><div className={css.grid}>
          {input('nextOdometer','Next PM at miles',{inputMode:'numeric',maxLength:8,pattern:'[0-9]{1,8}'})}
          {input('nextDate','Next service date',{type:'date'})}</div></details></div>
        <div className={css.box}><h3>Invoice</h3><label>Cost details<select name="mode" value={draft.mode} onChange={e=>setMode(e.target.value)}>
          <option value="itemized">Itemized invoice</option><option value="total_only">Invoice total only</option>
          <option value="service_only">Service only · no cost recorded</option></select></label>
          {itemized && <div className={css.lines}><h4>Parts, labor and other charges</h4>
            {draft.lines.map((line,index)=><div key={line.key} className={css.line}>
              <div className={css.lineHead}><strong>Line {index+1}</strong><button type="button" onClick={()=>setDraft(prev=>({...prev,totalConfirmed:false,lines:prev.lines.filter(x=>x.key!==line.key)}))} aria-label={'Remove line '+(index+1)}>Remove</button></div>
              <label>Description<input aria-label={'Line '+(index+1)+' description'} maxLength={180} value={line.description} onChange={e=>setLine(line.key,'description',e.target.value)}/></label>
              <div className={css.lineNums}>{[['quantity','Qty'],['unitPrice','Unit price ($)'],['amount','Line total ($)']].map(([field,label])=>
                <label key={field}>{label}<input aria-label={'Line '+(index+1)+' '+label} inputMode="decimal" value={line[field]} onChange={e=>setLine(line.key,field,e.target.value)}/></label>)}</div>
            </div>)}
            <button type="button" onClick={()=>setDraft(prev=>({...prev,lines:[...prev.lines,newReceiptLine()]}))}>Add line</button>
            <div className={css.grid}>{input('subtotal','Printed subtotal ($)',{inputMode:'decimal'})}
              {input('tax','Printed tax ($)',{inputMode:'decimal'})}</div></div>}
          {knownCost && <div className={css.fields}>{!file && input('amount','Invoice total ($)',{inputMode:'decimal',required:true})}
            {(!itemized || draft.requiresSourceCheck) && <label className={css.checkbox}><input type="checkbox" checked={draft.totalConfirmed} onChange={e=>update('totalConfirmed',e.target.checked)}/>{itemized ? 'I checked the items and total against the original.' : 'I checked this invoice total.'}</label>}
            <label>Payment source<select name="payer" value={draft.payer} onChange={e=>update('payer',e.target.value)}>
              <option value="unknown">Unconfirmed</option><option value="driver">Driver funds</option><option value="carrier">Carrier funds</option></select></label>
            <div className={css.grid}>{input('paid','Amount paid ($)',{inputMode:'decimal'})}{input('balance','Balance due ($)',{inputMode:'decimal'})}</div>
          </div>}</div>
      </fieldset>
      {!reading && knownCost && <p aria-live="polite" className={review.message ? css.notice : css.match}>{review.message || (itemized ? 'Invoice lines and total match.' : 'Invoice total confirmed.')}</p>}
      {error && <p role="alert">{error}</p>}
      {duplicate && <p role="status" className={css.notice}>A similar service was recorded{duplicate.recordDate ? ' on '+duplicate.recordDate : ''}. Check the existing service before recording a separate invoice.</p>}
      {matched}
      <button className={css.primary} type="submit" disabled={!canSave}>{busy ? 'Saving…' : duplicate ? 'Save as separate service' : knownCost ? 'Save service & expense' : 'Save maintenance record'}</button>
    </form>
  </div>;
}
