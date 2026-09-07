import fs from 'node:fs';
import assert from 'node:assert/strict';

function write(path, transform) {
  const before = fs.readFileSync(path,'utf8');
  const after = transform(before);
  assert.notEqual(after, '', `${path} became empty`);
  fs.writeFileSync(path, after);
}
function addBefore(source, anchor, addition, label) {
  if (source.includes(addition.trim())) return source;
  assert.ok(source.includes(anchor), `110.2.7 browser anchor missing: ${label}`);
  return source.replace(anchor, addition + anchor);
}
function replaceCount(source, before, after, minimum, label) {
  if (source.includes(after) && !source.includes(before)) return source;
  const count = source.split(before).length - 1;
  assert.ok(count >= minimum, `110.2.7 browser replacement missing: ${label}; found ${count}`);
  return source.split(before).join(after);
}

const helper = `async function openSelectedEditV11027(page,id,editorSelector='.editor-ui-v110'){
  const row=page.locator(\`[data-log-event-id="\${id}"]\`);
  await row.waitFor();
  if(await row.locator('.motive-edit-reveal-v11027').count()===0) await row.click();
  const edit=row.locator('.motive-edit-reveal-v11027');
  await edit.waitFor();
  assert.equal(await page.locator(editorSelector).count(),0,'selecting an event must stay read-only until Edit');
  await edit.click();
  await page.locator(editorSelector).waitFor();
}
`;

// Full editor regression: every previous direct .blue-edit open becomes the
// intentional Motive sequence. Keep all time/Save/Cancel/live assertions.
write('scripts/browser-logbook-editor-v110.mjs', source => {
  source=addBefore(source,'async function seed(page,state,existing=false)',helper,'logbook editor helper');
  for(const id of ['short','rest','live']){
    source=replaceCount(source,`await page.locator('[data-log-event-id=${id}] .blue-edit').click();`,`await openSelectedEditV11027(page,'${id}');`,1,`logbook ${id} direct edit`);
  }
  source=replaceCount(source,`await page.locator('[data-log-event-id=live] .blue-edit').waitFor();`,`await page.locator('[data-log-event-id=live]').waitFor();`,1,'live row readiness');
  return source;
});

// Compact suite intentionally enters through the graph hit target. Graph tap
// now selects; the revealed Edit action is the explicit second step.
write('scripts/browser-compact-editor-v111.mjs', source => {
  source=addBefore(source,'function contrast(a,b)',helper,'compact editor helper');
  source=replaceCount(source,
    `await page.locator('.logbook-ui-v110 [data-hit-event=target]').click();await page.locator('.editor-compact-v111').waitFor();`,
    `await page.locator('.logbook-ui-v110 [data-hit-event=target]').click();await openSelectedEditV11027(page,'target','.editor-compact-v111');`,
    1,'compact graph select then edit');
  return source;
});

// GPS/live follow-up helper keeps its existing contract while using selection.
write('scripts/browser-logbook-followup-v11021.mjs', source => {
  const before=`async function openEdit(page){await page.locator('[data-log-event-id="live-gps"] .blue-edit').click();await page.locator('.editor-ui-v110').waitFor();}`;
  const after=`async function openEdit(page){await openSelectedEditV11027(page,'live-gps','.editor-ui-v110');}`;
  source=addBefore(source,'async function openEdit(page)',helper,'followup select helper');
  source=replaceCount(source,before,after,1,'followup openEdit');
  return source;
});

// Override/chips suite uses the same target repeatedly through save/reload.
write('scripts/browser-motive-override-v11023.mjs', source => {
  const before=`async function openTarget(page){await page.locator('[data-log-event-id=target] .blue-edit').click();await page.locator('.editor-compact-v111').waitFor();}`;
  const after=`async function openTarget(page){await openSelectedEditV11027(page,'target','.editor-compact-v111');}`;
  source=addBefore(source,'async function openTarget(page)',helper,'override select helper');
  source=replaceCount(source,before,after,1,'override openTarget');
  return source;
});

// Canonical continuity: a real merged row starts without Edit. Selecting it is
// read-only and reveals Edit. Derived carry rows remain non-editable.
write('scripts/browser-canonical-continuity-v11026.mjs', source => {
  const before=`    assert.equal(await rows.first().locator('.event-badge').innerText(),'OFF');assert.match(await rows.first().innerText(),/OFF DUTY/);assert.equal(await rows.first().locator('button.blue-edit').count(),1,'canonical real row stays editable');assert.equal(await rows.first().locator('.event-continuity-tag-v11026').count(),0);`;
  const after=`    assert.equal(await rows.first().locator('.event-badge').innerText(),'OFF');assert.match(await rows.first().innerText(),/OFF DUTY/);assert.equal(await rows.first().locator('button.blue-edit').count(),0,'Edit starts hidden until the canonical real row is selected');assert.equal(await rows.first().locator('.event-continuity-tag-v11026').count(),0);const beforeSelect=await stored(page);await rows.first().click();await rows.first().locator('.motive-edit-reveal-v11027').waitFor();assert.equal(await rows.first().locator('button.blue-edit').count(),1,'selected canonical real row reveals Edit');assert.equal(await page.locator('.editor-modern-v11027').count(),0,'selection alone must not open editor');assert.deepEqual((await stored(page)).eventsByDay,beforeSelect.eventsByDay,'selection must be read-only');`;
  source=replaceCount(source,before,after,1,'canonical selected Edit reveal');
  return source;
});

console.log('PASS — legacy Chromium/WebKit suites now exercise select → Edit without weakening runtime assertions');
