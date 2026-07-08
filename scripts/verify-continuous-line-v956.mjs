// v95.6 continuous-duty-line patch verifier (offline, no build needed):
//   node scripts/verify-continuous-line-v956.mjs
//
// The npm registry is blocked in this environment, so `next build` cannot
// run. These checks validate the graph-rendering contract structurally:
// one continuous path, uniform stroke width, no join dots, no cap artifacts,
// no duplicate short-event rendering, selection separate from the real line.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const jsxUrl = new URL('../source/src/modules/graph/LogGraph.jsx', import.meta.url);
const cssUrl = new URL('../source/src/styles.css', import.meta.url);
const src = readFileSync(jsxUrl, 'utf8');
const css = readFileSync(cssUrl, 'utf8');

let checks = 0;
function ok(name, fn) {
  fn();
  checks += 1;
  console.log(`PASS ${name}`);
}

// --- structural sanity: balanced delimiters + balanced JSX tags -----------
function stripLiterals(code) {
  // Remove string literals, template literals and comments so delimiter
  // counting is not confused by quotes/braces inside them.
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

ok('jsx: braces, parens and brackets are balanced', () => {
  const code = stripLiterals(src);
  for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
    const o = (code.match(new RegExp(`\\${open}`, 'g')) || []).length;
    const c = (code.match(new RegExp(`\\${close}`, 'g')) || []).length;
    assert.equal(o, c, `unbalanced ${open}${close}: ${o} vs ${c}`);
  }
});

ok('jsx: element tags are balanced per element name', () => {
  const code = stripLiterals(src);
  const counts = {};
  const tagRe = /<(\/)?([A-Za-z][A-Za-z0-9.]*)((?:"[^"]*"|'[^']*'|\{[^{}]*\}|[^>"'{}])*?)(\/)?>/g;
  let m;
  while ((m = tagRe.exec(code)) !== null) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    counts[name] = (counts[name] || 0) + (closing ? -1 : 1);
    assert.ok(counts[name] >= 0, `closing </${name}> without opener`);
  }
  for (const [name, n] of Object.entries(counts)) {
    assert.equal(n, 0, `unclosed <${name}> (${n} open)`);
  }
});

// --- rule 1/2/6/7: one continuous body, single stroke width ----------------
ok('trace: single continuous <path> with H/V commands is rendered', () => {
  assert.ok(src.includes('continuousPath('), 'continuousPath builder missing');
  assert.ok(src.includes('d={bodyPath}'), 'bodyPath is not rendered as a <path>');
  assert.ok(/H \$\{xFromMin/.test(src) && /` V \$\{CENTER/.test(src), 'path is not built from H/V commands');
});

ok('trace: horizontals and vertical bends share one slim LINE_W', () => {
  assert.ok(src.includes('const LINE_W'), 'LINE_W constant missing');
  assert.ok(src.includes('const TRACE_COLOR'), 'TRACE_COLOR constant missing');
  assert.ok(!src.includes('strokeWidth={selected ? 12.6 : 8.1}'), 'old per-selection width change still present');
  assert.ok(!src.includes('selected ? 5.4 : 3.6'), 'old thin transition stroke still present');
  assert.ok(!/strokeWidth="8\.1"/.test(src) && !/strokeWidth="3\.6"/.test(src), 'legacy duty-line widths remain');
});

ok('trace: butt caps + miter joins on the duty path', () => {
  const pathBlock = src.slice(src.indexOf('d={bodyPath}'), src.indexOf('d={bodyPath}') + 400);
  assert.ok(pathBlock.includes('strokeLinecap="butt"'), 'duty path is missing butt caps');
  assert.ok(pathBlock.includes('strokeLinejoin="miter"'), 'duty path is missing miter joins');
});

// --- rule 3/4/5: no join dots, no cap artifacts, no double rendering -------
ok('transitions: no endpoint circles and no separate visible stroke', () => {
  assert.ok(!src.includes('r="3.2"'), 'transition join dots still rendered');
  const tBlock = src.slice(src.indexOf('Transition tap targets'), src.indexOf('Short 1'));
  assert.ok(tBlock.includes('stroke="transparent"'), 'transition hit line missing');
  assert.ok(!/stroke="#(?:223047|172033)"/.test(tBlock), 'transitions still draw their own visible stroke');
});

ok('overlays: no duplicate visible per-event duty overlays', () => {
  assert.ok(src.includes('stroke="transparent"') && src.includes('_hit'), 'per-event visible overlays must be hit targets only');
  assert.ok(!src.includes('stroke={color(event.status)}'), 'status-colored visible overlays still present');
});

// --- rule 8/9/10/11: selection + handles ------------------------------------
ok('selection: glow layer renders under the trace and never resizes it', () => {
  const glowIdx = src.indexOf('LINE_W + 8');
  const pathIdx = src.indexOf('d={bodyPath}');
  assert.ok(glowIdx !== -1 && pathIdx !== -1 && glowIdx < pathIdx, 'selection glow must render before (under) the duty path');
  assert.ok(!src.includes('strokeWidth="20"'), 'old dark selection underlay still present');
  assert.ok(!src.includes('r="13" fill="#fff"'), 'selection endpoint circles still rendered outside edit mode');
});

ok('handles: drag chrome only inside editable && onEditTime block', () => {
  const idx = src.indexOf('editable && onEditTime');
  assert.ok(idx !== -1, 'edit-handle gate missing');
  assert.ok(src.indexOf('edit-handles-large') > idx, 'edit handles rendered outside edit gate');
});

// --- rule 12: short events visible, no spikes, no masks --------------------
ok('short events: minimum trace segment, no spikes, no masks', () => {
  assert.ok(src.includes('short-event-trace-boost') || src.includes('class' + 'Name="short-event-marker"'), 'short-event visibility rendering missing');
  assert.ok(!src.includes('y1={y-15}') && !src.includes('y1={y-17}'), 'short-event spike lines still rendered');
  assert.ok(!src.includes('_cut_'), 'short-event boundary masks still rendered');
  assert.ok(!src.includes('short_clear'), 'duplicate short-event pass still rendered');
});

// --- rule 13: violations stay on the line -----------------------------------
ok('violations: soft underlay only, no duty-line overlay or vertical guide line', () => {
  const vBlock = src.slice(src.indexOf('violationRanges.map'), src.indexOf('Transition tap targets'));
  assert.ok(vBlock.includes('graph-violation-underlay') || vBlock.includes('graph-violation-badge'), 'violation underlay/badge handling missing');
  assert.ok(!vBlock.includes('strokeDasharray'), 'vertical dashed guide line reintroduced');
  assert.ok(!vBlock.includes('violation-bang'), 'read-only violation exclamation marker reintroduced');
});

// --- rule 14/15: graph line intentionally single-color ----------------------
ok('colors: graph uses one readable paper-log trace color', () => {
  assert.ok(src.includes("const TRACE_COLOR = '#1a73e8'"), 'single blue trace color missing');
  assert.ok(!src.includes('stroke={color(event.status)}'), 'per-status graph colors remain');
});

// --- css hook ----------------------------------------------------------------
ok('css: short-event visual hook present, no new width overrides on the trace', () => {
  assert.ok(css.includes('.log-graph circle.short-event-marker') || css.includes('.short-event-trace-boost'), 'short-event CSS hook missing');
  assert.ok(!/\.log-graph[^{]*\{[^}]*stroke-width/i.test(css), 'CSS stroke-width override on log-graph detected');
});

console.log(`verify-continuous-line-v956: ${checks} checks passed`);
