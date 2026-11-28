'use client';

import React,{lazy,Suspense,useId,useMemo,useRef,useState} from 'react';
import {money} from './Step3Workspace.jsx';
import css from './maintenanceOverview.module.css';

const MaintenanceExport = lazy(()=>import('./MaintenanceExport.jsx'));

export function MaintenanceIcon({name}) {
  const paths = {
    scan:<><path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4"/><path d="M7 12h10"/></>,
    export:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></>,
    receipt:<><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8.5 7.5h7m-7 4h5"/></>,
    file:<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>,
    edit:<><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-4-4L5 15z"/></>,
    check:<path d="m4.5 12 5 5 10-11"/>,
  };
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="19" height="19" fill="none"
    stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">{paths[name]}</svg>;
}

function summarize(records) {
  let total=0n, receiptTotal=0n, receiptCount=0, receiptCosts=0, manualCosts=0;
  for(const record of records) {
    const attached=Boolean(record.file_name);
    if(attached)receiptCount++;
    if(record.amount_cents == null)continue;
    const cents=BigInt(String(record.amount_cents).replace(/\.0+$/,''));
    total+=cents;
    if(attached){receiptTotal+=cents;receiptCosts++;}
    else manualCosts++;
  }
  return {total,receiptTotal,receiptCount,receiptCosts,manualCosts};
}

export default function MaintenanceOverview({records,loadError,client}) {
  const [snapshot,setSnapshot]=useState(null);
  const trigger=useRef(null);
  const panelId=useId();
  const summary=useMemo(()=>records ? summarize(records) : null,[records]);
  const hasAmount=summary && (summary.receiptCosts>0 || summary.manualCosts>0 || records.length===0);
  function closeExport() {
    setSnapshot(null);
    trigger.current?.focus();
  }
  return <div className={css.overview} data-operator-update-pending={snapshot ? 'true' : undefined}>
    <section className={css.card} aria-label="All-time maintenance summary">
      <div className={css.top}>
        <h3>All-time maintenance total</h3>
        <button ref={trigger} type="button" className={css.exportButton} disabled={!records?.length}
          aria-expanded={Boolean(snapshot)} aria-controls={snapshot ? panelId : undefined}
          onClick={()=>snapshot ? closeExport() : setSnapshot(records)}>
          <MaintenanceIcon name="export"/>Export all
        </button>
      </div>
      {summary ? <>
        <div className={css.value}>{hasAmount ? money(summary.total.toString()) : '—'}</div>
        <div className={css.caption}>
          <span className={css.receipts}><MaintenanceIcon name="receipt"/>
            {summary.receiptCount.toLocaleString('en-US')} {summary.receiptCount===1?'receipt':'receipts'}
          </span>
          {!hasAmount ? <span>No amount recorded</span> : summary.manualCosts>0 && summary.receiptCount>0 &&
            <span>{summary.receiptCosts ? money(summary.receiptTotal.toString())+' with receipts' : 'No receipt amounts recorded'}</span>}
          {summary.receiptCosts>0 && summary.receiptCount>summary.receiptCosts &&
            <span>{(summary.receiptCount-summary.receiptCosts).toLocaleString('en-US')} without a total</span>}
        </div>
      </> : <p className={css.pending}>{loadError ? 'Totals unavailable' : 'Loading totals…'}</p>}
    </section>
    {snapshot && <div id={panelId}><Suspense fallback={<p role="status">Opening export…</p>}>
      <MaintenanceExport records={snapshot} client={client} onClose={closeExport}/>
    </Suspense></div>}
  </div>;
}
