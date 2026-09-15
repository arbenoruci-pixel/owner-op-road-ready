import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const VERSION = '110.3.51';
const BUILD = 'v110351-dot-signature-labels';

// Presentation only: retain signedAt, signature images, fingerprints and history.
export function patchDotSignaturePresentation(input) {
  let source = input;
  function replaceLabelFunction(name, body) {
    const pattern = new RegExp('^function ' + name + '\\(state, day\\) \\{[\\s\\S]*?^\\}', 'gm');
    const matches = [...source.matchAll(pattern)];
    assert.equal(matches.length, 1, 'DOT signature function anchor: ' + name);
    const replacement = `function ${name}(state, day) {\n${body}\n}`;
    if (matches[0][0] === replacement) return;
    assert.ok(matches[0][0].includes('sig.signed') && matches[0][0].includes('sig.signedAt'), 'Unexpected DOT signature implementation: ' + name);
    source = source.replace(pattern, () => replacement);
  }
  replaceLabelFunction('signatureLabel', "  return signatureForDay(state, day).signed ? 'Signed' : 'Not signed';");
  replaceLabelFunction('officerSignatureLabel', '  return signatureLabel(state, day);');

  // Keep the visible label identical in device view and report copies.
  source = source.replaceAll('Certification:', 'Signature:');
  const before = '<em>{officerSignatureLabel(state, selectedDay)}</em>';
  const after = '<em style={signatureForDay(state, selectedDay).signed ? undefined : { color: \'var(--muted, #6b7280)\' }}>{officerSignatureLabel(state, selectedDay)}</em>';
  if (!source.includes(after)) {
    assert.equal(source.split(before).length - 1, 1, 'DOT selected-day signature badge anchor');
    source = source.replace(before, after);
  }
  return source;
}

export function finalizeDotSignaturePresentation() {
  const path = 'source/src/modules/dot/DotMode.jsx';
  const source = fs.readFileSync(path, 'utf8');
  fs.writeFileSync(path, patchDotSignaturePresentation(source));

  const now = new Date().toISOString();
  for (const path of ['release-version.json', 'public/app-version.json']) {
    const value = JSON.parse(fs.readFileSync(path, 'utf8'));
    Object.assign(value, {
      version: VERSION, build: BUILD, force: false,
      label: 'v110.3.51 Clear log signature labels',
      releasedAt: now, updatedAt: now,
      sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
      notes: ['Show Signed or Not signed consistently in DOT logs and reports.', 'Hide signature date/time from presentation; preserve the stored signature record.', 'Keep duty-status times and inspection details unchanged.'],
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
      const pattern = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`);
      assert.ok(pattern.test(source), 'DOT release marker: ' + path + ': ' + key);
      source = source.replace(pattern, `const ${name}_${key} = '${value}';`);
    }
    fs.writeFileSync(path, source);
  }
  for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
    fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
  }
  const test = 'scripts/test-duty-graph-continuity.mjs';
  const before = "assert.equal(meta.version,'110.3.49');assert.equal(meta.build,'v110349-reading-evidence');";
  const after = `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
  const contents = fs.readFileSync(test, 'utf8');
  if (!contents.includes(after)) {
    assert.equal(contents.split(before).length - 1, 1, 'DOT release test anchor');
    fs.writeFileSync(test, contents.replace(before, after));
  }
  console.log('PASS — v110.3.51 DOT signature presentation installed; stored records unchanged');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  finalizeDotSignaturePresentation();
}
