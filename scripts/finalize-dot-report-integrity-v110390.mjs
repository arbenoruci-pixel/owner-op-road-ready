import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const VERSION = '110.3.90';
const BUILD = 'v110390-dot-report-integrity';
const read = path => fs.readFileSync(path, 'utf8');

export function patchDotReportIntegrity(input) {
  let source = input;
  function replaceWithin(name, before, after) {
    const pattern = new RegExp('^function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^\\}', 'gm');
    const matches = [...source.matchAll(pattern)];
    assert.equal(matches.length, 1, 'DOT integrity function: ' + name);
    const body = matches[0][0];
    if (body.includes(after)) return;
    assert.equal(body.split(before).length, 2, 'DOT integrity anchor: ' + name);
    source = source.replace(pattern, () => body.replace(before, after));
  }
  // A recorded manual End is authoritative even while currentStatus matches.
  replaceWithin('reportEventsForDay',
    'const live = index === rows.length - 1 && event.status === state.currentStatus',
    'const live = !event.paperLogEndV110315 && index === rows.length - 1 && event.status === state.currentStatus');
  // Reuse the same fingerprint-backed status as the daily sheet and signature.
  replaceWithin('logPackageStats',
    'signed: !!sig.signed,',
    "signed: officerSignatureLabel(state, day) === 'Signed',");
  replaceWithin('reportHtml',
    'const signedCount = days.filter(day => signatureForDay(state, day).signed).length;',
    "const signedCount = days.filter(day => officerSignatureLabel(state, day) === 'Signed').length;");
  return source;
}

export function finalizeDotReportIntegrity() {
  const dotPath = 'source/src/modules/dot/DotMode.jsx';
  fs.writeFileSync(dotPath, patchDotReportIntegrity(read(dotPath)));
  const stamp = new Date().toISOString();
  for (const path of ['release-version.json', 'public/app-version.json']) {
    const value = JSON.parse(read(path));
    Object.assign(value, { version:VERSION, build:BUILD, force:false,
      label:'v110.3.90 DOT report integrity', releasedAt:stamp, updatedAt:stamp,
      sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
      notes:['Honor manually recorded End times in DOT daily reports.',
        'Keep package certification totals consistent with each daily log and its signature.',
        'Preserve saved log records, certification evidence and historical terminal time zones.'] });
    fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  }
  for (const path of ['package.json', 'package-lock.json']) {
    const value = JSON.parse(read(path)); value.version = VERSION;
    if (value.packages?.['']) value.packages[''].version = VERSION;
    fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  }
  for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
    let value = read(path);
    for (const [key, replacement] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
      const pattern = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`, 'g');
      assert.equal([...value.matchAll(pattern)].length, 1, path + ' release marker');
      value = value.replace(pattern, `const ${name}_${key} = '${replacement}';`);
    }
    fs.writeFileSync(path, value);
  }
  for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
    fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
  }
  for (const path of ['scripts/test-duty-graph-continuity.mjs', 'scripts/test-editor-grips-v110355.mjs', 'scripts/verify-log-integrity-v1051.mjs', 'scripts/test-document-continuity-integration-v110375.mjs']) {
    fs.writeFileSync(path, read(path).replaceAll("'110.3.89'", "'" + VERSION + "'").replaceAll("'v110389-manual-rods-report'", "'" + BUILD + "'"));
  }
  const locks = JSON.parse(read('module-locks.v1.json'));
  locks.release = VERSION;
  fs.writeFileSync('module-locks.v1.json', JSON.stringify(locks, null, 2) + '\n');
  console.log('PASS — 110.3.90 DOT reports preserve manual End and authoritative certification counts');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) finalizeDotReportIntegrity();
