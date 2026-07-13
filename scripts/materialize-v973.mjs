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
graph = graph
  .replace(/D:'#[0-9a-fA-F]{6}'/, "D:'#00c98d'")
  .replace(/const HOUR_GRID_W = [0-9.]+;/, 'const HOUR_GRID_W = 0.64;')
  .replace(/const QUARTER_GRID_W = [0-9.]+;/, 'const QUARTER_GRID_W = 0.3;')
  .replace(/const HOUR_GRID_OPACITY = [0-9.]+;/, 'const HOUR_GRID_OPACITY = 0.8;')
  .replace(/const QUARTER_GRID_OPACITY = [0-9.]+;/, 'const QUARTER_GRID_OPACITY = 0.58;');

// Remove any white halo line that belongs to a vertical connector. The halo
// was visually cutting the horizontal status stroke at the exact bend.
graph = graph.replace(
  /\s*<line(?=[\s\S]*?x1=\{x\})(?=[\s\S]*?x2=\{x\})(?=[\s\S]*?stroke="#ffffff")(?=[\s\S]*?VERTICAL_LINE_W[\s\S]*?)[\s\S]*?\/\>/g,
  ''
);

// Extend the real connector into both horizontal strokes. Support both the
// original y1/y2 form and an already-patched form so the materializer is safe
// to run more than once.
const connectorLine = /<line(?=[^>]*x1=\{x\})(?=[^>]*x2=\{x\})(?=[^>]*stroke=\{CONNECTOR_COLOR\})[^>]*\/>/g;
graph = graph.replace(connectorLine, match => {
  if (match.includes('Math.min(y1, y2) - LINE_W / 2')) return match;
  return '<line x1={x} x2={x} y1={Math.min(y1, y2) - LINE_W / 2} y2={Math.max(y1, y2) + LINE_W / 2} stroke={CONNECTOR_COLOR} strokeWidth={VERTICAL_LINE_W} strokeLinecap="square" shapeRendering="geometricPrecision" />';
});

if (!graph.includes('v97.4-solid-junctions')) {
  graph = graph.replace(
    /const CONNECTOR_COLOR = ([^;]+);/,
    'const CONNECTOR_COLOR = $1; // v97.4-solid-junctions'
  );
}
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
    'Removes the white connector halo that caused small gaps at graph corners.',
    'Extends vertical connectors into the horizontal status traces so every bend looks solid.',
    'Keeps the bright emerald Driving trace and stronger grid.',
    'Does not modify duty events, times, HOS, routes, signatures, or stored log data.'
  ],
  label:'v97.4 Solid Graph Junctions',
  updatedAt:'2026-07-13T06:45:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

if (!graph.includes("D:'#00c98d'") || !graph.includes('v97.4-solid-junctions')) {
  throw new Error('v97.4 graph junction verification failed');
}
console.log('v97.4 solid graph junctions materialized');
