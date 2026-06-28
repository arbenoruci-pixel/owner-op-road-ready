import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * V92.2 Easy-Eyes verification.
 * Pure Node built-ins (no external deps) so it runs in the offline sandbox.
 * Asserts the UI redesign is present AND that no compliance / safety / routing
 * invariant was disturbed by the visual layer.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0;
const ok = (label, cond) => { assert.ok(cond, `FAILED: ${label}`); passed++; console.log(`  ok  ${label}`); };

console.log('V92.2 Easy-Eyes verification\n');

// --- 1. CSS integrity + layer presence ------------------------------------
const css = read('source/src/styles.css');
const braceOpen = (css.match(/\{/g) || []).length;
const braceClose = (css.match(/\}/g) || []).length;
ok('styles.css braces balanced', braceOpen === braceClose);
ok('styles.css comments balanced', (css.match(/\/\*/g) || []).length === (css.match(/\*\//g) || []).length);
ok('easy-eyes V92.2 layer present', css.includes('V92.2  EASY-EYES'));
ok('soft palette tokens defined', css.includes('--ee-blue:') && css.includes('--ee-red:') && css.includes('--ee-notice:'));
ok('active-day marker neutralised (not red)', /\.log-day-title em\{[^}]*var\(--ee-notice\)/.test(css));
ok('cert-line not-ready style present', css.includes('.cert-line.not-ready button'));
ok('safe-area bottom padding on action rail', /\.graph-action-rail\{[^}]*env\(safe-area-inset-bottom\)/.test(css));
ok('per-issue copy de-emphasised', /\.signguard-issue-actions-v92 \.mini-secondary\{[^}]*background:transparent/.test(css));

// --- 2. Day-log display refinements ---------------------------------------
const dayLog = read('source/src/modules/logbook/DayLogScreen.jsx');
ok('B1 active-day sign label is neutral', dayLog.includes('Sign after day is complete'));
ok('B1 sign button still disabled on blockers', dayLog.includes('disabled={(changeSignature && !hasInk) || blockers.length > 0}'));
ok('B3 cert-line carries not-ready class when blocked', /className=\{`cert-line \$\{validateLogForSigning\(state, state\.activeDay\)\.length \? 'not-ready' : ''\}`\}/.test(dayLog));

// --- 3. Compliance invariants (must NOT have drifted) ---------------------
const signing = read('source/src/modules/logbook/signing.js');
ok('#9  active_day categorised as a notice', /active_day[\s\S]*?return 'notice'/.test(signing) || signing.includes("if (/active_day/i.test(issue.code || '')) return 'notice';"));
ok('#12 duplicate issues are de-duplicated', signing.includes('seen.has(key)') && signing.includes('seen.add(key)'));
ok('#10 completed-day 24h coverage still checked', signing.includes('day_total_not_24h') && signing.includes('day_start_gap') && signing.includes('day_end_gap'));
ok('#19 signBlockMessage still derives from validateLogForSigning', /signBlockMessage[\s\S]*validateLogForSigning\(state, day\)/.test(signing));

const app = read('source/src/app/App.jsx');
ok('#19 signLogDay aborts when block message exists', /const blockMessage = signBlockMessage\(state, day\);[\s\S]*?if \(blockMessage\)[\s\S]*?return;/.test(app));
ok('certify() routes through the gated signLogDay', /function certify\([\s\S]*?signLogDay\(day, \{\}\);/.test(app));

// --- 4. Single-engine data source (#6/#7/#8) ------------------------------
ok('#6/#7/#8 RoadGuard, graph & DOT all use normalized displayEventsForDay',
  signing.includes('displayEventsForDay') &&
  dayLog.includes('displayEventsForDay') &&
  read('source/src/modules/dot/DotMode.jsx').includes('displayEventsForDay'));

// --- 5. No router introduced (#17) ----------------------------------------
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.next')) continue;
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, acc) : (/\.(jsx?|mjs)$/.test(n) && acc.push(p));
  }
  return acc;
}
const files = ['source/src', 'app', 'lib'].flatMap((d) => existsSync(join(ROOT, d)) ? walk(join(ROOT, d)) : []);
const routerHit = files.find((f) => /react-router|next\/router|next\/navigation|createBrowserRouter|<Routes[\s>]|<Route[\s>]/.test(readFileSync(f, 'utf8')));
ok('#17 no client router / route definitions present', !routerHit);

// --- 6. Relative imports resolve (#18) ------------------------------------
const exts = ['', '.js', '.jsx', '.mjs', '.json', '/index.js', '/index.jsx'];
let unresolved = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const re = /(?:from\s*|import\s*|require\(\s*)['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const base = resolve(dirname(f), m[1]);
    if (!exts.some((e) => existsSync(base + e) && statSync(base + e).isFile())) {
      unresolved++; console.log(`      unresolved: ${f} -> ${m[1]}`);
    }
  }
}
ok('#18 all relative imports resolve', unresolved === 0);

console.log(`\nPASS — ${passed} checks green.`);
