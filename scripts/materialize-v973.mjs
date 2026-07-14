import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '97.6.0';
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

// Remove only the white halo SVG line that belongs to a vertical connector.
// [^>] keeps the match inside one JSX tag so grid lines are never touched.
graph = graph.replace(
  /\s*<line\b(?=[^>]*x1=\{x\})(?=[^>]*x2=\{x\})(?=[^>]*stroke="#ffffff")(?=[^>]*VERTICAL_LINE_W)[^>]*\/>/g,
  ''
);

// Keep a controlled overlap into both horizontal status strokes. Three
// quarters of LINE_W keeps the corner closed without a visible overhang.
graph = graph.replace(
  /<line\b(?=[^>]*x1=\{x\})(?=[^>]*x2=\{x\})(?=[^>]*stroke=\{CONNECTOR_COLOR\})[^>]*\/>/g,
  '<line x1={x} x2={x} y1={Math.min(y1, y2) - LINE_W * 0.75} y2={Math.max(y1, y2) + LINE_W * 0.75} stroke={CONNECTOR_COLOR} strokeWidth={VERTICAL_LINE_W} strokeLinecap="square" shapeRendering="geometricPrecision" />'
);

graph = graph.replace(
  /const CONNECTOR_COLOR = ([^;]+);(?:\s*\/\/[^\n]*)?/,
  'const CONNECTOR_COLOR = $1; // v97.6-balanced-junction-overlap'
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
  build:'v97.6-balanced-graph-junction-overlap',
  releasedAt:'2026-07-14T01:05:00.000Z',
  notes:[
    'Reduces the vertical connector overhang at each duty-status bend.',
    'Keeps enough overlap for the neutral connector to meet the green Driving line and other horizontal traces cleanly.',
    'Keeps trace thickness, status colors, grid, events, HOS logic, routes, signatures, and stored log data unchanged.'
  ],
  label:'v97.6 Balanced Graph Junctions',
  updatedAt:'2026-07-14T01:05:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

if (!graph.includes("D:'#00c98d'") || !graph.includes('v97.6-balanced-junction-overlap') || !graph.includes('LINE_W * 0.75')) {
  throw new Error('v97.6 graph junction verification failed');
}
console.log('v97.6 balanced graph junction overlap materialized');
