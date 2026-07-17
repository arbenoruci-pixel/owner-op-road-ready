import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(ROOT, 'source/src/app/App.jsx');
let app = fs.readFileSync(appPath, 'utf8');
const expected = "  return reconcileCertificationStatusesV1032(repairMultiStopDeliveryStateV1034(inspectionNormalized, { source:'normalize_v1034' }));";

if (!app.includes(expected)) {
  const start = app.indexOf('function normalizeState(s) {');
  const end = app.indexOf('\n}\n\nfunction defaultInitialState', start);
  if (start < 0 || end < start) throw new Error('v104.3 prepare missing normalizeState block');
  let block = app.slice(start, end);
  const returnIndex = block.lastIndexOf('\n  return ');
  const expressionStart = returnIndex + '\n  return '.length;
  const semicolon = block.indexOf(';', expressionStart);
  if (returnIndex < 0 || semicolon < expressionStart) throw new Error('v104.3 prepare missing normalizeState return');
  const expression = block.slice(expressionStart, semicolon).trim();
  const hasInspectionVariable = /\b(?:const|let)\s+inspectionNormalized\b/.test(block);
  const replacement = hasInspectionVariable
    ? `\n${expected}`
    : `\n  const inspectionNormalized = ${expression};\n${expected}`;
  block = block.slice(0, returnIndex) + replacement + block.slice(semicolon + 1);
  app = app.slice(0, start) + block + app.slice(end);
  fs.writeFileSync(appPath, app);
}

if (!fs.readFileSync(appPath, 'utf8').includes(expected)) throw new Error('v104.3 prepare failed to normalize state hook');
console.log('v104.3 state normalizer prepared');
