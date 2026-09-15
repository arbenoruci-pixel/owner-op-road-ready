import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION = '110.3.55', BUILD = 'v110355-compact-time-grips';
const panel = 'source/src/modules/editor/components/CompactGraphPanelV111.jsx';
const read = path => fs.readFileSync(path, 'utf8');
const before = read(panel);
assert.ok(before.includes('EDITOR_GRAPH_CLEAN_V110354') || before.includes('EDITOR_BOUNDARY_GRIPS_V110355'), 'Run the reviewed 110.3.54 finalizer before compact boundary grips');
for (const [from, to] of [
  ['CompactGraphPanel.jsx', panel],
  ['gripLayout.js', 'source/src/modules/editor/components/editorGripLayoutV110355.js'],
  ['editor-grips.css', 'source/src/modules/editor/editor-grips-v110355.css'],
]) fs.copyFileSync('scripts/v110355/' + from, to);
const layout = 'app/layout.jsx';
const css = "import '../source/src/modules/editor/editor-grips-v110355.css';";
let source = read(layout);
if (!source.includes(css)) {
  const anchor = "import '../source/src/modules/editor/modern-editor-v11027.css';";
  assert.equal(source.split(anchor).length - 1, 1, 'Editor CSS import anchor');
  source = source.replace(anchor, anchor + '\n' + css);
  fs.writeFileSync(layout, source);
}
// An Insert gesture is anchored to its pointer-down interval. Reversing after
// crossing the companion edge must not grow that interval cumulatively.
const insertPath = 'source/src/modules/editor/InsertEditEventSheet.jsx';
let insert = read(insertPath);
function patchInsert(from, to) {
  if (insert.includes(to)) return;
  assert.equal(insert.split(from).length - 1, 1, 'Insert grip draft anchor');
  insert = insert.replace(from, to);
}
patchInsert('  function onEditTime(edge, minute) {', '  function onEditTime(edge, minute, gestureRange) {');
patchInsert(
  '      const range = insertBoundaryV110314(current, edge, minute, insertLimitV110314, true);',
  `      // INSERT_GESTURE_ORIGIN_V110355: retain current details, use original gesture times.
      const origin = gestureRange?.id === current.id && Number.isFinite(gestureRange.startMin) && Number.isFinite(gestureRange.endMin)
        ? gestureRange : current;
      const range = insertBoundaryV110314(origin, edge, minute, insertLimitV110314, true);`
);
patchInsert("        freeInsertBoundaries={mode === 'insert'}", "        freeInsertBoundaries={mode === 'insert'}\n        maxMinute={mode === 'insert' ? insertLimitV110314 : 1440}");
fs.writeFileSync(insertPath, insert);
// Presentation/draft interaction and release markers only; no persisted state or stable-module locks.
for (const path of ['release-version.json', 'public/app-version.json']) {
  const value = JSON.parse(read(path));
  Object.assign(value, { version: VERSION, build: BUILD, force: false,
    label: 'v110.3.55 Compact draggable Start / End',
    releasedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes: ['Restore Start and End graph dragging in Edit and Insert with compact flags and separate touch targets.', 'Keep direct time fields synchronized with the draft; only Save persists changes.', 'Preserve route cleanup, weekly export, signatures, documents and existing Logbook save behavior.'] });
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const path of ['package.json', 'package-lock.json']) {
  const value = JSON.parse(read(path)); value.version = VERSION;
  if (value.packages?.['']) value.packages[''].version = VERSION;
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
  let value = read(path);
  for (const [key, replacement] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
    const pattern = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`, 'g');
    assert.equal([...value.matchAll(pattern)].length, 1, 'Unique release marker ' + path + ' ' + key);
    value = value.replace(pattern, `const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path, value);
}
for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
  fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
}
const test = 'scripts/test-duty-graph-continuity.mjs';
const old = "assert.equal(meta.version,'110.3.53');assert.equal(meta.build,'v110353-route-cleanup');";
const replacement = `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
if (!read(test).includes(replacement)) {
  assert.equal(read(test).split(old).length - 1, 1, 'Final release contract anchor');
  fs.writeFileSync(test, read(test).replace(old, replacement));
}
console.log('PASS — 110.3.55 compact draggable boundaries installed; Logbook save logic unchanged');
