import fs from 'node:fs';

const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
const changedOnlyPresentation = dot.includes('function walletReportFileLinkHtml')
  && dot.includes('function roadsideDocumentViewerScriptHtml')
  && dot.includes('function DotDocumentViewer');
const forbidden = [
  'startMin =',
  'endMin =',
  '.startMin =',
  '.endMin =',
  'status = \'D\'',
  'status = "D"',
  'autoDriving',
  'gpsAutoDriving',
];
const checks = [
  ['presentation helpers present', changedOnlyPresentation],
  ['no obvious event start/end assignments', !forbidden.some(token => dot.includes(token))],
  ['report events still read-only', dot.includes('reportEventsForDay(state, day)')],
  ['viewer source of truth still document data url', dot.includes('function documentDataUrl')],
];
let failed = false;
for (const [name, ok] of checks) {
  if (!ok) { console.error(`FAIL: ${name}`); failed = true; }
  else console.log(`PASS: ${name}`);
}
if (failed) process.exit(1);
console.log('v95.85 DOT document viewer no log data change verifier passed.');
