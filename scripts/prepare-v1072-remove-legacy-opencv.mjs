import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/scan/documentQualityV985.js');
let source = fs.readFileSync(target, 'utf8');

source = source.replace(/\n\s*loadDocumentVision,/, '');
const startNeedle = 'async function detectWithOpenCv(source, maxDimension = 1100) {';
const endNeedle = '\nexport async function detectDocumentV985';
const start = source.indexOf(startNeedle);
const end = source.indexOf(endNeedle, start + startNeedle.length);
if (start >= 0 && end > start) source = `${source.slice(0, start)}${source.slice(end + 1)}`;
fs.writeFileSync(target, source);
console.log('v107.2 unused legacy OpenCV detector removed; final reference check follows after perspective replacement');
