// Explicit local input/output paths; private customer data is never a repo fixture.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {projectArchiveState,archiveLoadMileage,archiveWeeks} from '../source/src/modules/owneros/archiveEvidenceV1103.js';
import {parseFuelStatement} from '../source/src/modules/document-readers/fuel-receipt/fuelStatementV1103.js';
import {FUEL_REPAIR_KIND,previewFuelEvidenceRepair,stableEvidenceJson} from '../source/src/modules/owneros/fuelEvidenceRepairV1103.js';
import {normalizedHistoricalTimelineV10981} from '../source/src/modules/owneros/historicalLogbookV10981.js';
const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw new Error('Usage: node scripts/audit-real-export-live-archive.mjs EXTRACTED_AUDIT_DIR OUTPUT_DIR');
const read=name=>JSON.parse(fs.readFileSync(path.join(input,'audit',name)));
const state=read('app-state.json'),business=read('business-store.json'),manifest=read('document-manifest.json'),folders=read('load-folders.json');
const originalState=stableEvidenceJson(state),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const originals=[],groups=new Map(),truncated=[];
for(const doc of manifest) {
  let file=path.join(input,doc.path);
  if(!fs.existsSync(file)){file=path.join(input,doc.path.slice(0,100));truncated.push(doc.path);}
  assert.ok(fs.existsSync(file),'Missing original '+doc.id);
  const bytes=fs.readFileSync(file),sha256=hash(bytes);
  assert.equal(bytes.length,doc.sizeBytes,'Original size mismatch');
  originals.push({...doc,sha256,actualPath:file});
  if(!groups.has(sha256))groups.set(sha256,[]);groups.get(sha256).push(doc.id);
}
const fuelDoc=originals.find(doc=>doc.type==='fuel_receipt'&&/\.csv$/i.test(doc.actualPath));
assert.ok(fuelDoc,'Fuel CSV required for this evidence repair');
const statement=parseFuelStatement(fs.readFileSync(fuelDoc.actualPath,'utf8'));assert.equal(statement.valid,true);
const sourceDocumentIds=[...new Set(originals.filter(doc=>doc.sha256===fuelDoc.sha256).map(doc=>doc.id))];
const aggregate=business.fuel.find(row=>sourceDocumentIds.includes(row.documentId));assert.ok(aggregate,'Original aggregate fuel row required');
sourceDocumentIds.sort((a,b)=>a===aggregate.documentId?-1:b===aggregate.documentId?1:a.localeCompare(b));
const plan={kind:FUEL_REPAIR_KIND,createdAt:new Date().toISOString(),sourceAuditCreatedAt:read('report.json').generatedAt,statementSha256:fuelDoc.sha256,sourceDocumentIds,expectedAggregate:aggregate,transactions:statement.transactions,
  summary:{transactions:statement.transactionCount,gallons:statement.gallons,total:statement.total,periodStart:statement.periodStart,periodEnd:statement.periodEnd},
  notes:['Verify the original file hash and unchanged aggregate before applying.','Replace only the malformed aggregate fuel row with its original transaction rows.','Keep the original statement, unrelated business records and all Logbook events unchanged.']};
const repaired=previewFuelEvidenceRepair(business,plan,statement);
assert.equal(repaired.store.fuel.length,business.fuel.length-1+statement.transactionCount);
assert.equal(Math.round(repaired.store.fuel.reduce((s,row)=>s+row.total,0)*100),Math.round(business.fuel.reduce((s,row)=>s+row.total,0)*100));
const second=previewFuelEvidenceRepair(repaired.store,plan,statement);assert.equal(second.removed,0);assert.equal(second.store.fuel.length,repaired.store.fuel.length);
for(const key of ['loads','documents','expenses','settlements','maintenance'])assert.deepEqual(repaired.store[key],business[key]);
const projected=projectArchiveState(state),mileage=folders.map(folder=>{const evidence=archiveLoadMileage(projected,folder.loadNo);return {loadNo:folder.loadNo,oldFolderMiles:folder.mileage.total,recordedOnLinkedDays:evidence.recordedTotal,assignedToLoad:evidence.total,pendingDays:evidence.pendingDays,days:evidence.linkedDays};});
let drivingDays=0;
for(const [day,events] of Object.entries(state.eventsByDay)) {
  if(day>=state.activeDay)continue;
  const minutes=events.filter(e=>e.status==='D'&&!e.displayOnly&&!e.syntheticCoverage&&!e.voided).reduce((s,e)=>s+e.endMin-e.startMin,0);
  const exported=normalizedHistoricalTimelineV10981(state,day).filter(e=>e.status==='D').reduce((s,e)=>s+e.endMin-e.startMin,0);
  assert.equal(exported,minutes,'Historical Driving changed on '+day);if(minutes)drivingDays++;
}
assert.equal(stableEvidenceJson(state),originalState);
const weeks=archiveWeeks(folders,projected,repaired.store).map(week=>({week:week.start,miles:week.miles,allocated:week.allocatedMiles,unallocated:week.unallocatedMiles,days:week.days.length,fuelTransactions:week.fuel.length,fuelTotal:week.fuelTotal,fuelGallons:week.fuelGallons}));
assert.equal(weeks.reduce((s,w)=>s+w.fuelTransactions,0),14);
assert.equal(Math.round(weeks.reduce((s,w)=>s+w.fuelTotal,0)*100),850959);
const summary={sourceDate:read('report.json').generatedAt,recordedDays:Object.keys(state.eventsByDay).length,events:Object.values(state.eventsByDay).flat().length,originalReferences:originals.length,uniqueOriginalContents:groups.size,truncatedPaths:truncated,mileage,weeks,fuel:plan.summary,historicalDrivingDaysVerified:drivingDays,stateSha256:hash(originalState),result:'Inputs unchanged; repair applied only to an isolated business-store copy'};
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'Road_Ready_Fuel_Repair_2026-09-08.json'),JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(path.join(output,'Road_Ready_Real_Audit_Evidence_2026-09-08.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
