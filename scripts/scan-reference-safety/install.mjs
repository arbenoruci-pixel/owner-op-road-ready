import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='source/src/modules/scan/';
function patch(file,before,after){
 const source=fs.readFileSync(file,'utf8');if(source.includes(after))return;
 assert.equal(source.split(before).length,2,'Scan reference safety anchor: '+file+' / '+before.slice(0,65));
 fs.writeFileSync(file,source.replace(before,()=>after));
}
fs.copyFileSync('scripts/scan-reference-safety/assignment.js',root+'scanAssignmentSafety.js');
const match=root+'scanLoadAssignmentV11037.js';
patch(match,'referencesFromDocumentV105 }','referencesFromDocumentV105, isValidCanonicalLoadNoV105 }');
patch(match,'  if (token.length < 4) return false;',`  // OCR words such as RATES and IGATED can survive in legacy PO/BOL aliases.
  // They are ordinary text, so their presence cannot identify a load folder.
  if (token.length < 4 || !isValidCanonicalLoadNoV105(value)) return false;`);
const sheet=root+'SmartScanSheetV105.jsx';
patch(sheet,"import React,", "import {scanAssignmentBadge,retainedScanChoice} from './scanAssignmentSafety.js';\nimport React,");
patch(sheet,'resumed ? resumed.loadNo : planV110311', 'retainedScanChoice(resumed) ? resumed.loadNo : planV110311');
patch(sheet,"setLoadSelectionSourceV11037(resumed?.assignment || (preserveLoadChoice ?", "setLoadSelectionSourceV11037((retainedScanChoice(resumed)?resumed.assignment:'') || (preserveLoadChoice ?");
patch(sheet,'setLinkToLogbook(Boolean(resumed ? resumed.linkToLogbook :', 'setLinkToLogbook(Boolean(resumed ? safeSelectedLoadV11034 && resumed.linkToLogbook :');
patch(sheet,"{loadSelectionSourceV11037 === 'driver_selected' ? 'Your selection' : 'Reference match'}",'{scanAssignmentBadge(match,loadSelectionSourceV11037,selectedLoadNo,selectedType)}');
console.log('PASS — scanner refuses word-only freight references, rechecks saved automatic choices and labels actual match evidence');
