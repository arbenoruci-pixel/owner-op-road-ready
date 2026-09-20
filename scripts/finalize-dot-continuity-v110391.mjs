import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const VERSION = '110.3.91', BUILD = 'v110391-dot-day-continuity';
const read = path => fs.readFileSync(path, 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

export function patchDotContinuity(input) {
  let source = input;
  const pattern = /^function reportEventsForDay\([^\n]*\) \{[\s\S]*?^\}/gm;
  assert.equal([...source.matchAll(pattern)].length, 1, 'One report day projection');
  source = source.replace(pattern, () => `function reportEventsForDay(state, day) {
  return readLogbookReportDay(state, day, new Date(), reportTimeZoneForDay(state, day));
}`);
  const importLine = "import { readLogbookReportDay, logbookReportGaps } from '../logbook/public-api.js';\n";
  if (!source.includes(importLine)) source = importLine + source;
  // A genuine missing interval needs an explicit message; silently painting it
  // OFF or Drawing a connector would make an incomplete record look complete.
  const before = "  const active = day === localDayKey(new Date(), timeZone);";
  const after = before + `
  const gaps = logbookReportGaps(events, active ? nowMin(timeZone) : 1440);
  const coverageNote = gaps.length ? '<p class="report-coverage-note" role="note"><b>Incomplete log:</b> duty status is missing for '
    + gaps.map(gap => htmlEscape(timeLabel(gap.startMin, true)) + '–' + htmlEscape(timeLabel(gap.endMin, true))).join(', ')
    + '. Review these times in Logbook.</p>' : '';`;
  if (!source.includes(after)) {
    assert.equal(source.split(before).length, 2, 'Daily report coverage anchor');
    source = source.replace(before, after);
  }
  const graph = '    <div class="graph-wrap" role="region" aria-label="Scrollable 24-hour duty status graph" tabindex="0">${svgGraphMarkup(events)}</div>';
  if (!source.includes('    ${coverageNote}\n' + graph)) {
    assert.equal(source.split(graph).length, 2, 'Daily report graph anchor');
    source = source.replace(graph, '    ${coverageNote}\n' + graph);
  }
  return source;
}

export function finalizeDotContinuity() {
  const apiPath = 'source/src/modules/logbook/public-api.js';
  const addition = "export { readLogbookReportDay, logbookReportGaps } from './reportDayV110391.js';\n";
  const api = read(apiPath), base = api.endsWith(addition) ? api.slice(0, -addition.length) : api;
  const baseline = '23b084989c53aea618fa51f784b0803d23d5bb19cfa78e3ba23737731bf78e35';
  assert.equal(hash(base), baseline, 'Reviewed additive Logbook API baseline');
  const locks = JSON.parse(read('module-locks.v1.json'));
  assert.ok([baseline, hash(base + addition)].includes(locks.files[apiPath]), 'Reviewed API lock');
  fs.copyFileSync('scripts/v110391/reportDay.js', 'source/src/modules/logbook/reportDayV110391.js');
  fs.writeFileSync(apiPath, base + addition);
  locks.files[apiPath] = hash(base + addition);
  const dotPath = 'source/src/modules/dot/DotMode.jsx';
  fs.writeFileSync(dotPath, patchDotContinuity(read(dotPath)));
  const stamp = new Date().toISOString();
  for (const path of ['release-version.json', 'public/app-version.json']) {
    const value = JSON.parse(read(path));
    Object.assign(value, { version:VERSION, build:BUILD, force:false,
      label:'v110.3.91 DOT day continuity', releasedAt:stamp, updatedAt:stamp,
      sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
      notes:['Restore known OFF, Sleeper and On Duty continuity from midnight in the DOT report.',
        'Retain proven midnight Driving links and explicitly recorded End times.',
        'Identify genuinely unrecorded time without changing saved logs or signatures.'] });
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
      const expression = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`, 'g');
      assert.equal([...value.matchAll(expression)].length, 1, path + ' release marker');
      value = value.replace(expression, `const ${name}_${key} = '${replacement}';`);
    }
    fs.writeFileSync(path, value);
  }
  for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
    fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
  }
  for (const path of ['scripts/test-duty-graph-continuity.mjs', 'scripts/test-editor-grips-v110355.mjs', 'scripts/verify-log-integrity-v1051.mjs', 'scripts/test-document-continuity-integration-v110375.mjs']) {
    fs.writeFileSync(path, read(path).replaceAll("'110.3.90'", "'" + VERSION + "'").replaceAll("'v110390-dot-report-integrity'", "'" + BUILD + "'"));
  }
  locks.release = VERSION;
  fs.writeFileSync('module-locks.v1.json', JSON.stringify(locks, null, 2) + '\n');
  console.log('PASS — 110.3.91 DOT known day continuity; recorded events and genuine gaps preserved');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) finalizeDotContinuity();
