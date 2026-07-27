import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui=fs.readFileSync('source/src/modules/owneros/LoadFoldersV10969.jsx','utf8');
assert.ok(ui.includes("onOpenLog?.(d)"),'Logbook action must pass an exact date');
assert.ok(ui.includes("completedActionLabel"),'Completed evidence rows need Open actions');
for(const label of ['Open Rate Con','Open BOL','Open POD','Open Logbook','Open Miles'])assert.ok(ui.includes(label),`${label} missing`);
assert.ok(!ui.includes('onClick={onOpenLog}>Open Miles'),'Open Miles must not call Logbook without a date');
assert.ok(!ui.includes('onClick={onOpenLog}>Open Logbook'),'Open Logbook must not call Logbook without a date');
console.log('PASS — exact historical load date is passed and completed evidence rows are openable');
