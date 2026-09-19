import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
const edits=[];
function patch(path,before,after,transform){
 const source=fs.readFileSync(path,'utf8');if(hash(source)===after)return;
 assert.equal(hash(source),before,'Unexpected interaction baseline: '+path);
 const next=transform(source);assert.equal(hash(next),after,'Unexpected interaction output: '+path);
 edits.push({path,next});
}
function replace(source,before,after){assert.equal(source.split(before).length-1,1,'Interaction anchor');return source.replace(before,after);}
patch("source/src/shared/duty/dutyForm.css","0765e6e3cbc26ad04291494d276061d4170a4540b4b213731682cd8b7d27c27a","a06d0d37f6c9c88182a0f8607410c35769568386b8b06e2cd9b45dd9d830d731",source=>source+"\n/* Live Status formerly positioned Save with translateX(-50%). In the shared\n   footer both actions participate in the same flex layout and keep hit targets. */\nhtml body .dd-root.driver-duty-form.dd-root.dd-root .dd-footer button{transform:none!important;translate:none!important;inset:auto!important;max-width:100%!important}\n");
patch("scripts/browser-editor-grips-v110355.mjs","acc3a7d2513d2c6b57bb39d5ff6de22f9c5c43b8a47bc6803cb95145a93787d6","6bb68eed97569398390ff6249db42f79c19b34893a24e208be77e2e2d8b99721",source=>{
 source=replace(source,"const boundary = async(page,edge) => Number(await handle(page,edge).getAttribute('aria-valuenow'));","const boundary = async(page,edge) => Number(await handle(page,edge).getAttribute('aria-valuenow'));\nasync function waitBoundaries(page,values) {\n  await page.waitForFunction(([start,end]) =>\n    Number(document.querySelector('[role=slider][aria-label=\"start time handle\"]')?.getAttribute('aria-valuenow'))===start &&\n    Number(document.querySelector('[role=slider][aria-label=\"end time handle\"]')?.getAttribute('aria-valuenow'))===end,\n    values,{timeout:2000});\n}\n");
 source=replace(source,"    // One pointer gesture can cross an edge and then reverse without accumulating duration.","    await waitBoundaries(page,[600,601]);\n    // One pointer gesture can cross an edge and then reverse without accumulating duration.");
 source=replace(source,"      assert.deepEqual([await boundary(page,'start'),await boundary(page,'end')],[600,601]);","      // WebKit may commit pointer-up state on the following animation frame.\n      // Wait for the exact reversed interval; no endpoint tolerance is allowed.\n      await waitBoundaries(page,[600,601]);\n      assert.deepEqual([await boundary(page,'start'),await boundary(page,'end')],[600,601]);");
 source=replace(source,"    assert.deepEqual([await boundary(page,'start'),await boundary(page,'end')],range);await fieldsMatch(page);","    await waitBoundaries(page,range);\n    assert.deepEqual([await boundary(page,'start'),await boundary(page,'end')],range);await fieldsMatch(page);");
 return source;
});
for(const {path,next}of edits)fs.writeFileSync(path,next);
console.log('PASS — shared footer has separate reachable actions and exact pointer intervals wait for their rendered commit');
