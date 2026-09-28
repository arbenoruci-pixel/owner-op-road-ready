'use client';
import {validateTransfer} from './transferCoreV110412.js';
import {importTransfer} from './transferStorageV110412.js';
import {validateRecoveryPlan,prepareRecoveryBusiness,checkDocumentCorrection,reviewRecoveryRecords,confirmRecoveryReview} from './recoveryCoreV110413.js';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {BUSINESS_STORE_KEY} from '../business/businessStore.js';
import {applyFactsToDocument,mirrorFacts} from './evidenceStorageV110413.js';
import {list} from './evidenceCoreV110413.js';
export async function inspectRecovery(payload){validateRecoveryPlan(payload);await validateTransfer(payload.transfer);return payload;}
export async function previewRecovery(payload){
  const db=getOwnerOpDb();if(!db)throw new Error('Device storage is unavailable.');
  let current;try{current=JSON.parse(window.localStorage.getItem(BUSINESS_STORE_KEY)||'{}');}catch{throw new Error('Existing business records could not be read.');}
  if(!current||typeof current!=='object'||Array.isArray(current))throw new Error('Existing business records could not be read.');
  return reviewRecoveryRecords(current,await db.documents_local.toArray(),payload);
}
export async function applyRecovery(payload,{review=null,acceptDifferences=false}={}){
  const p=await inspectRecovery(payload);let already=false,corrected=0;
  let approved=new Set(review&&acceptDifferences?review.conflicts.map(c=>c.key):[]);
  const result=await importTransfer(p.transfer,{
    // Snapshot validation runs inside the shared transaction, before originals or
    // metadata are written. A confirmation only applies to the rows previewed.
    validateExisting:({current,rows})=>{if(review)approved=confirmRecoveryReview(current,rows,p,review,acceptDifferences);},
    prepareBusiness:current=>{already=list(current.evidenceRecoveryHistory).some(h=>h.id===p.id);return prepareRecoveryBusiness(current,p,approved);},
    finalizeDocuments:async({db,rows,next})=>{
      if(already)return;
      for(const c of p.documentCorrections){
        const matches=rows.filter(d=>d.client_document_id===c.clientId);if(matches.length!==1)throw new Error('A recovery document could not be identified uniquely.');
        const doc=matches[0];checkDocumentCorrection(doc,c,approved);
        const revised=applyFactsToDocument({...doc,sha256:doc.sha256||c.sha256},c.after.kind,c.after.fields,'source_recovery',c.after.components||[]);
        revised.extracted.evidenceFactsV1.proofs=c.proofs;
        if(c.after.reviewed===false){revised.extracted.evidenceFactsV1.reviewedAt=null;revised.reviewStatus='needs_review';}
        await db.documents_local.put(revised);mirrorFacts(next,revised);corrected++;
      }
      next.evidenceRecoveryHistory=[...list(next.evidenceRecoveryHistory),{id:p.id,at:new Date().toISOString(),documents:corrected,loads:p.loadCorrections.map(c=>({loadNo:c.loadNo,before:c.before,after:c.after})),aliases:p.aliases,resolvedDifferences:review&&acceptDifferences?review.conflicts:[]}].slice(-30);
    },
  });
  window.dispatchEvent(new Event('road-ready-repair-applied'));
  return {...result,corrected,already};
}
