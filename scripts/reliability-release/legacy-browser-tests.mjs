import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Build-time browser-fixture adaptation only. Run after the legacy materializers
// and their hash gates. Application modules and their locks are never written.
const marker='// RELIABILITY_HISTORICAL_BROWSER_APPROVAL_V1';
const helper=`${marker}
function reliabilityHistoricalEvidence(state) {
  assert.ok(state,'Synthetic historical snapshot must be available');
  return Object.fromEntries(['eventsByDay','routeLegsByDay','loadInfo','loadGuidesById',
    'manualMilesByDay','signatureByDay','certifyStatus','formByDay','dotWallet',
    'teamLogbooksByDriverId','logbookEditHistoryByDay','logbookRouteRemovalsV110370']
    .map(key=>[key,state[key]]));
}
async function reliabilityApproveHistorical(page,scope,action,readSnapshot,before,day) {
  const evidence=reliabilityHistoricalEvidence(before);
  const unchanged=async label=>assert.deepEqual(reliabilityHistoricalEvidence(await readSnapshot()),evidence,label);
  const waitDisabled=async value=>{
    for(let n=0;n<100;n++){
      if(await action.isDisabled()===value)return;
      await page.waitForTimeout(25);
    }
    assert.equal(await action.isDisabled(),value,'Historical save must follow the explicit approval state');
  };
  const review=scope.getByRole('region',{name:'Review changes to '+day,exact:true});
  await review.waitFor({state:'visible'});
  assert.ok(await review.locator('.hos-event-diff tbody tr').count()>0,'Review must show the actual event changes');
  assert.match(await review.innerText(),/Before[\\s\\S]*After/,'Review retains before/after evidence');
  const approval=scope.locator('.hos-history-approval input[type="checkbox"]');
  assert.equal(await approval.count(),1,'The historical change requires its own approval');
  assert.match(await scope.locator('.hos-history-approval').innerText(),new RegExp(day));
  assert.equal(await approval.isChecked(),false,'A new historical draft starts unapproved');
  await waitDisabled(true);
  await unchanged('Reviewing a historical draft cannot persist changes');
  await review.scrollIntoViewIfNeeded();
  await approval.check();
  await waitDisabled(false);
  await unchanged('Approval alone cannot persist historical changes');
  // Withdrawing approval returns to the same unsaved draft. A later save must
  // receive approval again; no synthetic click bypasses a disabled control.
  await approval.uncheck();
  await waitDisabled(true);
  await unchanged('Withdrawing approval leaves recorded history unchanged');
  await approval.check();
  await waitDisabled(false);
  await unchanged('Only the subsequent Save or Apply may commit the reviewed draft');
}
`;

const cases=[
  {
    file:'scripts/browser-editor-grips-v110355.mjs',
    beforeHash:'628b287ac434b64d2188cc9b5c2cef8ab8a771c5d047c95fc758a1b756a81d82',
    patches:[
      [
        "    await fieldsMatch(page);await page.locator('.save-main').click();",
        "    await fieldsMatch(page);await reliabilityApproveHistorical(page,page.locator('.editor-modern-v11027'),page.locator('.save-main'),()=>stored(page),before,day);await page.locator('.save-main').click();",
      ],
      [
        "    await page.locator('.quick-activities-v11023').getByRole('button',{name:'Fuel',exact:true}).click();\n    await page.locator('.save-main').click();",
        "    await page.locator('.quick-activities-v11023').getByRole('button',{name:'Fuel',exact:true}).click();\n    await reliabilityApproveHistorical(page,page.locator('.editor-compact-v111'),page.locator('.save-main'),()=>stored(page),persisted,day);\n    await page.locator('.save-main').click();",
      ],
    ],
  },
  {
    file:'scripts/v110409/browser-edit-gps.mjs',
    beforeHash:'6ede1f1b4d27b68dc2d32e3fcb45ea7e97728f8923dc2dcbe907379a52b3456a',
    patches:[
      [
        "     await panel.getByRole('button',{name:'Apply 1h 30m later',exact:true}).click();",
        "     await reliabilityApproveHistorical(page,panel,panel.getByRole('button',{name:'Apply 1h 30m later',exact:true}),()=>snapshot(page),before,day);\n     await panel.getByRole('button',{name:'Apply 1h 30m later',exact:true}).click();",
      ],
      [
        "     await selectTwo(page);await panel.getByRole('button',{name:'Preview 60 minutes later',exact:true}).click();await panel.getByRole('button',{name:'Apply 1h later',exact:true}).click();",
        "     const beforeSecondMove=await snapshot(page);assert.deepEqual(beforeSecondMove.eventsByDay,before.eventsByDay,'Undo restores the prior recorded intervals');\n     await selectTwo(page);await panel.getByRole('button',{name:'Preview 60 minutes later',exact:true}).click();await reliabilityApproveHistorical(page,panel,panel.getByRole('button',{name:'Apply 1h later',exact:true}),()=>snapshot(page),beforeSecondMove,day);await panel.getByRole('button',{name:'Apply 1h later',exact:true}).click();",
      ],
    ],
  },
  {
    file:'scripts/browser-rest-day-v110370.mjs',
    beforeHash:'d8d2e66074e88f09fd2bad8c075ee2682f7d2a4a3140e5656c21e99db9601b5d',
    patches:[
      [
        "  await editor.locator('.save-main').click();",
        "  await reliabilityApproveHistorical(page,editor,editor.locator('.save-main'),()=>stored(page),before,day);\n  await editor.locator('.save-main').click();",
      ],
    ],
  },
  {
    file:'scripts/browser-insert-interaction-v110316.mjs',
    beforeHash:'8df970e3063841a3970c8660d5814a95bdb2e2897efc4de4c7ae4b78d7b954fa',
    patches:[
      [
        "async function enabled(page){assert.equal(await page.locator('.save-main').isDisabled(),false);assert.equal(await page.locator('.editor-compact-v111 [role=alert]').count(),0);}",
        `async function enabled(page,before){
 const recorded=before||await stored(page),editor=page.locator('.editor-compact-v111');
 const today=await page.evaluate(zone=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return parts.year+'-'+parts.month+'-'+parts.day;},recorded.homeTerminalTimeZone);
 const approval=editor.locator('.hos-history-approval input[type="checkbox"]');
 if(day<today){
  await approval.waitFor({state:'visible'});
  // Returning to an identical approved draft can retain its token. Withdraw it
  // explicitly so every eligibility check exercises the approval gate again.
  if(await approval.isChecked())await approval.uncheck();
  await reliabilityApproveHistorical(page,editor,page.locator('.save-main'),()=>stored(page),recorded,day);
 }else assert.equal(await approval.count(),0,'A current-day draft does not require historical approval');
 assert.equal(await page.locator('.save-main').isDisabled(),false);assert.equal(await page.locator('.editor-compact-v111 [role=alert]').count(),0);
}`,
      ],
      [
        "async function range(page,start,end){await page.getByLabel('Start time',{exact:true}).fill(start);await page.getByLabel('End time',{exact:true}).fill(end);await enabled(page);}",
        "async function range(page,start,end){const beforeRange=await stored(page);await page.getByLabel('Start time',{exact:true}).fill(start);await page.getByLabel('End time',{exact:true}).fill(end);await enabled(page,beforeRange);}",
      ],
      [
        "   await range(page,'23:15','23:45');await page.getByRole('button',{name:/^(?:PTI|Pre-trip inspection)$/,exact:true}).click();await page.locator('.save-main').click();",
        "   await range(page,'23:15','23:45');await page.getByRole('button',{name:/^(?:PTI|Pre-trip inspection)$/,exact:true}).click();await enabled(page,original);await page.locator('.save-main').click();",
      ],
    ],
  },
];

