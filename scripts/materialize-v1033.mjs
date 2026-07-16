import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '103.3.0';
const RELEASED_AT = '2026-07-16T14:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

// A legitimate ON DUTY multi-activity note can contain a slash in labels such
// as "Delivery / Unloading". The legacy stale-note detector treated any
// combined slash note as corrupt and replaced it with plain "ON DUTY".
for (const relative of [
  'source/src/modules/editor/EditEventSheet.jsx',
  'source/src/app/App.jsx',
]) {
  let source = read(relative);
  const before = `  if (/\\s\\/\\s/.test(value) && /(pre[- ]?trip|inspection|on duty|driving|new event)/i.test(value)) return true;`;
  const after = `  if (status !== 'ON' && /\\s\\/\\s/.test(value) && /(pre[- ]?trip|inspection|on duty|driving|new event)/i.test(value)) return true;`;
  if (!source.includes(after)) {
    if (!source.includes(before)) throw new Error(`v103.3 missing combined-note sanitizer in ${relative}`);
    source = source.replace(before, after);
  }
  write(relative, source);
}

// Force clear selected/unselected contrast after all legacy editor styles.
const stylePath = 'source/src/styles.css';
let styles = read(stylePath);
styles = appendOnce(styles, '/* v103.3 ON DUTY multi-activity visibility */', `
/* v103.3 ON DUTY multi-activity visibility */
.editor-on-duty-reasons .multi-reason-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}
.editor-on-duty-reasons .multi-reason-grid button{
  min-height:48px;
  border:1px solid #cbd5e1!important;
  border-radius:14px;
  background:#ffffff!important;
  color:#172033!important;
  font-size:15px;
  font-weight:900;
  line-height:1.15;
  padding:10px 8px;
  opacity:1!important;
  -webkit-text-fill-color:#172033!important;
}
.editor-on-duty-reasons .multi-reason-grid button.picked{
  background:#0b7dec!important;
  border-color:#0b7dec!important;
  color:#ffffff!important;
  -webkit-text-fill-color:#ffffff!important;
  box-shadow:0 5px 14px rgba(11,125,236,.22);
}
.editor-on-duty-reasons .drop-hook-note{
  margin-top:9px;
}
`);
write(stylePath, styles);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v103.3-on-duty-multi-activity-save',
  releasedAt:RELEASED_AT,
  notes:[
    'Preserves legitimate combined ON DUTY activity notes such as Pre-trip inspection plus Delivery / Unloading instead of replacing them with plain ON DUTY.',
    'Keeps the original event start and end times unchanged while saving selected activity labels.',
    'Applies the same protection in both Edit Duty Status and the final App event sanitizer.',
    'Makes selected ON DUTY activity buttons blue with visible white text and keeps unselected labels dark and readable.',
    'Retains inspection prompting/linking when Pre-trip inspection is selected and retains delivery routing when Delivery / Unloading is selected.',
    'Does not alter any existing duty-status time, status, location or certified log automatically.'
  ],
  label:'v103.3 ON DUTY Activity Save Fix',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const editor = read('source/src/modules/editor/EditEventSheet.jsx');
const app = read('source/src/app/App.jsx');
const finalStyles = read(stylePath);
if (!editor.includes(`status !== 'ON' && /\\s\\/\\s/`) || !app.includes(`status !== 'ON' && /\\s\\/\\s/`)) {
  throw new Error('v103.3 ON DUTY sanitizer integration failed');
}
if (!finalStyles.includes('.multi-reason-grid button.picked') || !finalStyles.includes('-webkit-text-fill-color:#ffffff!important')) {
  throw new Error('v103.3 activity button visibility integration failed');
}
console.log('v103.3 ON DUTY multi-activity save materialized');
await import('./verify-on-duty-multi-activity-v1033.mjs');
