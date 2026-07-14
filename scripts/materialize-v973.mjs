import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.0.0';
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

// Reduce the overlap one more equal step. Around Driving, nudge the connector
// outward at each end so the vertical stroke aligns with the green segment.
graph = graph.replace(
  /<line\b(?=[^>]*x1=\{x\})(?=[^>]*x2=\{x\})(?=[^>]*stroke=\{CONNECTOR_COLOR\})[^>]*\/>/g,
  '<line x1={transition.to.status === \'D\' ? x - LINE_W * 0.06 : transition.from.status === \'D\' ? x + LINE_W * 0.06 : x} x2={transition.to.status === \'D\' ? x - LINE_W * 0.06 : transition.from.status === \'D\' ? x + LINE_W * 0.06 : x} y1={Math.min(y1, y2) - LINE_W * 0.47} y2={Math.max(y1, y2) + LINE_W * 0.47} stroke={CONNECTOR_COLOR} strokeWidth={VERTICAL_LINE_W} strokeLinecap="square" shapeRendering="geometricPrecision" />'
);

graph = graph.replace(
  /const CONNECTOR_COLOR = ([^;]+);(?:\s*\/\/[^\n]*)?/,
  'const CONNECTOR_COLOR = $1; // v98.0-aligned-junction-overlap'
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
  build:'v98.0-aligned-graph-junction-overlap',
  releasedAt:'2026-07-14T01:15:00.000Z',
  notes:[
    'Reduces the vertical connector overhang by one more small step.',
    'Nudges each connector outward at the start and end of the green Driving trace for cleaner alignment.',
    'Keeps trace thickness, status colors, grid, events, HOS logic, routes, signatures, and stored log data unchanged.'
  ],
  label:'v98.0 Aligned Graph Junctions',
  updatedAt:'2026-07-14T01:15:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

if (!graph.includes("D:'#00c98d'") || !graph.includes('v98.0-aligned-junction-overlap') || !graph.includes('LINE_W * 0.47') || !graph.includes("transition.to.status === 'D'")) {
  throw new Error('v98.0 graph junction verification failed');
}
console.log('v98.0 aligned graph junction overlap materialized');
