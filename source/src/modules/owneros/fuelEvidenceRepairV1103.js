import { listVaultDocumentsV102, vaultBlobV102 } from './documentVaultV102.js';
import { readBusinessStore, BUSINESS_STORE_KEY, BUSINESS_STORE_EVENT } from '../business/businessStore.js';
import { parseFuelStatement, upsertFuelTransactions } from '../document-readers/fuel-receipt/fuelStatementV1103.js';
export const FUEL_REPAIR_KIND='road_ready_fuel_statement_repair_v1';
function validateRepairPlan(plan) {
  if(plan?.kind!==FUEL_REPAIR_KIND || !/^[a-f0-9]{64}$/.test(plan.statementSha256 || '') || !plan.expectedAggregate?.id || !Array.isArray(plan.sourceDocumentIds) || !plan.sourceDocumentIds.length || plan.sourceDocumentIds.some(id=>typeof id!=='string'||!id) || !plan.sourceDocumentIds.includes(plan.expectedAggregate.documentId) || !Array.isArray(plan.transactions) || !plan.transactions.length)throw new Error('Choose a verified Road Ready fuel repair JSON');
}
export function stableEvidenceJson(value) {
  if(Array.isArray(value))return '['+value.map(stableEvidenceJson).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableEvidenceJson(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export function previewFuelEvidenceRepair(store,plan,statement) {
  validateRepairPlan(plan);
  if(!statement?.valid)throw new Error('Invalid verified fuel statement');
  if(Math.round(Number(plan.expectedAggregate.total)*100)!==Math.round(statement.total*100))throw new Error('The statement total differs from the aggregate fuel record');
  if(stableEvidenceJson(statement.transactions)!==stableEvidenceJson(plan.transactions))throw new Error('Repair transactions do not match the original statement');
  const aggregate=(store.fuel||[]).find(row=>row.id===plan.expectedAggregate?.id);
  if(aggregate && stableEvidenceJson(aggregate)!==stableEvidenceJson(plan.expectedAggregate))throw new Error('The fuel record has changed since the audit. Export a fresh audit before repairing.');
  if(!aggregate && !statement.transactions.every(transaction=>(store.fuel||[]).some(row=>row.transactionId===transaction.transactionId)))throw new Error('The original aggregate fuel record is missing');
  const next=upsertFuelTransactions({...store,fuel:(store.fuel||[]).filter(row=>row.id!==plan.expectedAggregate.id)},{id:plan.sourceDocumentIds[0]},{...statement,statementVerified:true});
  return {store:next,removed:aggregate?1:0,transactionCount:statement.transactionCount,total:statement.total,gallons:statement.gallons,periodStart:statement.periodStart,periodEnd:statement.periodEnd};
}
export async function verifyFuelEvidenceRepair(plan) {
  validateRepairPlan(plan);
  const docs=await listVaultDocumentsV102();
  let statement=null;
  for(const doc of docs.filter(d=>plan.sourceDocumentIds.includes(d.local_id || d.id))) {
    const blob=await vaultBlobV102(doc);if(!blob)continue;
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==plan.statementSha256)continue;
    statement=parseFuelStatement(await blob.text());break;
  }
  if(!statement)throw new Error('The matching original fuel statement is not available on this device');
  return {statement,...previewFuelEvidenceRepair(readBusinessStore(),plan,statement)};
}
export async function applyFuelEvidenceRepair(plan) {
  const verified=await verifyFuelEvidenceRepair(plan);
  // Recheck after reading the original so newer business records are preserved.
  const current=readBusinessStore(),result=previewFuelEvidenceRepair(current,plan,verified.statement);
  if(!result.removed)return {...result,alreadyApplied:true};
  if(window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__)throw new Error('Save a device backup and free storage before applying this repair');
  localStorage.setItem('road-ready-fuel-repair-backup-v1',JSON.stringify({createdAt:new Date().toISOString(),statementSha256:plan.statementSha256,fuel:current.fuel}));
  // Web Storage replaces one key atomically. Never invoke quota compaction here,
  // because this repair must preserve every unrelated document and business row.
  localStorage.setItem(BUSINESS_STORE_KEY,JSON.stringify(result.store));
  window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT,{detail:null}));
  window.dispatchEvent(new Event('road-ready-repair-applied'));
  return result;
}
