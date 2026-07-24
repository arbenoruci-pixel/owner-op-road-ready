import fs from 'node:fs';

const file = 'source/src/modules/scan/SmartScanSheetV105.jsx';
let text = fs.readFileSync(file, 'utf8');

const before = `      setTimeout(() => {
        try { dispatchVaultDocumentCommitV105({ record }); } catch {}
        if (activeRateConFieldsV10964) {
          try {
            dispatchSmartDocumentLinkV100({`;

const after = `      setTimeout(() => {
        // Rate Confirmations intentionally refresh the active load board immediately.
        // POD/BOL/supporting documents are already durable in the Vault/business store;
        // do not broadcast a full-app commit while the iPhone save sheet is painting.
        // The Documents screen reads the persisted store when it opens, so no document
        // is lost and the save confirmation remains stable on memory-constrained devices.
        if (activeRateConFieldsV10964) {
          try { dispatchVaultDocumentCommitV105({ record }); } catch {}
          try {
            dispatchSmartDocumentLinkV100({`;

if (!text.includes(after)) {
  if (!text.includes(before)) throw new Error('v109.6.8 save dispatch anchor missing');
  text = text.replace(before, after);
}

// Make the saved screen action resilient: close the scan sheet first, then open
// Documents on the next task so a route/screen change cannot race the save paint.
const oldButton = `<button type="button" className="primary" onClick={() => onOpenBusiness?.('documents')}>Open Documents</button>`;
const newButton = `<button type="button" className="primary" onClick={() => { try { onClose?.(); } catch {} window.setTimeout(() => { try { onOpenBusiness?.('documents'); } catch {} }, 0); }}>Open Documents</button>`;
if (!text.includes(newButton)) {
  if (!text.includes(oldButton)) throw new Error('v109.6.8 saved action anchor missing');
  text = text.replace(oldButton, newButton);
}

fs.writeFileSync(file, text);
console.log('v109.6.8 POD save crash isolation applied');
