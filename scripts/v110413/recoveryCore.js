import {text,list,clone,loadOf,kindOf,documentFacts,validateFacts,day,CATALOG,FIELD_LABELS,sourceHashes} from './evidenceCoreV110413.js';
export const RECOVERY_FORMAT='road-ready-evidence-recovery';
const loadFields=new Set(['loadNo','broker','origin','destination','gross','revenue','pickupDate','deliveryDate','documentWorkflowStage','notes','documentTransferDays','aliases']);
function scalarMatch(a,b){return a==null||a===''?(b==null||b===''):JSON.stringify(a)===JSON.stringify(b);}
function reference(value){return /^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(text(value));}
export function validateRecoveryPlan(packageValue) {
  const p=packageValue;
  if(p?.format!==RECOVERY_FORMAT||p.version!==1||!/^[a-zA-Z0-9._-]{1,100}$/.test(p.id))throw new Error('Choose a Road Ready reviewed recovery file.');
  if(!Array.isArray(p.summary)||p.summary.length>30||p.summary.some(s=>typeof s!=='string'||s.length>1600)||typeof p.coverageNote!=='string'||p.coverageNote.length>2000)throw new Error('Invalid recovery summary.');
  if(!p.transfer||!Array.isArray(p.documentCorrections)||!Array.isArray(p.loadCorrections)||!Array.isArray(p.aliases)||p.documentCorrections.length>5000||p.loadCorrections.length>1000||p.aliases.length>1000)throw new Error('Invalid recovery plan.');
  const files=new Map(list(p.transfer.documents).map(d=>[d.record?.client_document_id||d.record?.clientDocumentId,d]));
  const hashes=new Set(list(p.transfer.documents).map(d=>d.original?.sha256));
  const proofs=items=>{if(!Array.isArray(items)||!items.length||items.length>30)throw new Error('A correction needs its source evidence.');for(const proof of items)if(!hashes.has(proof.sha256)||!Number.isInteger(proof.page)||proof.page<1||typeof proof.note!=='string'||!proof.note||proof.note.length>1600)throw new Error('Invalid correction source.');};
  const seen=new Set();
  for(const c of p.documentCorrections){
    if(!files.has(c.clientId)||seen.has(c.clientId)||files.get(c.clientId).original.sha256!==c.sha256)throw new Error('A corrected document has no unique matching original.');
    seen.add(c.clientId);if(!c.before||!c.after||!CATALOG[c.before.kind]||!CATALOG[c.after.kind])throw new Error('Invalid document correction.');
    if(!c.after.fields||typeof c.after.fields!=='object'||Array.isArray(c.after.fields)||Object.keys(c.after.fields).some(k=>!Object.hasOwn(FIELD_LABELS,k)))throw new Error('Unsupported document correction field.');
    validateFacts(c.after.kind,c.after.fields);proofs(c.proofs);
    if(c.after.reviewed!==undefined&&typeof c.after.reviewed!=='boolean')throw new Error('Invalid source review status.');
    if(c.after.fields.date&&!day(c.after.fields.date))throw new Error('Invalid correction date.');
    if(c.after.components!==undefined&&(!Array.isArray(c.after.components)||c.after.components.length>100))throw new Error('Invalid packet components.');
    for(const component of list(c.after.components)){
      if(!CATALOG[component.kind]||component.reviewed!==true||!list(component.pages).length||component.pages.some(n=>!Number.isInteger(n)||n<1||n>10000))throw new Error('Invalid packet component.');
      if(!component.fields||Object.keys(component.fields).some(k=>!Object.hasOwn(FIELD_LABELS,k)))throw new Error('Unsupported packet field.');
      validateFacts(component.kind,component.fields);
    }
  }
  for(const c of p.loadCorrections){
    if(!reference(c.loadNo)||!c.before||!c.after)throw new Error('Invalid load correction.');proofs(c.proofs);
    for(const [key,value] of Object.entries(c.after)){
      if(!loadFields.has(key)||!Object.hasOwn(c.before,key))throw new Error('A load correction needs an expected value for every changed field.');
      if(['gross','revenue'].includes(key)&&!(Number.isFinite(value)&&value>=0))throw new Error('Invalid agreed amount.');
      if(['pickupDate','deliveryDate'].includes(key)&&value&&!day(value))throw new Error('Invalid load date.');
      if(key==='documentTransferDays'&&(!Array.isArray(value)||value.some(d=>!day(d))))throw new Error('Invalid folder dates.');
      if(key==='aliases'&&(!Array.isArray(value)||value.some(v=>!reference(v))))throw new Error('Invalid load aliases.');
      if(key==='loadNo'&&!reference(value))throw new Error('Invalid broker load number.');
      if(key==='documentWorkflowStage'&&!['booked','picked_up','delivered','tonu','cancelled','invoiced','submitted','paid'].includes(value))throw new Error('Invalid service stage.');
      if(!['gross','revenue','documentTransferDays','aliases'].includes(key)&&typeof value!=='string')throw new Error('Invalid load field.');
    }
    for(const key of Object.keys(c.before))if(!loadFields.has(key))throw new Error('Unsupported expected field.');
  }
  const map=new Map();for(const a of p.aliases){if(!reference(a.from)||!reference(a.to)||a.from===a.to||map.has(a.from))throw new Error('Invalid load aliases.');map.set(a.from,a.to);}
  for(const from of map.keys()){const visited=new Set();let ref=from;while(map.has(ref)){if(visited.has(ref))throw new Error('Load alias cycle.');visited.add(ref);ref=map.get(ref);}}
  return p;
}
export function prepareRecoveryBusiness(current,p,approved=new Set()) {
  const next=clone(current);
  if(list(next.evidenceRecoveryHistory).some(h=>h.id===p.id))return next;
  for(const c of p.loadCorrections){
    const matches=list(next.loads).filter(l=>c.id&&l.id===c.id||loadOf(l)===c.loadNo);
    if(matches.length>1)throw new Error(`Load ${c.loadNo} has conflicting saved records. Review it first.`);
    const row=matches[0];if(!row)continue;
    for(const [key,value] of Object.entries(c.before))if(!scalarMatch(row[key],value)&&!scalarMatch(row[key],c.after[key])&&!approved.has(`load:${c.loadNo}:${key}`))throw new Error(`Load ${c.loadNo}: ${key} changed since this export. Existing data was kept.`);
    Object.assign(row,clone(c.after),{updatedAt:Date.now()});
    if(c.after.loadNo&&c.after.loadNo!==c.loadNo){
      for(const key of ['load_no','canonicalLoadNo'])if(row[key]){if(row[key]!==c.loadNo&&row[key]!==c.after.loadNo)throw new Error('Saved load identities disagree. Review the load first.');row[key]=c.after.loadNo;}
      if(row.canonicalLoadId===`load_${c.loadNo}`)row.canonicalLoadId=`load_${c.after.loadNo}`;
    }
  }
  const aliases=new Map(list(next.evidenceAliases).map(a=>[a.from,a]));
  for(const a of p.aliases){if(aliases.has(a.from)&&aliases.get(a.from).to!==a.to)throw new Error('A saved load alias conflicts with this recovery.');aliases.set(a.from,{...a,source:p.id});}
  for(const from of aliases.keys()){const visited=new Set();let ref=from;while(aliases.has(ref)){if(visited.has(ref))throw new Error('Saved aliases would create a cycle.');visited.add(ref);ref=aliases.get(ref).to;}}
  next.evidenceAliases=[...aliases.values()];
  return next;
}
export function checkDocumentCorrection(doc,c,approved=new Set()) {
  if(sourceHashes(doc).some(hash=>hash!==c.sha256))throw new Error('A saved original differs from the recovery source.');
  const values={loadNo:loadOf(doc),kind:kindOf(doc),date:documentFacts(doc).date||''},after={loadNo:c.after.fields.loadNo||'',kind:c.after.kind,date:c.after.fields.date||''};
  for(const key of Object.keys(values))if(!scalarMatch(values[key],c.before[key])&&!scalarMatch(values[key],after[key])&&!approved.has(`document:${c.clientId}:${key}`))throw new Error(`Document ${key} changed since this export. Existing data was kept.`);
  const review=doc.extracted?.evidenceFactsV1;
  if(review?.source==='driver_review'&&canonical(reviewedDetails(review))!==canonical(reviewedDetails(c.after))&&!approved.has(`document:${c.clientId}:review`))throw new Error('A document has newer reviewed details. Existing data was kept.');
}

