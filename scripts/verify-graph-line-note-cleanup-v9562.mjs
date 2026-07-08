import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { normalizeLogEvents } from '../source/src/core/timeline/timelineEngine.js';
import { sanitizeLogText } from '../source/src/shared/utils/logText.js';

const root = path.resolve(process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

const pkg = JSON.parse(read('package.json'));
const version = JSON.parse(read('public/app-version.json'));
const timeline = read('source/src/core/timeline/timelineEngine.js');
const graph = read('source/src/modules/graph/LogGraph.jsx');
const app = read('source/src/app/App.jsx');
const trailer = read('source/src/modules/equipment/TrailerSheet.jsx');

ok(/^95\.(6[1-9]|[7-9]\d)\.0$/.test(pkg.version), 'package version is v95.61.0 or newer');
ok(/^95\.(6[1-9]|[7-9]\d)\.0$/.test(version.version), 'public app-version is v95.61.0 or newer');
ok(timeline.includes('function combineText'), 'timeline combines text when merging same-status events');
ok(timeline.includes('return touches || overlaps;'), 'same-status adjacent/overlap rows are mergeable');
ok(timeline.includes('note: combineText(last.note, ev.note)'), 'merged notes preserve both actions');
ok(timeline.includes('description: combineText(last.description, ev.description)'), 'merged descriptions preserve both actions');

const mergedOn = normalizeLogEvents([
  { id:'dh', status:'ON', startMin:1109, endMin:1115, city:'South Bend', state:'IN', note:'Drop & Hook · dropped ABC / CH1 · hooked DEF / CH2' },
  { id:'pre', status:'ON', startMin:1115, endMin:1120, city:'South Bend', state:'IN', note:'Pre-trip inspection' },
]);
ok(mergedOn.length === 1, 'back-to-back ON DUTY rows merge into one event');
ok(mergedOn[0].status === 'ON', 'merged event remains ON DUTY');
ok(mergedOn[0].startMin === 1109 && mergedOn[0].endMin === 1120, 'merged ON spans both original events');
ok(/Drop & Hook/i.test(mergedOn[0].note) && /Pre-trip inspection/i.test(mergedOn[0].note), 'merged ON note keeps drop/hook and pre-trip text');

const separateStatus = normalizeLogEvents([
  { id:'on', status:'ON', startMin:100, endMin:110, note:'Drop & Hook' },
  { id:'d', status:'D', startMin:110, endMin:130, note:'Driving started' },
]);
ok(separateStatus.length === 2, 'different statuses are not merged');

ok(graph.includes('LINE_HALO_W'), 'graph uses duty-line halo width');
ok(graph.includes('stroke="#ffffff"') || graph.includes("stroke='#ffffff'"), 'graph draws white halo behind duty line');
ok(graph.includes("stroke={major ? '#d5dce6' : '#f1f4f8'}") || graph.includes("stroke={major ? '#aab4c2' : '#edf1f5'}") || graph.includes("stroke={major ? '#cfd8e3' : '#edf2f7'}") || graph.includes('HOUR_GRID_COLOR') && graph.includes('QUARTER_GRID_COLOR'), 'graph grid is lightened');
ok(graph.includes('const LINE_W = 8') || graph.includes('const LINE_W = 9') || graph.includes('const LINE_W = 5.25') || graph.includes('const LINE_W = 5.8'), 'graph duty line is readable');
ok(graph.includes('r={selected ? 11 : 9}') || graph.includes('r={selected ? 10 : 8}') || graph.includes('r={selected ? 7 : 5.5}') || graph.includes('short-event-trace-boost'), 'short events are readable');

ok(app.includes('isRealEquipmentLabel'), 'app filters generic equipment labels');
ok(app.includes('cleanEquipmentLabel'), 'app cleans drop/hook equipment labels');
ok(!app.includes("'New equipment'"), 'app does not write New equipment fallback');
ok(!trailer.includes("'New trailer'"), 'trailer sheet does not write New trailer fallback');
ok(trailer.includes('Hooked trailer number'), 'trailer sheet asks for hooked trailer number');
ok(!/old\s+trailer/i.test(app + trailer), 'app text does not use old trailer wording');
ok(sanitizeLogText('Drop & Hook · dropped New trailer · Pre-trip inspection') === 'Drop & Hook · equipment changed · Pre-trip inspection', 'placeholder equipment wording is sanitized');
ok(!sanitizeLogText('Drop & Hook · dropped No trailer').includes('No trailer'), 'No trailer placeholder removed from log note');
ok(graph.includes('VERTICAL_LINE_W = 5.5') || graph.includes('VERTICAL_LINE_W = LINE_W'), 'graph uses slimmer visible vertical bend width');
ok(read('PATCH_V95_62_GRAPH_LINE_AND_DROP_HOOK_NOTE_CLEANUP.md').includes('placeholder'), 'v95.62 patch notes included');

console.log(`verify-graph-line-note-cleanup-v9562: ${checks} checks passed`);
