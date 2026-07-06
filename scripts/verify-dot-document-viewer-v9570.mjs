import fs from 'node:fs';

const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
const css = fs.readFileSync('source/src/styles.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const appUpdate = fs.readFileSync('source/src/core/update/appUpdate.js', 'utf8');
const appVersion = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));

const checks = [
  ['version package', pkg.version === '95.70.0'],
  ['version app update', appUpdate.includes("CURRENT_APP_VERSION = '95.70.0'")],
  ['version app-version', appVersion.version === '95.70.0'],
  ['useEffect import', dot.includes("import React, { useEffect, useMemo, useState } from 'react';")],
  ['viewer component exists', dot.includes('function DotDocumentViewer')],
  ['data url to blob helper exists', dot.includes('function dataUrlToBlob')],
  ['object url used', dot.includes('URL.createObjectURL') && dot.includes('URL.revokeObjectURL')],
  ['open document is a button', dot.includes('<button className="dot-doc-open" type="button"')],
  ['no direct doc data href in WalletDocLink', !dot.includes('href={doc.attachmentDataUrl}')],
  ['share/save fallback exists', dot.includes('Share / Save file') && dot.includes('navigator.share')],
  ['viewer rendered', dot.includes('docViewer ?') && dot.includes('<DotDocumentViewer row={docViewer}')],
  ['viewer css exists', css.includes('v95.70 DOT saved document viewer') && css.includes('.dot-doc-viewer-backdrop')],
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
console.log('v95.70 DOT document viewer verifier passed.');
