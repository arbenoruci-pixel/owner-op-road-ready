import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['source', 'lib', 'app', 'components', 'scripts'];
const NEEDLES = [
  'Change saved',
  '>Undo<',
  "'Undo'",
  '"Undo"',
  'undoToast',
  'undoState',
  'setUndo',
  'onUndo',
  'snackbar',
  'toast',
];
const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.css']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const allFiles = ROOTS.flatMap(root => walk(root));
const matches = [];
for (const file of allFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const found = NEEDLES.filter(needle => line.includes(needle));
    if (found.length) matches.push({ file, line:index + 1, found, text:line.trim().slice(0, 500) });
  });
}

console.log('UNDO_DIAGNOSTIC_BEGIN');
for (const match of matches) {
  console.log(`${match.file}:${match.line} [${match.found.join(', ')}] ${match.text}`);
}
console.log(`UNDO_DIAGNOSTIC_COUNT=${matches.length}`);
console.log('UNDO_DIAGNOSTIC_END');

const appPath = 'source/src/app/App.jsx';
const appText = fs.readFileSync(appPath, 'utf8');
const appLines = appText.split(/\r?\n/);
console.log('STARTUP_EFFECT_DIAGNOSTIC_BEGIN');
for (let i = 0; i < appLines.length; i += 1) {
  if (!/\b(?:React\.)?useEffect\s*\(\s*\(\)\s*=>\s*\{/.test(appLines[i])) continue;
  const block = [];
  let depth = 0;
  let started = false;
  for (let j = i; j < Math.min(appLines.length, i + 120); j += 1) {
    const line = appLines[j];
    block.push(`${j + 1}: ${line.trim()}`);
    for (const ch of line) {
      if (ch === '{') { depth += 1; started = true; }
      else if (ch === '}') depth -= 1;
    }
    if (started && depth <= 0 && /\}\s*,\s*\[/.test(line)) break;
  }
  const joined = block.join(' ');
  if (/setState\s*\(|normalizeState\s*\(|reconcile|repair|restore|saveAppSnapshot/.test(joined)) {
    console.log(`EFFECT_AT_${i + 1} ${joined.slice(0, 6000)}`);
  }
}
console.log('STARTUP_EFFECT_DIAGNOSTIC_END');

function functionBlockFromText(text, name, nextName = '') {
  const start = text.indexOf(`function ${name}`);
  if (start < 0) return '';
  let end = nextName ? text.indexOf(`\n\nfunction ${nextName}`, start) : -1;
  if (end < 0) {
    let depth = 0;
    let opened = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '{') { depth += 1; opened = true; }
      else if (ch === '}') {
        depth -= 1;
        if (opened && depth === 0) { end = i + 1; break; }
      }
    }
  }
  return text.slice(start, end > start ? end : Math.min(text.length, start + 12000));
}

function functionBlock(name, nextName = '') {
  return functionBlockFromText(appText, name, nextName) || `FUNCTION_MISSING ${name}`;
}

console.log('INSPECTION_FUNCTIONS_BEGIN');
const functions = [
  ['inspectionActivityText','preTripEventForDay'],
  ['preTripEventForDay','reconcilePreTripInspectionForDay'],
  ['reconcilePreTripInspectionForDay','reconcilePreTripInspections'],
  ['reconcilePreTripInspections','isReasonOnlyInspectionChange'],
  ['inspectionFromPreTripEvent','isAutoPreTripInspection'],
  ['isAutoPreTripInspection','normalizeState'],
  ['normalizeState','defaultInitialState'],
  ['mergeDurableInspectionSnapshots','loadInitial'],
  ['loadInitial','App'],
  ['saveInspection','saveManualMilesForDay'],
];
for (const [name,next] of functions) {
  const block = functionBlock(name,next);
  console.log(`FUNCTION_${name}_BEGIN`);
  console.log(block.slice(0, 20000));
  console.log(`FUNCTION_${name}_END`);
}
console.log('INSPECTION_FUNCTIONS_END');

console.log('INSPECTION_OCCURRENCES_BEGIN');
for (let i = 0; i < appLines.length; i += 1) {
  const line = appLines[i];
  if (/inspectionByDay|saveInspectionDaySnapshot|loadInspectionDaySnapshots|inspectionConfirmed|reconcilePreTripInspections/.test(line)) {
    console.log(`${i + 1}: ${line.trim().slice(0, 1000)}`);
  }
}
console.log('INSPECTION_OCCURRENCES_END');

const deletionPatterns = [
  /false auto inspection/i,
  /repairLogIntegrityV1051/,
  /repairRoadReadyFoundationV105/,
  /inspectionByDay/,
  /delete\s+[^;\n]*(?:inspection|\[day\])/i,
  /inspectionConfirmed/,
  /auto_on_duty_pretrip/i,
  /isAutoPreTripInspection/,
];
console.log('INSPECTION_REPAIR_SOURCE_SCAN_BEGIN');
for (const file of allFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, index) => {
    if (deletionPatterns.some(pattern => pattern.test(line))) {
      hits.push({ line:index + 1, text:line.trim().slice(0, 1500) });
    }
  });
  if (!hits.length) continue;
  console.log(`FILE_BEGIN ${file}`);
  for (const hit of hits.slice(0, 250)) console.log(`${hit.line}: ${hit.text}`);
  console.log(`FILE_END ${file}`);
}
console.log('INSPECTION_REPAIR_SOURCE_SCAN_END');

console.log('NAMED_REPAIR_FUNCTIONS_BEGIN');
for (const file of allFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const name of ['repairLogIntegrityV1051','repairRoadReadyFoundationV105','normalizeRoadReadyState','repairRoadReadyStateV107']) {
    const block = functionBlockFromText(text, name);
    if (!block) continue;
    console.log(`FUNCTION_SOURCE ${name} ${file}`);
    console.log(block.slice(0, 30000));
    console.log(`FUNCTION_SOURCE_END ${name} ${file}`);
  }
}
console.log('NAMED_REPAIR_FUNCTIONS_END');