const hash=text=>createHash('sha256').update(text).digest('hex');
function replaceOnce(source,before,after,label) {
  assert.equal(source.split(before).length,2,'Historical browser fixture anchor changed: '+label);
  return source.replace(before,()=>after);
}
function originalSource(source,fixture) {
  assert.ok(source.startsWith(helper),'Historical browser approval helper changed: '+fixture.file);
  let original=source.slice(helper.length);
  for(const [before,after]of [...fixture.patches].reverse())original=replaceOnce(original,after,before,fixture.file);
  assert.equal(hash(original),fixture.beforeHash,'Historical browser functional assertions changed: '+fixture.file);
  return original;
}

export function installLegacyBrowserTests({root=process.cwd(),writeFile=(file,text)=>fs.writeFileSync(file,text)}={}) {
  const release=JSON.parse(fs.readFileSync(path.join(root,'release-version.json'),'utf8'));
  assert.equal(release.version,'110.4.78','Apply browser approvals only to the materialized reliability release');
  assert.equal(release.reviewBuild,true);
  assert.equal(release.force,false);
  // Validate every target before any write. Reversing the additions must recover
  // the exact legacy test, including all functional and offline-access checks.
  const prepared=cases.map(fixture=>{
    const file=path.join(root,fixture.file),before=fs.readFileSync(file,'utf8');
    if(before.includes(marker)){originalSource(before,fixture);return {file,before,after:before};}
    assert.equal(hash(before),fixture.beforeHash,'Unexpected materialized browser fixture: '+fixture.file);
    let after=before;
    for(const [oldText,newText]of fixture.patches)after=replaceOnce(after,oldText,newText,fixture.file);
    after=helper+after;
    assert.equal(originalSource(after,fixture),before);
    return {file,before,after};
  });
  const changed=prepared.filter(item=>item.before!==item.after),attempted=[];
  try {
    for(const item of changed){attempted.push(item);writeFile(item.file,item.after);}
  }catch(error){
    const rollbackErrors=[];
    for(const item of attempted.reverse())try{fs.writeFileSync(item.file,item.before);}catch(rollback){rollbackErrors.push(rollback);}
    if(rollbackErrors.length)throw new AggregateError([error,...rollbackErrors],'Browser fixture write failed and rollback was incomplete');
    throw error;
  }
  return {changed:changed.length,unchanged:prepared.length-changed.length,files:prepared.map(item=>({file:path.relative(root,item.file),sha256:hash(item.after)}))};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=installLegacyBrowserTests({root:process.argv[2]||process.cwd()});
  console.log(`PASS historical browser approval fixtures: ${result.changed} updated, ${result.unchanged} unchanged; legacy assertions preserved`);
}
