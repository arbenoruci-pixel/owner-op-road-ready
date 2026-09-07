import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='scripts/browser-logbook-editor-v110.mjs';
let source=fs.readFileSync(path,'utf8');
const before=`await page.reload();await openLog(page);await page.locator('[data-log-event-id=live] .blue-edit').click();assert.equal((await page.locator('.selected-duration-live b').innerText()).trim(),'2h 5m');assert.match(await page.locator('.note-toggle-v90').innerText(),/Live note proof/);`;
const after=`await page.reload();await openLog(page);await page.locator('[data-log-event-id=live] .blue-edit').click();assert.equal((await page.locator('.selected-duration-live b').innerText()).trim(),'2h 5m');const persistedNote=page.getByLabel('Notes',{exact:true});if(!(await persistedNote.isVisible()))await page.locator('.note-toggle-v90').click();assert.equal(await persistedNote.inputValue(),'Live note proof');`;
if(!source.includes(after)){
  assert.ok(source.includes(before),'110.2.8 live-note browser assertion anchor changed');
  source=source.replace(before,after);
  fs.writeFileSync(path,source);
}
console.log('PASS — live note reload checks the persisted Notes value instead of the toggle label');
