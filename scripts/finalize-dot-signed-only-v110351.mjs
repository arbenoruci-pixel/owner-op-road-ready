import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const VERSION = '110.3.51';
const BUILD = 'v110351-dot-signed-only';
const DOT_PATH = 'source/src/modules/dot/DotMode.jsx';

// Presentation only: never change stored signatures, certification or duty events.
export function applySignedOnlyLabels(input) {
  let source = input;
  for (const [name, unsigned] of [['signatureLabel', 'Not signed'], ['officerSignatureLabel', 'Certification']]) {
    const header = `function ${name}(state, day) {`;
    const before = `${header}\n  const sig = signatureForDay(state, day);\n  if (!sig.signed) return '${unsigned}';\n  try { return \`Signed · \${new Date(sig.signedAt).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}\`; }\n  catch { return 'Signed'; }\n}`;
    const after = `${header}\n  const sig = signatureForDay(state, day);\n  return sig.signed ? 'Signed' : '${unsigned}';\n}`;
    assert.equal(source.split(header).length - 1, 1, `Ambiguous DOT signature helper: ${name}`);
    if (source.includes(after)) continue;
    assert.equal(source.split(before).length - 1, 1, `DOT signature display anchor changed: ${name}`);
    source = source.replace(before, after);
  }
  return source;
}

function finalize() {
  fs.writeFileSync(DOT_PATH, applySignedOnlyLabels(fs.readFileSync(DOT_PATH, 'utf8')));
  const now = new Date().toISOString();
  for (const path of ['release-version.json', 'public/app-version.json']) {
    const value = JSON.parse(fs.readFileSync(path, 'utf8'));
    Object.assign(value, {
      version: VERSION, build: BUILD, force: false,
      label: 'v110.3.51 Signed status without timestamp', releasedAt: now, updatedAt: now,
      sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
      notes: ['Show Signed without the signing date or time in DOT signature labels.', 'Preserve stored signatures, unsigned labels, certification checks and all duty-status times.'],
    });
    fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  }
  for (const path of ['package.json', 'package-lock.json']) {
    const value = JSON.parse(fs.readFileSync(path, 'utf8'));
    value.version = VERSION;
    if (value.packages?.['']) value.packages[''].version = VERSION;
    fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  }
  for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
    let source = fs.readFileSync(path, 'utf8');
    for (const [key, value] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
      source = source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`), `const ${name}_${key} = '${value}';`);
    }
    fs.writeFileSync(path, source);
  }
  for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
    fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
  }
  const test = 'scripts/test-duty-graph-continuity.mjs';
  const before = "assert.equal(meta.version,'110.3.49');assert.equal(meta.build,'v110349-reading-evidence');";
  const after = `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
  const source = fs.readFileSync(test, 'utf8');
  if (!source.includes(after)) {
    assert.equal(source.split(before).length - 1, 1, 'DOT signature release test anchor changed');
    fs.writeFileSync(test, source.replace(before, after));
  }
  console.log('PASS — v110.3.51 DOT signature labels show Signed without signing date/time');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) finalize();
