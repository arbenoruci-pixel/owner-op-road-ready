import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const pass = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
};

const capture = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
pass(capture.includes("if (typeof Blob !== 'undefined' && !(file instanceof Blob)) return '';"), 'preview URL helper rejects non-Blob values');
pass(capture.includes("if (Number(file.size || 0) <= 0) return '';"), 'preview URL helper rejects empty files');
pass(capture.includes('const cleanedFileV1073 = driverPreviewFileV1072(page);'), 'driver preview selects a File separately');
pass(capture.includes('const cleaned = fileUrl(cleanedFileV1073);'), 'driver preview converts the cleaned File to a blob URL');
pass(!capture.includes('const cleaned = driverPreviewFileV1072(page);'), 'File objects cannot be assigned directly to img src');
pass(capture.includes('previewProbeV1073.onload'), 'Safari preview is decoded before scan confirmation');
pass(capture.includes('previewProbeV1073.onerror'), 'Safari preview decode failures are visible');
pass(capture.includes('disabled={processing || !previewReadyV1073'), 'Use scan remains disabled until preview decode succeeds');
pass(capture.includes("previewReadyV1073 ? 'Use scan' : 'Preparing…'"), 'button communicates preview preparation');
pass(capture.includes('Preparing document preview…'), 'preview has an explicit loading state');
pass(capture.includes('The cleaned scan could not be displayed.'), 'broken preview has actionable guidance');
pass(capture.includes('revoke(cleaned);'), 'cleaned blob URL is revoked only during effect cleanup');

const chain = read('scripts/run-v106-smart-capture.mjs');
pass(chain.includes('patch-v1073-safari-preview-url.mjs'), 'release chain installs Safari preview fix');
pass(chain.includes('finalize-v1073-safari-preview-url.mjs'), 'release chain pins v107.3 metadata');
pass(!chain.includes('diagnose-v1073-preview-lifecycle.mjs'), 'temporary preview diagnostics are excluded');

console.log('PASS — v107.3 Safari Preview Object URL regression suite');
