import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='scripts/browser-logbook-editor-v110.mjs';
let source=fs.readFileSync(path,'utf8');
const before=`assert.match(await page.locator('.note-toggle-v90').innerText(),/Live note proof/);`;
const after=`const persistedNote=page.getByLabel('Notes',{exact:true});if(!(await persistedNote.isVisible()))await page.locator('.note-toggle-v90').click();assert.equal(await persistedNote.inputValue(),'Live note proof');`;
if(!source.includes(after)){
  assert.ok(source.includes(before),'110.2.8 live-note browser assertion anchor changed');
  source=source.replace(before,after);
  fs.writeFileSync(path,source);
}
console.log('PASS — live note reload checks the persisted Notes value instead of the toggle label');
