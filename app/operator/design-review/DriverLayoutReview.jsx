'use client';

import {useState} from 'react';
import Step3Workspace from '../Step3Workspace.jsx';
import {PortalSession} from '../PortalSession.jsx';
import styles from '../operator.module.css';
import sample from './sample.json';

// Staging-only read adapter. Every row and PDF is a bundled fictional example.
const denied = {data:null, error:{message:'This preview uses read-only sample records.'}};
function sampleTable(name) {
  let rows=[...(sample.tables[name] || [])];
  const query={
    select(){return query;},
    eq(field,value){rows=rows.filter(row=>row[field]===value);return query;},
    in(field,values){rows=rows.filter(row=>values.includes(row[field]));return query;},
    not(field,operator,value){
      if(operator==='in'){
        const values=value.slice(1,-1).split(',');
        rows=rows.filter(row=>!values.includes(row[field]));
      }
      return query;
    },
    // Fixture arrays are already in the display order requested by the portal.
    order(){return query;},
    limit(count){rows=rows.slice(0,count);return query;},
    range(start,end){return Promise.resolve({data:rows.slice(start,end+1)});},
    then(resolve,reject){return Promise.resolve({data:rows}).then(resolve,reject);},
    single(){return Promise.resolve(rows.length===1?{data:rows[0]}:denied);},
    maybeSingle(){return Promise.resolve({data:rows[0] || null});},
  };
  return query;
}
const previewClient={
  from:sampleTable,
  auth:{getSession:async()=>denied,getUser:async()=>denied},
  async rpc(name,args={}){
    if(name==='rr_lease_step3_pod_status')return {data:[]};
    if(name==='rr_ratecon_driver_test' && !args.p_signer)
      return {data:{accepted_at:'2026-11-26T19:00:00Z',signer:'Test Driver'}};
    const reads={
      rr_lease_download_chunk:['rr_lease_documents',args.p_document_id],
      rr_lease_wallet_download_chunk:['rr_lease_wallet_documents',args.p_document_id],
      rr_lease_step3_maintenance_original:['rr_driver_tool_records',args.p_record_id],
    };
    if(!reads[name])return denied;
    const [table,id]=reads[name];
    const row=sample.tables[table].find(record=>record.id===id);
    return row?{data:sample.originals[row.file_name]}:denied;
  },
};

export default function DriverLayoutReview() {
  const [open,setOpen]=useState(true);
  return <main className={styles.page}><PortalSession.Provider value={previewClient}>
    {open ? <Step3Workspace operator={sample.operator} operators={[sample.operator]}
      session={{user:{id:sample.operator.driver_user_id}}} onSignOut={()=>setOpen(false)}/> :
      <button type="button" onClick={()=>setOpen(true)}>Reopen driver preview</button>}
  </PortalSession.Provider></main>;
}
