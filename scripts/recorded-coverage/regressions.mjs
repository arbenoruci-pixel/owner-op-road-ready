// The legacy build generates tests alongside its earlier runtime. Adapt only
// obsolete completed-day assumptions after the new recorded-time policy lands.
// Every assertion and current-day/reload/immutability check remains in place.
import fs from 'node:fs';
import assert from 'node:assert/strict';
function replace(file, before, after, count=1) {
  const source=fs.readFileSync(file,'utf8');
  if(source.includes(after))return;
  assert.equal(source.split(before).length-1,count,'Recorded-time test anchor: '+file+' / '+before);
  fs.writeFileSync(file,source.replaceAll(before,after));
}
const rendered='scripts/test-rendered-duty-graph.mjs';
replace(rendered,'assert.match(render(past,1440),/24h/);',
  "assert.match(render(past,1202),/20h 2m/);\n  assert.match(render(past,1202),/Unrecorded time: 20:02–24:00 · 238 min/);");
replace(rendered,'yesterday 24h, today 5h12','yesterday saved 20h2, today 5h12');
const driving='scripts/v110372/test-rendered-driving-day.mjs';
replace(driving,"assert.match(render(first,1325,1440,'origin day reaches midnight using the recorded next-day link'),/1h 55m/);",
  "assert.match(render(first,1325,1326,'completed origin keeps its saved end despite a next-day link'),/Unrecorded time: 22:06–24:00 · 114 min/);");
replace(driving,"render(JSON.parse(JSON.stringify(first)),1325,1440,'serialized reopen retains the same origin endpoint');",
  "render(JSON.parse(JSON.stringify(first)),1325,1326,'serialized reopen retains the same saved origin endpoint');");
replace(driving,"render(live,1325,1440,'pending midnight tick completes only its exact active origin');",
  "render(live,1325,1326,'completed origin exposes unwritten time while rollover is pending');");
replace(driving,"assert.equal(shown.at(-1).endMin,1440,'the shared view used by mileage gets the same endpoint');",
  "assert.equal(shown.at(-1).endMin,1326,'the shared view used by mileage gets the same saved endpoint');");
replace('scripts/v110372/browser-driving-day.mjs',"const end=kind==='linked'?1440:1326;await assertEnd(page,end);",
  "const end=1326;await assertEnd(page,end);\n   assert.match(await page.locator('.logbook-ui-v110').innerText(),/Unrecorded time: 22:06–24:00 · 114 min/);");
replace('scripts/verify-sign-minute-boundary-v963.mjs',
  "assert.equal(oneMinuteArtifact.some(issue => String(issue.code || '').startsWith('overlap_')), false,\n  'one-minute minute-boundary artifact must not block certification');",
  "assert.equal(oneMinuteArtifact.some(issue => String(issue.code || '').startsWith('overlap_')), true,\n  'saved one-minute overlap requires review before a new certification');");
const browser='scripts/browser-duty-graph-continuity.mjs';
replace(browser,"const initial=fixture(activeDay,status);await setup(page,context,initial);const rows=page.locator('.events.clean-events .clean-event-row');await rows.first().waitFor();",
  `const initial=fixture(activeDay,status);await setup(page,context,initial);const rows=page.locator('.events.clean-events .clean-event-row');
   if(activeDay==='2026-09-05') {
    const before=await stored(page);
    assert.equal(await rows.count(),0,'an unsigned empty completed day has no recorded row');
    assert.equal(await page.locator('.logbook-ui-v110 .duty-trace-v110').count(),0,'old status cannot paint a completed empty day');
    assert.match(await page.locator('.logbook-ui-v110').innerText(),/Unrecorded time: 00:00–24:00 · 1440 min/);
    await page.reload();await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();
    const after=await stored(page);
    assert.equal(await rows.count(),0);
    for(const key of ['eventsByDay','signatureByDay','logbookEditHistoryByDay'])assert.deepEqual(after[key],before[key]);
    assert.deepEqual(errors,[]);reports.push({browser:name,activeDay,status,passed:true});continue;
   }
   await rows.first().waitFor();`);
