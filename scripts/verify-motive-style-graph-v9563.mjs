import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; console.log(`PASS ${msg}`); };

const pkg = JSON.parse(read('package.json'));
const appVersion = JSON.parse(read('public/app-version.json'));
const graph = read('source/src/modules/graph/LogGraph.jsx');
const css = read('source/src/styles.css');

ok(/^95\.(6[3-9]|[7-9]\d)\./.test(pkg.version), 'package version is v95.63 or newer');
ok(/^95\.(6[3-9]|[7-9]\d)\./.test(appVersion.version), 'app version is v95.63 or newer');
ok(graph.includes("const TRACE_COLOR = '#1a73e8'"), 'graph uses one Motive-style blue trace color');
ok(graph.includes('const LINE_W = 5.25'), 'graph line width is slim, not blocky');
ok(graph.includes('const BASE_H = 300'), 'graph height is compact');
ok(graph.includes('const ROW_H = 66'), 'row height is tighter');
ok(graph.includes('d={bodyPath}'), 'one continuous bodyPath renders the duty line');
ok(graph.includes('stroke={TRACE_COLOR}'), 'visible duty path uses trace color');
ok(!graph.includes('stroke={color(event.status)}'), 'graph no longer uses per-status colored duty overlays');
ok(!graph.includes('strokeWidth={VERTICAL_LINE_W}') || graph.includes('VERTICAL_LINE_W = LINE_W'), 'visible vertical bends do not have separate thick width');
ok(graph.includes('stroke={major ? \'#cfd8e3\' : \'#edf2f7\'}'), 'grid is lightened');
ok(graph.includes('strokeWidth={major ? 0.72 : 0.34}'), 'grid lines are fine and narrow');
ok(graph.includes('r={selected ? 7 : 5.5}'), 'short event markers are small readable dots');
ok(css.includes('v95.63 Motive-style graph readability'), 'v95.63 CSS readability block exists');
ok(css.includes('.log-graph .axis-label{font-size:13px!important'), 'axis labels are reduced');
ok(css.includes('.log-graph .row-label{font-size:16px!important'), 'row labels are reduced');
ok(css.includes('.log-graph .total-label{font-size:15px!important'), 'totals are reduced');
ok(read('PATCH_V95_63_MOTIVE_STYLE_GRAPH_READABILITY.md').includes('Motive-Style Graph'), 'v95.63 patch notes included');

console.log(`verify-motive-style-graph-v9563: ${checks} checks passed`);
