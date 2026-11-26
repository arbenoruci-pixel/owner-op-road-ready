'use client';

import {useEffect, useState} from 'react';
import {usePortalClient} from './PortalSession.jsx';
import {loadOriginal} from './portalData.js';
import styles from './operator.module.css';

async function brokerCopy(original, receipt, doc, loadNumber) {
  const {PDFDocument} = await import('pdf-lib');
  const pdf = await PDFDocument.load(await original.arrayBuffer());
  const page = pdf.addPage([612,792]);
  page.drawText('TEST ONLY - Driver acceptance', {x:48,y:726,size:22});
  page.drawText('Load ' + loadNumber + '  |  Rate confirmation rev. ' + doc.revision, {x:48,y:678,size:14});
  page.drawText('The assigned driver agreed to this test load.', {x:48,y:640,size:13});
  // Use the device font so the driver's typed name is preserved across alphabets.
  const canvas = document.createElement('canvas');
  canvas.width=1280; canvas.height=88;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#14303c'; ctx.font='44px sans-serif';
  ctx.fillText(receipt.signer,0,61,1250);
  const name=await pdf.embedPng(canvas.toDataURL('image/png'));
  page.drawImage(name,{x:48,y:566,width:500,height:34});
  page.drawText('Accepted: ' + new Date(receipt.accepted_at).toISOString(), {x:48,y:537,size:12});
  page.drawText('Original SHA-256: ' + doc.sha256,{x:48,y:500,size:8});
  page.drawText('Broker delivery simulation. Training document only.',{x:48,y:455,size:13});
  return new Blob([await pdf.save()], {type:'application/pdf'});
}

export default function RateconDriverTest({loadId, loadNumber, refresh}) {
  const client=usePortalClient();
  const [step,setStep]=useState(null),[signer,setSigner]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [review,setReview]=useState(null),[copy,setCopy]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    async function read() {
      const {data:doc,error:de}=await client.from('rr_lease_documents').select('id,sha256,revision,file_name,is_ready,storage_backend,storage_path,byte_size,chunk_count,mime_type').eq('load_id',loadId).eq('kind','ratecon').eq('is_current',true).maybeSingle();
      if(de) throw de;
      if(!doc) return;
      const {data,error:e}=await client.rpc('rr_ratecon_driver_test',{p_document:doc.id,p_hash:doc.sha256});
      if(e) throw e;
      if(active && data) setStep({doc,receipt:data});
    }
    setStep(null);setReview(null);setCopy('');setConfirmed(false);setError('');
    read().catch(()=>{if(active)setError('Could not load the driver test. Tap Refresh.');});
    return ()=>{active=false;};
  },[client,loadId,refresh]);
  useEffect(()=>()=>{if(review) URL.revokeObjectURL(review.url);},[review]);
  useEffect(()=>()=>{if(copy) URL.revokeObjectURL(copy);},[copy]);
  async function act(kind) {
    setBusy(true);setError('');
    try {
      const {doc,receipt}=step;
      if(kind==='accept'){
        const {data,error:e}=await client.rpc('rr_ratecon_driver_test',{p_document:doc.id,p_hash:doc.sha256,p_signer:signer.trim()});
        if(e||!data?.accepted_at) throw Error('The assignment or rate confirmation changed. Refresh and review it again.');
        setStep({doc,receipt:data});
      } else {
        const blob=review?.blob || await loadOriginal(client,doc);
        if(kind==='review') setReview({blob,url:URL.createObjectURL(blob)});
        else setCopy(URL.createObjectURL(await brokerCopy(blob,receipt,doc,loadNumber)));
      }
    } catch(e){setError(e.message || 'Please try again.');}
    finally{setBusy(false);}
  }
  if(!step) return error ? <p role="alert">{error}</p>:null;
  const accepted=Boolean(step.receipt.accepted_at);
  return <section className={styles.stop}><h4>Driver acceptance · Test</h4>
    {accepted ? <>
      <p>Accepted by <strong>{step.receipt.signer}</strong> · {new Date(step.receipt.accepted_at).toLocaleString()}</p>
      <p>Broker email preview<br/>Subject: Accepted rate confirmation · {loadNumber}</p>
      {copy ? <a href={copy} download={loadNumber+'-signed-test.pdf'}>Download signed test PDF</a> : <button type="button" className={styles.link} disabled={busy} onClick={()=>act('copy')}>Prepare broker copy</button>}
      <p>Test only. No broker email is sent.</p>
    </> : <>
      <p>Review the rate confirmation before accepting this test load.</p>
      {review ? <a href={review.url} target="_blank" rel="noreferrer">Open test rate confirmation (PDF)</a> : <button className={styles.link} disabled={busy} onClick={()=>act('review')}>Review rate confirmation</button>}
      {review && <form className={styles.form} onSubmit={e=>{e.preventDefault();if(confirmed && signer.trim().length>=2)act('accept');}}>
        <label>Your full name<input required maxLength={90} value={signer} onChange={e=>setSigner(e.target.value)}/></label>
        <label><span><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I reviewed this rate confirmation and agree to this test load.</span></label>
        <button className={styles.primary} disabled={busy||!confirmed||signer.trim().length<2}>Agree &amp; sign test confirmation</button>
      </form>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