replace(browser,'activeDay===today?312:1440',"activeDay===today?312:activeDay==='2026-09-07'?1202:1364",2);
const carry='scripts/browser-carry-edit-v110365.mjs';
replace(carry,"import assert from 'node:assert/strict';",
  "import {createCertificationRecord} from '../source/src/modules/logbook/certificationV110.js';\nimport assert from 'node:assert/strict';");
replace(carry,"const initial=fixture(scenario),activeDay=initial.activeDay,end=scenario==='prefix'?617:scenario==='full-day'?1440:90;",
  `const initial=fixture(scenario),activeDay=initial.activeDay,end=scenario==='prefix'?617:scenario==='full-day'?1440:90;
   // Completed carry needs a complete, verified adjacent signed day.
   if(scenario!=='current-prefix') {
    initial.eventsByDay[prior][0].startMin=0;
    initial.signatureByDay[prior]=createCertificationRecord(initial,prior,{now:new Date('2026-09-17T06:00:00Z').getTime()});
    initial.certifyStatus[prior]='Certified';
   }`);
const wizard='scripts/browser-wizard-midnight-v110317.mjs';
replace(wizard,`    if(scenario==='explicit-end') {
     assert.match(text,/1h 58m unconfirmed/);
     await check.getByRole('button',{name:'Start Fix Wizard',exact:true}).click();
     const wizard=page.getByRole('dialog',{name:'Coverage Fix Wizard',exact:true});await wizard.waitFor();
     assert.match(await wizard.innerText(),/10:02 PM.*12:00 AM/);
     await wizard.getByRole('button',{name:'Cancel',exact:true}).first().click();
    } else {
     assert.doesNotMatch(text,/missing log coverage|1h 58m unconfirmed/i);
     assert.equal(await check.getByRole('button',{name:'Start Fix Wizard',exact:true}).count(),0);
     await page.screenshot({path:\`\${output}/\${name}-\${scenario}-\${stage}.png\`});
     await check.getByRole('button',{name:'Close',exact:true}).click();
     assert.doesNotMatch(await page.locator('.signature-panel').innerText(),/Missing log coverage|1h 58m unconfirmed/i);
    }`,
  `    assert.match(text,/1h 58m unconfirmed/,'all saved tails expose their exact missing interval');
    await check.getByRole('button',{name:'Start Fix Wizard',exact:true}).click();
    const wizard=page.getByRole('dialog',{name:'Coverage Fix Wizard',exact:true});await wizard.waitFor();
    assert.match(await wizard.innerText(),/10:02 PM.*12:00 AM/);
    await wizard.getByRole('button',{name:'Cancel',exact:true}).first().click();
    if(await check.isVisible())await check.getByRole('button',{name:'Close',exact:true}).click();
    assert.match(await page.locator('.sign-save').innerText(),/Fix Issues Before Sign/);`);
replace(wizard,`   if(scenario!=='explicit-end') {
    await page.locator('.sign-save').click();
    await waitState(page,s=>s.certifyStatus?.[day]==='Certified');
    await page.reload();await openLog(page);
    await page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Sign',exact:true}).click();
    assert.match(await page.locator('.sign-status-card').innerText(),/Signed and certified/);
    assert.deepEqual((await stored(page)).eventsByDay[day],baseline.eventsByDay[day]);
   }`,
  `   await page.locator('.sign-save').click();
   await page.getByRole('dialog',{name:'Fix issues wizard',exact:true}).waitFor();
   assert.deepEqual((await stored(page)).signatureByDay,baseline.signatureByDay,'clicking Sign with a gap cannot create an attestation');
   await page.reload();await openLog(page);
   await page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Sign',exact:true}).click();
   assert.doesNotMatch(await page.locator('.sign-status-card').innerText(),/Signed and certified/);
   assert.deepEqual((await stored(page)).eventsByDay[day],baseline.eventsByDay[day]);`);
