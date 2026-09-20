import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const VERSION = '110.3.89';
const BUILD = 'v110389-manual-rods-report';
const read = path => fs.readFileSync(path, 'utf8');
const functionPattern = name => new RegExp('^function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^\\}', 'gm');

export function patchManualRodsReport(input) {
  let source = input;
  const template = fs.readFileSync(new URL('./v110389/report-functions.jsx', import.meta.url), 'utf8');
  const names = ['reportEventsForDay','drivingMilesForDay','reportEquipmentForDay','svgGraphMarkup','dailyLogStyleText','dayReportHtml','DailyPaper'];
  for (const name of names) {
    const definitions = [...template.matchAll(functionPattern(name))];
    assert.equal(definitions.length, 1, 'Manual RODS template function: ' + name);
    const existing = [...source.matchAll(functionPattern(name))];
    assert.ok(existing.length <= 1, 'Duplicate DOT function: ' + name);
    if (existing.length) source = source.replace(functionPattern(name), () => definitions[0][0]);
    else {
      assert.equal(source.split('function reportHtml(').length, 2, 'Manual RODS helper insertion anchor');
      source = source.replace('function reportHtml(', definitions[0][0] + '\n\nfunction reportHtml(');
    }
  }
  source = source.replace("import LogGraph from '../graph/LogGraph.jsx';\n", '')
    .replace("import { durLabel, timeLabel }", "import { durLabel, nowMin, timeLabel }");
  const additions = [
    "import { readLogbookDayState } from '../logbook/public-api.js';",
    "import { getHomeTerminalTimeZone, timeZoneShortLabel } from '../../core/time/homeTerminalTime.js';",
  ];
  for (const line of additions) if (!source.includes(line)) source = line + '\n' + source;

  // Keep the existing Signed / Not signed presentation and retain all evidence.
  const signatureBody = `function signatureLabel(state, day) {\n  const sig = signatureForDay(state, day);\n  return sig.signed && !sig.needsRecertification ? 'Signed' : 'Not signed';\n}`;
  assert.equal([...source.matchAll(functionPattern('signatureLabel'))].length, 1);
  source = source.replace(functionPattern('signatureLabel'), () => signatureBody);
  assert.equal([...source.matchAll(functionPattern('officerSignatureLabel'))].length, 1);
  source = source.replace(functionPattern('officerSignatureLabel'), () => `function officerSignatureLabel(state, day) {\n  return signatureLabel(state, day);\n}`);
  const trailerStart = "function trailerName(state) {\n";
  if (!source.includes(trailerStart + "  if (state.currentTrailer === 'No trailer')")) {
    assert.equal(source.split(trailerStart).length, 2);
    source = source.replace(trailerStart, trailerStart + "  if (state.currentTrailer === 'No trailer') return 'No trailer';\n");
  }

  const beforeDay = "  const [selectedDay, setSelectedDay] = useState(localDayKey());";
  const afterDay = "  const today = localDayKey(new Date(), getHomeTerminalTimeZone(state));\n  const [selectedDay, setSelectedDay] = useState(today);";
  if (!source.includes(afterDay)) { assert.ok(source.includes(beforeDay), 'Selected day anchor'); source = source.replace(beforeDay, afterDay); }
  source = source.replace("useState('package')", "useState('logs')")
    .replace("const days = useMemo(() => dayRange(localDayKey()), []);", "const days = useMemo(() => dayRange(today), [today]);");
  for (const line of [
    '  const selectedEvents = reportEventsForDay(state, selectedDay);\n',
    '  const selectedInspection = state.inspectionByDay?.[selectedDay] || {};\n',
    '  const selectedTotals = dutyTotals(selectedEvents);\n',
  ]) source = source.replace(line, '');
  const officerBlock = /          \{officerPane === 'logs' && \([\s\S]*?          \)\}/g;
  assert.equal([...source.matchAll(officerBlock)].length, 1, 'Officer daily log anchor');
  source = source.replace(officerBlock, () => `          {officerPane === 'logs' && (\n            <section className="dot-roadside-section logs-open">\n              <DailyPaper state={state} day={selectedDay} />\n            </section>\n          )}`);

  const cssTag = '<style>${dailyLogStyleText()}</style>';
  if (!source.includes(cssTag)) {
    assert.equal(source.split('</style>\n</head>').length, 2, 'Shared HTML style anchor');
    source = source.replace('</style>\n</head>', '</style>\n' + cssTag + '\n</head>');
  }
  const appCss = '      <style>{dailyLogStyleText()}</style>\n';
  const appAnchor = '      <Header title={title} onBack={guardedBack} right="" />';
  if (!source.includes(appCss)) { assert.ok(source.includes(appAnchor), 'In-app style anchor'); source = source.replace(appAnchor, appCss + appAnchor); }
  source = source.replaceAll('@media(max-width:760px)', '@media screen and (max-width:760px)')
    .replaceAll('Manual RODS / ELD-exempt', 'Manual RODS');
  return source;
}

export function finalizeManualRodsReport() {
  const dotPath = 'source/src/modules/dot/DotMode.jsx';
  const source = patchManualRodsReport(read(dotPath));
  assert.ok(source.includes('wallet_keys:[]') && source.includes('missingDatesV11028'), 'Preserve logs-only email sharing and eight-date guard');
  fs.writeFileSync(dotPath, source);
  const stamp = new Date().toISOString();
  for (const path of ['release-version.json','public/app-version.json']) {
    const meta = JSON.parse(read(path));
    Object.assign(meta, { version:VERSION, build:BUILD, force:false, label:'v110.3.89 Manual roadside report', releasedAt:stamp, updatedAt:stamp,
      sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
      notes:['Show the required manual daily log fields in one simple form, with duty totals at the right of the graph.', 'Use recorded miles and each log day’s truck, trailer, carrier and shipping references.', 'Keep saved logs, signature evidence and private officer email sharing intact.'] });
    fs.writeFileSync(path, JSON.stringify(meta, null, 2) + '\n');
  }
  for (const path of ['package.json','package-lock.json']) {
    const value = JSON.parse(read(path)); value.version = VERSION;
    if (value.packages?.['']) value.packages[''].version = VERSION;
    fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  }
  for (const [path, name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
    let source = read(path);
    for (const [key, replacement] of [['VERSION',VERSION],['BUILD',BUILD]]) {
      const pattern = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`, 'g');
      assert.equal([...source.matchAll(pattern)].length, 1, path + ' release marker');
      source = source.replace(pattern, `const ${name}_${key} = '${replacement}';`);
    }
    fs.writeFileSync(path, source);
  }
  for (const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']) {
    fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
  }
  for (const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']) {
    fs.writeFileSync(path, read(path).replaceAll("'110.3.88'", "'" + VERSION + "'").replaceAll("'v110388-ratecon-structure'", "'" + BUILD + "'"));
  }
  const locks = JSON.parse(read('module-locks.v1.json')); locks.release = VERSION;
  fs.writeFileSync('module-locks.v1.json', JSON.stringify(locks, null, 2) + '\n');
  console.log('PASS — 110.3.89 minimal manual roadside report installed; saved records and email protections preserved');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) finalizeManualRodsReport();
