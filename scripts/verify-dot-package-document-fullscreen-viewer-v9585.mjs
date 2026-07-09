import fs from 'node:fs';

const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
const css = fs.readFileSync('source/src/styles.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const appVersion = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));
const sw = fs.readFileSync('public/sw.js', 'utf8');
const appUpdate = fs.readFileSync('source/src/core/update/appUpdate.js', 'utf8');

const checks = [
  ['version package', pkg.version === '95.86.0'],
  ['version app-version', appVersion.version === '95.86.0'],
  ['version sw', sw.includes("95.86.0")],
  ['version app update', appUpdate.includes("95.86.0")],
  ['exported html has wallet file link helper', dot.includes('function walletReportFileLinkHtml')],
  ['uses documentDataUrl for package docs', dot.includes('const dataUrl = documentDataUrl(doc);')],
  ['roadside doc data attribute exists', dot.includes('data-roadside-doc="1"')],
  ['row tap class exists', dot.includes('class="roadside-doc-row"')],
  ['fullscreen package script exists', dot.includes('function roadsideDocumentViewerScriptHtml')],
  ['script injected in exported html', dot.includes('${roadsideDocumentViewerScriptHtml()}')],
  ['script builds modal', dot.includes('roadside-doc-modal') && dot.includes('roadside-doc-viewer')],
  ['image preview supported', dot.includes('data:image') && dot.includes('document.createElement(\'img\')')],
  ['pdf preview supported', dot.includes('application\\/pdf') && dot.includes('document.createElement(\'iframe\')')],
  ['back control exists', dot.includes('‹ Back') && dot.includes('Back to DOT package')],
  ['package css exists', dot.includes('.roadside-doc-modal{position:fixed')],
  ['in-app viewer css exists', css.includes('v95.85 DOT saved document full-screen viewer') && css.includes('.dot-doc-viewer-backdrop')],
];

let failed = false;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`FAIL: ${name}`);
    failed = true;
  } else {
    console.log(`PASS: ${name}`);
  }
}
if (failed) process.exit(1);
console.log('v95.85 DOT package document full-screen viewer verifier passed.');
