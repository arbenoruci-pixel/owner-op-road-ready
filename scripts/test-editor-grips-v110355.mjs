import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { editorGripLayout } from '../source/src/modules/editor/components/editorGripLayoutV110355.js';
import { draggedMinuteV111 } from '../source/src/modules/editor/components/graphHandlesV111.js';
import { insertPointerMinuteV110316 } from '../source/src/modules/editor/insertInteractionsV110316.js';
import { GRAPH as G, graphX } from '../source/src/modules/graph/graphGeometryV110.js';
let checks = 0;
for (const width of [160, 280, 312, 320, 375, 382, 390, 422, 430, 568, 844]) {
  for (const [start, end] of [[0,1],[0,1440],[600,660],[660,780],[1150,1236],[1236,1247],[915,916],[1438,1439],[1439,1440]]) {
    const positions = editorGripLayout(start, end, width);
    assert.ok(positions.start.left >= 0 && positions.end.left + 44 <= width);
    assert.ok(positions.start.left + 48 <= positions.end.left + 1e-9, '44px touch targets must not overlap');
    assert.ok(positions.start.labelLeft + 66 <= positions.end.labelLeft + 1e-9, 'time labels must not overlap');
    assert.ok(positions.start.labelLeft >= 0 && positions.end.labelLeft + 64 <= width);
    for (const edge of ['start','end']) {
      const minute = edge === 'start' ? start : end;
      assert.equal(positions[edge].x, graphX(minute) / G.width * width, 'guide line stays at exact boundary');
      assert.ok(positions[edge].tip >= 8 && positions[edge].tip <= 36);
    }
    checks++;
  }
}
const event = Object.freeze({ id: 'clip', startMin: 1150, endMin: 1236, status: 'D' });
assert.equal(draggedMinuteV111(event,'start',1150,-30,390),1026);
assert.equal(draggedMinuteV111(event,'end',1236,20,390),1319);
assert.equal(draggedMinuteV111(event,'start',1150,1000,390),1235);
assert.equal(draggedMinuteV111(event,'end',1236,1000,390),1440);
assert.equal(insertPointerMinuteV110316('start',1236,-40,390),1071);
const root = 'source/src/modules/editor/';
const source = fs.readFileSync(root + 'components/CompactGraphPanelV111.jsx', 'utf8');
assert.ok(source.includes('EDITOR_BOUNDARY_GRIPS_V110355'));
assert.ok(source.includes('rr-time-grip-v110355'));
assert.ok(!source.includes('graph-handle-rail-v111'));
assert.ok(source.includes('getScreenCTM') && source.includes('pointercancel') && source.includes('lostpointercapture'));
assert.ok(source.includes('onRestoreRange(snapshot)'));
assert.doesNotMatch(source, /localStorage|indexedDB|onSave\(|setState\(/);
for (const name of ['EditEventSheet', 'InsertEditEventSheet']) {
  const file = fs.readFileSync(root + name + '.jsx', 'utf8');
  assert.ok(file.includes('<EditorGraphPanel') && file.includes('<EditorTimeControls'));
}
const locks = JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));
for (const [path, expected] of Object.entries(locks.files)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'), expected, 'Stable module unchanged: ' + path);
}
const meta = JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
assert.equal(meta.version,'110.3.55'); assert.equal(meta.build,'v110355-compact-time-grips'); assert.equal(meta.force,false);
assert.ok(fs.readFileSync(root.replace('editor/','backup/') + 'BackupLogsScreen.jsx','utf8').includes('exportCycleWeek'));
console.log(`PASS — ${checks} compact layout cases, exact boundaries, Edit/Insert drag math, immutable data, stable modules, weekly export and release markers`);
