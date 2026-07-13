import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '97.1.0';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

const graphPath = 'source/src/modules/graph/LogGraph.jsx';
let graph = read(graphPath);

graph = graph
  .replace(/const LINE_W = [^;]+;[^\n]*/, "const LINE_W = 5.35; // v97.1: clean readable horizontals")
  .replace(/const LINE_HALO_W = [^;]+;/, 'const LINE_HALO_W = 8.1;')
  .replace(/const VERTICAL_LINE_W = [^;]+;[^\n]*/, "const VERTICAL_LINE_W = 3.35; // v97.1: slim neutral connectors")
  .replace(/const STATUS_TRACE_COLORS = \{[^}]+\};/, "const STATUS_TRACE_COLORS = { OFF:'#667085', SB:'#758195', D:'#0f8f80', ON:'#2f62d9' };\nconst DRIVE_LINE_W = 6.35;")
  .replace(/const ROW_LINE_W = [^;]+;/, 'const ROW_LINE_W = 1.08;')
  .replace(/const HOUR_GRID_W = [^;]+;[^\n]*/, 'const HOUR_GRID_W = 0.62; // v97.1: stronger hour grid')
  .replace(/const QUARTER_GRID_W = [^;]+;[^\n]*/, 'const QUARTER_GRID_W = 0.29; // v97.1: stronger quarter grid')
  .replace(/const HOUR_GRID_OPACITY = [^;]+;/, 'const HOUR_GRID_OPACITY = 0.78;')
  .replace(/const QUARTER_GRID_OPACITY = [^;]+;/, 'const QUARTER_GRID_OPACITY = 0.58;');

const tracePattern = /\{\/\* v96\.7 Motive-style trace:[\s\S]*?\n\s*\{\/\* v95\.89: exact HOS\/overlap violation trace\./;
const polishedTrace = `{/* v97.1 Motive-style trace: connectors first, horizontals on top for exact square corners. */}
      {transitions(sorted).map((transition, index) => {
        const x = xFromMin(transition.minute);
        const y1 = CENTER(transition.from.status);
        const y2 = CENTER(transition.to.status);
        return (
          <g key={\`connector_\${index}_\${transition.minute}\`} pointerEvents="none">
            <line x1={x} x2={x} y1={y1} y2={y2} stroke="#ffffff" strokeWidth={VERTICAL_LINE_W + 2.4} strokeLinecap="square" />
            <line x1={x} x2={x} y1={y1} y2={y2} stroke={CONNECTOR_COLOR} strokeWidth={VERTICAL_LINE_W} strokeLinecap="square" shapeRendering="geometricPrecision" />
          </g>
        );
      })}
      {sorted.map(event => {
        const span = exactSpan(event);
        const y = CENTER(event.status);
        const traceColor = STATUS_TRACE_COLORS[event.status] || TRACE_COLOR;
        const traceWidth = event.status === 'D' ? DRIVE_LINE_W : LINE_W;
        return (
          <g key={\`\${event.id}_base_trace\`} pointerEvents="none">
            <line x1={span.x1} x2={span.x2} y1={y} y2={y} stroke="#ffffff" strokeWidth={traceWidth + 2.7} strokeLinecap="square" />
            <line x1={span.x1} x2={span.x2} y1={y} y2={y} stroke={traceColor} strokeWidth={traceWidth} strokeLinecap="square" strokeLinejoin="miter" shapeRendering="geometricPrecision" />
          </g>
        );
      })}

      {/* v95.89: exact HOS/overlap violation trace.`;

if (tracePattern.test(graph)) {
  graph = graph.replace(tracePattern, polishedTrace);
} else if (!graph.includes('v97.1 Motive-style trace')) {
  throw new Error('v97.1 graph trace block not found');
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
  build:'v97.1-graph-corner-visibility-polish',
  releasedAt:'2026-07-13T03:25:00.000Z',
  notes:[
    'Aligns vertical connectors under horizontal status lines so every graph corner meets cleanly.',
    'Makes the Driving green line bolder and darker for better visibility.',
    'Strengthens hour, quarter-hour, and horizontal row grid lines without making the graph noisy.',
    'Does not change duty events, times, statuses, HOS, routes, or signing data.'
  ],
  label:'v97.1 Graph Corner + Visibility Polish',
  updatedAt:'2026-07-13T03:25:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

if (!graph.includes('DRIVE_LINE_W = 6.35') || !graph.includes('strokeLinecap="square"') || !graph.includes('HOUR_GRID_W = 0.62')) {
  throw new Error('v97.1 graph verification failed');
}
console.log('v97.1 graph corner and visibility polish materialized');
