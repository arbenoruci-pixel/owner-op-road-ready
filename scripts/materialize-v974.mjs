import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '97.4.0';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}

const graphPath = 'source/src/modules/graph/LogGraph.jsx';
let graph = read(graphPath);

// The white halo around vertical connectors was painting over the horizontal
// status trace at each bend, creating a small visual gap. Remove only that
// connector halo and slightly extend the real connector into both horizontal
// strokes so each 90-degree corner renders as one solid junction.
graph = graph.replace(
  /\s*<line x1=\{x\} x2=\{x\} y1=\{y1\} y2=\{y2\} stroke="#ffffff" strokeWidth=\{VERTICAL_LINE_W \+ 3\.2\} strokeLinecap="butt" \/>/g,
  ''
);
graph = graph.replace(
  /<line x1=\{x\} x2=\{x\} y1=\{y1\} y2=\{y2\} stroke=\{CONNECTOR_COLOR\} strokeWidth=\{VERTICAL_LINE_W\} strokeLinecap="butt" shapeRendering="geometricPrecision" \/>/g,
  '<line x1={x} x2={x} y1={Math.min(y1, y2) - LINE_W / 2} y2={Math.max(y1, y2) + LINE_W / 2} stroke={CONNECTOR_COLOR} strokeWidth={VERTICAL_LINE_W} strokeLinecap="square" shapeRendering="geometricPrecision" />'
);

write(graphPath, graph);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v97.4-solid-graph-junctions',
  releasedAt:'2026-07-13T06:45:00.000Z',
  notes:[
    'Removes the connector halo that caused small white gaps at graph corners.',
    'Extends vertical connectors slightly into the horizontal status lines so every bend looks solid.',
    'Keeps the brighter Driving trace and stronger grid from v97.3.',
    'Does not change duty events, event times, HOS, routes, signing, or stored log data.'
  ],
  label:'v97.4 Solid Graph Junctions',
  updatedAt:'2026-07-13T06:45:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

if (!graph.includes('Math.min(y1, y2) - LINE_W / 2') || graph.includes('VERTICAL_LINE_W + 3.2')) {
  throw new Error('v97.4 solid junction verification failed');
}
console.log('v97.4 solid graph junctions materialized');