// Compare all original device rows before any write. Exported folder projections
// can differ from vault rows; a source-bound, explicit review resolves those
// differences without weakening checksum, identity or concurrent-edit guards.
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const reviewedDetails=review=>({fields:review.fields,components:list(review.components)});
function planToken(p){return canonical({...p,transfer:{...p.transfer,documents:list(p.transfer.documents).map(d=>({...d,original:{...d.original,base64:undefined}}))}});}
export function reviewRecoveryRecords(current,rows,p){
  validateRecoveryPlan(p);
  const conflicts=[],snapshots={loads:[],documents:[],history:list(current.evidenceRecoveryHistory)};
  const already=list(current.evidenceRecoveryHistory).some(h=>h.id===p.id);
  const files=new Map(p.transfer.documents.map(d=>[d.record.client_document_id||d.record.clientDocumentId,d]));
  function difference(key,label,field,expected,saved,recovered){if(!scalarMatch(saved,expected)&&!scalarMatch(saved,recovered))conflicts.push({key,label,field,expected:expected??null,saved:saved??null,recovered:recovered??null});}
  for(const c of p.loadCorrections){
    const matches=list(current.loads).filter(l=>c.id&&l.id===c.id||loadOf(l)===c.loadNo);
    if(matches.length>1)throw new Error(`Load ${c.loadNo} has conflicting saved records. Review it first.`);
    const row=matches[0];snapshots.loads.push([c.loadNo,row||null]);
    if(row&&!already)for(const [field,value]of Object.entries(c.before))difference(`load:${c.loadNo}:${field}`,`Load ${c.loadNo}`,field,value,row[field],c.after[field]);
  }
  for(const c of p.documentCorrections){
    const matches=list(rows).filter(d=>d.client_document_id===c.clientId);
    if(matches.length>1)throw new Error('A recovery document has conflicting saved identities.');
    const existing=matches[0],doc=existing||files.get(c.clientId).record;
    snapshots.documents.push([c.clientId,existing||null]);
    if(sourceHashes(doc).some(hash=>hash!==c.sha256))throw new Error('A saved original differs from the recovery source.');
    if(already)continue;
    const label=text(doc.original_file_name||doc.fileName||doc.title)||'Saved document';
    const values={loadNo:loadOf(doc),kind:kindOf(doc),date:documentFacts(doc).date||''};
    const after={loadNo:c.after.fields.loadNo||'',kind:c.after.kind,date:c.after.fields.date||''};
    for(const field of Object.keys(values))difference(`document:${c.clientId}:${field}`,label,field,c.before[field],values[field],after[field]);
    const review=doc.extracted?.evidenceFactsV1;
    if(review?.source==='driver_review'&&canonical(reviewedDetails(review))!==canonical(reviewedDetails(c.after)))conflicts.push({key:`document:${c.clientId}:review`,label,field:'review',saved:reviewedDetails(review),recovered:reviewedDetails(c.after),expected:null});
  }
  return {id:p.id,planToken:planToken(p),snapshotToken:canonical(snapshots),conflicts,already};
}
export function confirmRecoveryReview(current,rows,p,review,acceptDifferences=false){
  const fresh=reviewRecoveryRecords(current,rows,p);
  if(!review||fresh.id!==review.id||fresh.planToken!==review.planToken||fresh.snapshotToken!==review.snapshotToken)throw new Error('Saved details changed after this preview. Check the updated differences before applying.');
  if(fresh.conflicts.length&&!acceptDifferences)throw new Error('Review the saved and recovered values, then choose Use recovered details.');
  return new Set(acceptDifferences?fresh.conflicts.map(c=>c.key):[]);
}