const canonical='scripts/browser-canonical-continuity-v11026.mjs';
replace(canonical,"await setup(page,context,fixture(activeDay));const rows=page.locator('.events.clean-events .clean-event-row');await rows.first().waitFor();",
  `await setup(page,context,fixture(activeDay));const rows=page.locator('.events.clean-events .clean-event-row');
   if(activeDay==='2026-09-05') {
    const before=await stored(page);
    assert.equal(await rows.count(),0,'unsigned empty completed dates remain visibly unrecorded');
    assert.equal(await page.locator('.logbook-ui-v110 .duty-trace-v110').count(),0);
    assert.match(await page.locator('.logbook-ui-v110').innerText(),/Unrecorded time: 00:00–24:00 · 1440 min/);
    await page.reload();await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();
    const after=await stored(page);
    for(const key of ['eventsByDay','signatureByDay','logbookEditHistoryByDay'])assert.deepEqual(after[key],before[key]);
    assert.deepEqual(errors,[]);reports.push({browser:name,activeDay,passed:true});continue;
   }
   await rows.first().waitFor();`);
const sleeper='scripts/v110408/browser-sleeper-midnight.mjs';
replace(sleeper,"assert.match(await event.innerText(), ended ? /\\b1m\\b/ : /\\b2h\\b/);",
  "assert.match(await event.innerText(), /\\b1m\\b/);\n  assert.match(await page.locator('.logcheck-summary').innerText(), /Unrecorded time: 22:01–24:00 · 119 min/);");
replace(sleeper,"assert.equal(totals[1], ended ? '0.02' : '2.00', 'Sleeper total must match its visible interval');",
  "assert.equal(totals[1], '0.02', 'Sleeper total must match its saved interval regardless of later status changes');");
const rest='scripts/hos-rest-review/browser.mjs';
replace(rest,"assert.equal(await editor.getByLabel('End time',{exact:true}).inputValue(),'00:00');",
  "assert.equal(await editor.getByLabel('End time',{exact:true}).inputValue(),'21:44');");
replace(rest,"assert.match(await editor.locator('.selected-duration-live').innerText(),/2h 17m/);",
  "assert.match(await editor.locator('.selected-duration-live').innerText(),/\\b1m\\b/);");
replace(rest,'historical Sleeper opens to midnight; Cancel is read-only','historical Sleeper opens at its saved end; Cancel is read-only');
for(const file of [browser,canonical]) {
  replace(file,"assert.equal(await rows.count(),1,'one canonical event row expected');",
    `assert.equal(await rows.count(),activeDay==='2026-09-06'?3:1,'completed day preserves each saved event row');
   if(activeDay==='2026-09-06') {
    assert.deepEqual(await rows.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-log-event-id'))),['off-a','off-b','off-c']);
    assert.match(await page.locator('.logcheck-summary').innerText(),/Unrecorded time: 22:44–24:00 · 76 min/);
   }`);
}
replace(browser,` const expectedX=52+minutes/1440*894;
 await page.waitForFunction(({expectedX})=>{
   const traces=[...document.querySelectorAll('.logbook-ui-v110 .log-graph-v110 .duty-trace-v110')];
   return traces.length===1 && Math.abs(Number(traces[0].getAttribute('d').split(' H ').at(-1))-expectedX)<0.0001;
 },{expectedX},{timeout:10000});`,
  ` const expectedXs=(minutes===1364?[998,1033,1364]:[minutes]).map(minute=>52+minute/1440*894);
 await page.waitForFunction(({expectedXs})=>{
   const traces=[...document.querySelectorAll('.logbook-ui-v110 .log-graph-v110 .duty-trace-v110')];
   return traces.length===expectedXs.length && traces.every((trace,index)=>Math.abs(Number(trace.getAttribute('d').split(' H ').at(-1))-expectedXs[index])<0.0001);
 },{expectedXs},{timeout:10000});`);
replace(browser,'graph total must match canonical row, not stored end time','graph total must match the exact displayed saved intervals');
replace(canonical,'one canonical status body; carry stays read-only','saved completed rows remain separate; current carry stays read-only');
console.log('PASS — final-runtime regressions require saved completed endpoints and explicit missing time');
