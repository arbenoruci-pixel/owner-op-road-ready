import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimePath = path.join(ROOT, 'source/src/modules/scan/scanbotRtuV1076.js');
let runtime = fs.readFileSync(runtimePath, 'utf8');

runtime = runtime.replace(
  '  config.outputSettings.pagesScanLimit = 0;',
  `  // v107.9: one accepted page must leave the camera and enter Review.
  // Multi-page packets continue through Road Ready's Add another page action.
  config.outputSettings.pagesScanLimit = 1;
  if (config.screens?.review) config.screens.review.enabled = true;`,
);

if (!runtime.includes('config.outputSettings.pagesScanLimit = 1;')) throw new Error('v107.9 single-page limit missing');
if (!runtime.includes('config.screens.review.enabled = true')) throw new Error('v107.9 review screen enablement missing');
if (runtime.includes('config.outputSettings.pagesScanLimit = 0;')) throw new Error('v107.9 unlimited camera session remains active');

fs.writeFileSync(runtimePath, runtime);
console.log('v107.9 Scanbot single-page review flow patched');
