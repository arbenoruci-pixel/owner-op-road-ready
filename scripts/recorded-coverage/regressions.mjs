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
replace(browser,'activeDay===today?312:1440',"activeDay===today?312:activeDay==='2026-09-07'?1202:1440",2);
console.log('PASS — final-runtime regressions require saved completed endpoints and explicit missing time');
