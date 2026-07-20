import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const runtime = read('source/src/modules/scan/scanbotRtuV1076.js');
const capture = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');

const assertions = [
  [runtime.includes("acknowledgementMode = 'NONE'"), 'acknowledgement loop disabled'],
  [runtime.includes('config.outputSettings.pagesScanLimit = 1;'), 'single-page session enabled'],
  [runtime.includes('config.screens.review.enabled = true;'), 'review enabled'],
  [runtime.includes("title.text = 'Photos'"), 'Photos visible'],
  [runtime.includes('scanbot_page_image_api_missing'), 'missing image API fails explicitly'],
  [runtime.includes('scanbot_page_export_empty'), 'empty export fails explicitly'],
  [capture.includes('data-professional-scanner="scanbot-only-v1078"'), 'legacy scanner not rendered'],
  [capture.includes("source:'scanbot-rtu-v1080-auto-review'"), 'v108.0 completion source active'],
];
for (const [condition, label] of assertions) {
  if (!condition) throw new Error('v108.0 production guard failed: ' + label);
  console.log('PASS ' + label);
}
if (runtime.includes("acknowledgementMode = 'ALWAYS'")) throw new Error('v108.0 production guard failed: old acknowledgement loop remains');
console.log('PASS — v108.0 production scanner guard');
