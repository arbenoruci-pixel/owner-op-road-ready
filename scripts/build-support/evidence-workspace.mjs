// Historic materializers can restore the pre-workspace owner screen. Install
// the exact v110453 UI wiring before v110477 applies its navigation contract.
// Keep release stamps and account-sync installation in the original chain.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='source/src/modules/owneros/OwnerOperatorOSV102.jsx';
let source=fs.readFileSync(file,'utf8');
if(!source.includes("import EvidenceWorkspace from './EvidenceWorkspaceV110453.jsx';")){
 const installer=fs.readFileSync('scripts/finalize-evidence-workspace-v110453.mjs','utf8');
 const boundary="const VERSION='110.4.53',BUILD='v110453-evidence-workspace';";
 assert.equal(installer.split(boundary).length,2,'Exact workspace UI/release boundary');
 const ui=installer.split(boundary)[0].replace("import fs from 'node:fs';",'');
 // The checked repository installer validates every UI replacement anchor.
 new Function('fs',ui)(fs);
 source=fs.readFileSync(file,'utf8');
}
assert.ok(source.includes("if(tab==='documents')return <EvidenceWorkspace"),'Documents opens the records workspace');
assert.ok(source.includes("window.addEventListener('road-ready-evidence-filed',refreshBusiness);"),'Workspace filing refresh listener');
// Restore the companion scanner contract when a later historical template
// copied the sheet without the evidence-only context. Shipment filing extends
// this same record boundary, and must retain its no-logbook-write safeguard.
const scan='source/src/modules/scan/SmartScanSheetV105.jsx';
function restoreScan(before,after){const s=fs.readFileSync(scan,'utf8');if(s.includes(after))return;assert.equal(s.split(before).length,2,'Evidence scanner anchor');fs.writeFileSync(scan,s.replace(before,()=>after));}
restoreScan("initialPreferredType = 'auto' })","initialPreferredType = 'auto', evidenceContextV110413 = null })");
restoreScan('      const deliveryCount = Number(finalMatchCandidate',
 "      record.evidenceOnlyV110413=Boolean(evidenceContextV110413);\n      if(record.evidenceOnlyV110413){record.linkToLogbook=false;record.linkDay='';record.linkedEventId='';delete record.instructionGuide;delete record.loadGuideV110312;delete record.guideActivationRequestedAtV110312;}\n      const deliveryCount = Number(finalMatchCandidate");
restoreScan('        {analysis.typeEvidenceV110334?.requiresTypeReview',
 '        {evidenceContextV110413?.loadNo?<p role="status">Requested folder: Load {evidenceContextV110413.loadNo}. Confirm the folder below; source references may differ.</p>:null}\n        {analysis.typeEvidenceV110334?.requiresTypeReview');
console.log('PASS — required evidence workspace exists before navigation installation');
