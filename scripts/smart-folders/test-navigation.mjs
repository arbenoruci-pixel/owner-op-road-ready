// Final adapter for current navigation in historical browser regression suites.
// Run only after all legacy materializers. Their anchors and safety checks stay intact.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(file,before,after){
 // Normalize only our own insertion so a second final-adapter run is idempotent.
 const source=read(file).replaceAll('await openLegacyLoadArchive(page);','');
 if(source.includes(after))return;
 assert.equal(source.split(before).length,2,'Final browser navigation anchor: '+file+' / '+before.slice(0,120));
 fs.writeFileSync(file,source.replace(before,()=>after));
}
const patches=[
  [
    "scripts/import-display/browser.mjs",
    "  await page.getByRole('button',{name:'Documents',exact:true}).click();const workspace=page.getByRole('region',{name:'Records workspace'});\n",
    "  await page.getByRole('button',{name:'Documents',exact:true}).click();await openRecordsFiles(page);const workspace=page.getByRole('region',{name:'Records workspace'});\n"
  ],
  [
    "scripts/import-display/browser.mjs",
    "  for(const query of ['Matching-legacy','Unrelated-legacy','Matching-legacy']){await search.fill(query);await workspace.getByRole('button',{name:new RegExp(query)}).waitFor();assert.equal(await workspace.locator('.rr-files-row').count(),1,'Filtering preserved source copies must not leave phantom rows');}\n",
    "  for(const query of ['Matching-legacy','Unrelated-legacy','Matching-legacy']){await search.fill(query);await workspace.getByRole('button',{name:query==='Unrelated-legacy'?/Unrelated-legacy.pdf/:/Invoice · TEST-RECEIVED/}).waitFor();assert.equal(await workspace.locator('.rr-files-row').count(),1,'Filtering preserved source copies must not leave phantom rows');}\n"
  ],
  [
    "scripts/import-display/browser.mjs",
    "  await workspace.getByRole('button',{name:/Received-invoice.pdf/}).waitFor();\n",
    "  await workspace.getByRole('button',{name:/Invoice · TEST-RECEIVED/}).waitFor();\n"
  ],
  [
    "scripts/import-display/browser.mjs",
    "   assert.equal(await workspace.getByRole('button',{name:/Received-invoice.pdf/}).count(),1,'A metadata-only receive notification must not hide an imported original');\n",
    "   assert.equal(await workspace.getByRole('button',{name:/Invoice · TEST-RECEIVED/}).count(),1,'A metadata-only receive notification must not hide an imported original');\n"
  ],
  [
    "scripts/import-display/browser.mjs",
    "  const archived=page.locator('.business-record-card').filter({hasText:'TEST-ARCHIVED'});\n  await archived.waitFor();assert.match(await archived.innerText(),/ARCHIVED/i);assert.equal(await archived.getByRole('button',{name:/Mark /}).count(),0,'Archived loads cannot restart through the next-status action');\n  await notify();await page.getByText(/2\\s+tracked loads/).waitFor();assert.equal(await page.locator('.business-record-card').filter({hasText:'TEST-RECEIVED'}).count(),1);\n  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Billing',exact:true}).click();\n",
    "  await page.getByRole('group',{name:'Load status'}).getByRole('button',{name:/^Completed/}).click();\n  const archived=page.locator('.rr-smart-card').filter({hasText:'Load TEST-ARCHIVED'});\n  await archived.waitFor();await archived.click();await page.getByRole('heading',{name:'TEST-ARCHIVED',exact:true}).waitFor();assert.match(await page.locator('.rr-smart-heading').innerText(),/COMPLETED/);assert.equal(await page.locator('.rr-smart').getByRole('button',{name:/Mark /}).count(),0,'Archived loads cannot restart through the next-status action');\n  await page.getByRole('button',{name:'‹ All load folders',exact:true}).click();await notify();await page.locator('.rr-smart-card').filter({hasText:'Load TEST-RECEIVED'}).waitFor();assert.equal(await page.locator('.rr-smart-card').filter({hasText:'Load TEST-RECEIVED'}).count(),1);assert.equal(await page.locator('.rr-smart-card').filter({hasText:'Load TEST-ARCHIVED'}).count(),1);\n  await page.getByRole('button',{name:'‹ Home',exact:true}).click();await page.getByRole('button',{name:'Billing',exact:true}).click();\n"
  ],
  [
    "scripts/workspace-navigation/browser-navigation.mjs",
    "  await page.getByRole('button',{name:'Open shipment log',exact:true}).click();await page.locator('.phone-day-v435').waitFor();assert.equal((await snapshot(page)).activeDay,'2026-10-14');await page.getByRole('button',{name:'⌂ Home',exact:true}).click();\n",
    "  await page.getByRole('button',{name:'Open load folder',exact:true}).click();await page.locator('.rr-smart-card').filter({hasText:'Shipment / BOL SHIP-2'}).click();await page.getByLabel('Trip logbooks',{exact:true}).getByRole('button',{name:/2026-10-14/}).click();await page.locator('.phone-day-v435').waitFor();assert.equal((await snapshot(page)).activeDay,'2026-10-14');await page.getByRole('button',{name:'⌂ Home',exact:true}).click();\n"
  ],
  [
    "scripts/workspace-navigation/browser-navigation.mjs",
    "  await page.getByRole('button',{name:'Wallet',exact:true}).click();await page.getByRole('button',{name:'Open load docs',exact:true}).click();await page.getByRole('region',{name:'Records workspace'}).getByRole('heading',{name:'Shipment reference SHIP-2',exact:true}).waitFor();await page.getByRole('button',{name:'‹ Home',exact:true}).click();\n",
    "  await page.getByRole('button',{name:'Wallet',exact:true}).click();await page.getByRole('button',{name:'Open load docs',exact:true}).click();await page.locator('.rr-smart-card').filter({hasText:'Shipment / BOL SHIP-2'}).waitFor();await page.getByRole('button',{name:'‹ Home',exact:true}).click();\n"
  ],
  [
    "scripts/workspace-navigation/browser-navigation.mjs",
    "  await page.getByRole('button',{name:'Documents',exact:true}).click();const workspace=page.getByRole('region',{name:'Records workspace'}),search=workspace.getByPlaceholder('Load, receipt, truck or name');\n  await search.fill('Saved-rate');await workspace.getByRole('button',{name:/Saved-rate.pdf/}).click();await workspace.getByRole('button',{name:'Open original',exact:true}).waitFor();assert.equal(await workspace.getByRole('button',{name:'Save filing',exact:true}).count(),0);await workspace.getByRole('button',{name:'‹ All files',exact:true}).click();\n",
    "  await page.getByRole('button',{name:'Documents',exact:true}).click();await openRecordsFiles(page);const workspace=page.getByRole('region',{name:'Records workspace'}),search=workspace.getByPlaceholder('Load, receipt, truck or name');\n  await search.fill('Saved-rate');await workspace.getByRole('button',{name:/Ratecon · BROKER-1/}).click();await workspace.getByRole('button',{name:'Open original',exact:true}).waitFor();assert.equal(await workspace.getByRole('button',{name:'Save filing',exact:true}).count(),0);await workspace.getByRole('button',{name:'‹ All files',exact:true}).click();\n"
  ],
  [
    "scripts/workspace-navigation/browser-navigation.mjs",
    "  await workspace.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();await workspace.getByRole('heading',{name:'Shipment reference SHIP-2',exact:true}).waitFor();await page.getByRole('button',{name:/Oct 12.*Oct 18, 2026/}).click();await page.getByRole('button',{name:/Load BROKER-1/}).click();await page.getByRole('button',{name:'Open Pickup BOL',exact:true}).waitFor();\n",
    "  await workspace.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();await page.getByRole('button',{name:/Oct 12.*Oct 18, 2026/}).click();await page.getByRole('button',{name:/Load BROKER-1/}).click();await page.getByRole('button',{name:'Open Pickup BOL',exact:true}).waitFor();\n"
  ],
  [
    "scripts/v110453/browser-workspace.mjs",
    " const home=()=>page.getByRole('button',{name:'Documents',exact:true}).click();await home();const workspace=page.getByRole('region',{name:'Records workspace'});await workspace.getByRole('heading',{name:'Your records'}).waitFor();\n",
    " const home=async()=>{await page.getByRole('button',{name:'Documents',exact:true}).click();await openRecordsFiles(page);};await home();const workspace=page.getByRole('region',{name:'Records workspace'});await workspace.getByRole('heading',{name:'Your records'}).waitFor();\n"
  ],
  [
    "scripts/v110453/browser-workspace.mjs",
    " await page.reload();await page.locator('.adaptive-home-v1038').waitFor();await home();await workspace.getByPlaceholder('Load, receipt, truck or name').fill('228');await workspace.getByRole('button',{name:/Test Garage/}).click();await workspace.getByLabel('Notes',{exact:true}).fill('Tire repair');await workspace.getByRole('button',{name:'Save filing',exact:true}).click();await workspace.getByRole('status').filter({hasText:'Filing saved.'}).waitFor();repair=(await stored()).find(d=>d.local_id===repair.local_id);assert.equal(repair.evidenceFilingHistoryV1.length,2);\n",
    " await page.reload();await page.locator('.adaptive-home-v1038').waitFor();await home();await workspace.getByPlaceholder('Load, receipt, truck or name').fill('228');await workspace.getByRole('button',{name:/Repair-228.pdf/}).click();await workspace.getByLabel('Notes',{exact:true}).fill('Tire repair');await workspace.getByRole('button',{name:'Save filing',exact:true}).click();await workspace.getByRole('status').filter({hasText:'Filing saved.'}).waitFor();repair=(await stored()).find(d=>d.local_id===repair.local_id);assert.equal(repair.evidenceFilingHistoryV1.length,2);\n"
  ],
  [
    "scripts/reader-foundation/browser-current-load.mjs",
    "   await page.getByRole('button',{name:'Loads',exact:true}).click();await page.getByText('Business Center',{exact:true}).waitFor();\n",
    "   await page.getByRole('button',{name:'More tools',exact:true}).click();await page.getByRole('button',{name:'Manage load details',exact:false}).click();await page.getByText('Business Center',{exact:true}).waitFor();\n"
  ]
];
for(const [file,before,after] of patches)patch(file,before,after);

// The additional My month and Import entries are part of the current phone home.
const phone='scripts/v110435/browser-phone-home.mjs';
const countBefore="assert.equal(await page.getByRole('navigation',{name:'Apps'}).getByRole('button').count(),11);assert.equal(await page.getByRole('navigation',{name:'Apps'}).getByRole('button',{name:'My month',exact:true}).count(),1);";
const countAfter="assert.equal(await page.getByRole('navigation',{name:'Apps'}).getByRole('button').count(),12);assert.equal(await page.getByRole('navigation',{name:'Apps'}).getByRole('button',{name:'My month',exact:true}).count(),1);";
patch(phone,countBefore,countAfter);
// Keep navigation within one synthetic home-terminal day. Opening today's log
// must not create a real-wall-clock day after the protected-state snapshot.
patch(phone,
 "  await seed(page,state);const before=protectedData(await snapshot(page));",
 "  await page.clock.setFixedTime(new Date('2026-09-07T22:00:00Z'));await seed(page,state);const before=protectedData(await snapshot(page));");
// Profile-change notification schedules a React render; More tools is already
// present before that update, so wait for the changed navigation itself.
patch(phone,
 "  await page.getByRole('button',{name:'More tools',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Open logbook',exact:true}).count(),0);",
 "  await page.getByRole('button',{name:'Open logbook',exact:true}).waitFor({state:'hidden'});await page.getByRole('button',{name:'More tools',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Open logbook',exact:true}).count(),0);");
const files=[
  "scripts/browser-fullscreen-reader-v110369.mjs",
  "scripts/browser-owned-reader.mjs",
  "scripts/browser-saved-documents-v110344.mjs",
  "scripts/import-display/browser.mjs",
  "scripts/v110384/browser-rows.mjs",
  "scripts/v110404/browser.mjs",
  "scripts/v110412/browser-transfer.mjs",
  "scripts/v110413/browser-evidence.mjs",
  "scripts/v110414/browser-recovery.mjs",
  "scripts/v110415/browser-documents.mjs",
  "scripts/v110416/browser-weeks.mjs",
  "scripts/v110417/browser-loads.mjs",
  "scripts/v110418/browser-identity.mjs",
  "scripts/v110419/browser-source-copies.mjs",
  "scripts/v110420/browser-bol-filing.mjs",
  "scripts/v110430/browser-export.mjs",
  "scripts/v110434/browser-import.mjs",
  "scripts/v110435/browser-phone-home.mjs",
  "scripts/v110449/browser-load-history.mjs",
  "scripts/v110450/browser-mirror.mjs",
  "scripts/v110453/browser-workspace.mjs",
  "scripts/workspace-navigation/browser-navigation.mjs"
];


// Current compact reader opens detailed source review through this visible button.
// Keep every cancellation, confirmation and persisted-source assertion unchanged.
patch('scripts/reader-foundation/browser-pending-readings.mjs',
 "await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();",
 "await page.getByRole('button',{name:'All reading details',exact:true}).click();");

// Detailed pending explanations live inside the current document-information
// disclosure. Open that outer section; retain the test that the inner coverage
// disclosure stays closed and every pending/cancel/confirm/persistence assertion.
patch('scripts/reader-foundation/browser-pending-readings.mjs',
 "const pending=page.getByRole('region',{name:'Readings needing confirmation',exact:true});await pending.waitFor();",
 "await page.getByText('Document reading information',{exact:true}).click();const pending=page.getByRole('region',{name:'Readings needing confirmation',exact:true});await pending.waitFor();");

// Scanner review now uses the compact reader's All reading details toggle.
// Saved-document review can still render the noncompact Reader preview toggle.
// Both labels expose the same detailed source/correction controls; preserve all
// assertions and close/reopen actions rather than skipping these regressions.
for(const file of [
 'scripts/browser-fullscreen-reader-v110369.mjs','scripts/browser-owned-reader.mjs',
 'scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs',
 'scripts/v110384/browser-rows.mjs','scripts/v110382/browser-bol.mjs',
 'scripts/v110411/browser-filing.mjs','scripts/v110411/browser-rate.mjs',
 'scripts/v110464/browser-rate.mjs','scripts/v110466/browser-rate.mjs',
 'scripts/v110393/browser-bol-source.mjs','scripts/contract-rate/browser.mjs',
 'scripts/reader-ai/browser.mjs','scripts/reader-ai/browser-extraction.mjs',
 'scripts/v110410/browser-bol-columns.mjs','scripts/v110394/browser-bol-form.mjs'
]){
 const source=read(file),before="name:'Reader preview · Check source',exact:true",after="name:/^(?:All reading details|Reader preview · Check source)$/";
 assert.ok(source.includes(before)||source.includes(after),'Reader toggle anchor: '+file);
 fs.writeFileSync(file,source.replaceAll(before,after).replaceAll("name:'Reader preview · Close',exact:true","name:/^(?:All reading details|Reader preview · Close)$/"));
}

// Compact scanner keeps the same AI classification evidence inside detailed
// source review rather than the former noncompact summary banner. Preserve the
// exact call count, unassigned filing type and human-confirmed provenance checks.
patch('scripts/reader-ai/browser.mjs',
 `    await page.getByLabel('AI document check',{exact:true}).getByText(/AI suggests POD/).waitFor();
    assert.equal(aiCalls,1);
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'other','suggestion must not silently change filing type');
    await page.getByRole('button',{name:/^(?:All reading details|Reader preview · Check source)$/}).click();`,
 `    await page.getByRole('button',{name:/^(?:All reading details|Reader preview · Check source)$/}).click();
    await page.getByLabel('AI type suggestion',{exact:true}).getByText(/AI suggests POD/).waitFor();
    assert.equal(aiCalls,1);
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'other','suggestion must not silently change filing type');`);

// Extracted source fields now live inside the compact scanner information disclosure.
// Preserve every field/source assertion and open that disclosure before its toggle.
for(const file of ['scripts/v110411/browser-filing.mjs','scripts/v110410/browser-bol-columns.mjs','scripts/v110394/browser-bol-form.mjs','scripts/v110393/browser-bol-source.mjs']){
 patch(file,
  "    await page.getByRole('button',{name:/^Extracted details/}).click();\n    const displayed=page.locator('.scan-details-v105 > div');",
  "    await page.getByText('Document reading information',{exact:true}).click();\n    await page.getByRole('button',{name:/^Extracted details/}).click();\n    const displayed=page.locator('.scan-details-v105 > details > div');");
}

// Home coverage requires a separate source-hash-bound evidence-facts review.
// Preserve the final no-warning assertion after that real UI confirmation.
patch('scripts/v110411/browser-filing.mjs',
 "import {readDocument} from '../../packages/smart-reader-core/src/index.js';",
 "import {readDocument} from '../../packages/smart-reader-core/src/index.js';\nimport {reviewFixturePodEvidence} from '../test-support/review-pod-evidence.mjs';");
patch('scripts/v110411/browser-filing.mjs',
 "    assert.equal(await page.getByText('Pickup BOL missing',{exact:true}).count(),0,'Saved POD covers current load BOL after reload without a duty link');",
 "    assert.equal(await page.getByText('Pickup BOL missing',{exact:true}).count(),1,'Reader-only save does not certify reviewed delivery evidence');\n    await reviewFixturePodEvidence(page,{loadNo:'00654321',date:'2026-09-24',reference:'00654321',output:output+'/'+name});\n    assert.equal(await page.getByText('Pickup BOL missing',{exact:true}).count(),0,'Saved POD covers current load BOL after reload without a duty link');");

// Recorded shipments are selectable evidence destinations, never broker loads.
// Exercise that explicit choice and prove it creates no canonical identity.
patch('scripts/reader-foundation/browser-current-load.mjs',
 "   if(await unlinked.count())assert.equal(await unlinked.isDisabled(),true,'unlinked shipment references cannot silently become filing folders');",
 `   if(await unlinked.count()){
    const storeBeforeShipment=await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')));
    assert.equal(await unlinked.isDisabled(),false,'recorded shipment evidence has an explicitly selectable destination');
    await unlinked.click();
    assert.equal(await page.getByRole('button',{name:'Choose load folder',exact:true}).locator('strong').innerText(),'Shipment / BOL '+shipperRef,'shipment selection is not presented as a broker load');
    const storeAfterShipment=await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')));
    assert.deepEqual(storeAfterShipment.loads,storeBeforeShipment.loads,'selecting a shipment never creates a broker folder');
    assert.deepEqual(storeAfterShipment.evidenceAliases||[],storeBeforeShipment.evidenceAliases||[],'selection never invents a reviewed load link');
    await page.getByRole('button',{name:'Choose load folder',exact:true}).click();
   }`);

// This scenario deliberately seeds two loads with the same legacy record ID.
// Existing linkage normalization repairs identity only; compare every other
// original field and exact repair provenance, rather than masking differences.
patch('scripts/browser-load-guide-v110322.mjs',
 "    assert.deepEqual(repaired.loads.find(l=>l.loadNo==='91001'),unrelated);",
 "    assert.deepEqual(repaired.loads.find(l=>l.loadNo==='91001'),{...unrelated,id:'collision:identity:91001',recordIdentityRepairV1:{previousId:'collision',loadNo:'91001',reason:'duplicate_record_id'}});\n    assert.equal(repaired.loads.find(l=>l.loadNo==='82002').id,'collision:identity:82002');");

// The locked DOT wizard already opens at Review; no preparation or sending is needed.
patch('scripts/workspace-navigation/browser-navigation.mjs',
 "await page.getByRole('button',{name:button,exact:true}).click();await page.getByRole('button',{name:arrival,exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await home();",
 "await page.getByRole('button',{name:button,exact:true}).click();if(button==='DOT Mode'){const wizard=page.getByRole('main',{name:'DOT inspection preparation'});await wizard.getByRole('heading',{name:'Review',exact:true}).waitFor();assert.deepEqual(await wizard.getByLabel('Preparation steps',{exact:true}).locator('li span').allTextContents(),['Review','Inspection link','Officer email']);}else await page.getByRole('button',{name:arrival,exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await home();");

// Reload may restore the phone day or its Home/list entry. Navigate visibly back
// to the recorded day before the existing exact persisted-event comparison.
patch('scripts/v110421/browser-gps-sign.mjs',
 "await page.reload();await page.locator('.logbook-home-screen-v988, .logbook-ui-v110').first().waitFor();",
 "await page.reload();const phoneDay=page.locator('.phone-day-v435');const reopenDeadline=Date.now()+30000;while(!(await phoneDay.isVisible())&&Date.now()<reopenDeadline){const wizard=page.getByRole('main',{name:'DOT inspection preparation'});if(await wizard.isVisible()){await page.getByRole('button',{name:'Back',exact:true}).click();await wizard.waitFor({state:'hidden'});}else if(await page.getByRole('button',{name:'Open logbook',exact:true}).isVisible()){await page.getByRole('button',{name:'Open logbook',exact:true}).click();}else if(await page.getByRole('button',{name:'Open today',exact:true}).isVisible()){await page.getByRole('button',{name:'Open today',exact:true}).click();}await page.waitForTimeout(100);}await phoneDay.waitFor();");

// Keep this historical editor fixture independent of wall-clock/current-day
// initialization. Seed the intentional current empty day before taking the
// baseline; the existing full eventsByDay equality after Cancel stays exact.
patch('scripts/browser-modern-editor-v11027.mjs',
 "await setup(page,context);const before=await stored(page);",
 "await page.clock.setFixedTime(new Date('2026-07-11T16:00:00Z'));fixture.eventsByDay['2026-07-11']=[];await setup(page,context);const before=await stored(page);");

// Historical duty replay audits its three original installation stages in a
// disposable copy. Invert only our byte-exact clock setup there, not in the
// shipped browser test; unknown edits still reach the strict historical checks.
patch('scripts/v110378/test-review-regressions.mjs',
 "import {spawnSync} from 'node:child_process';",
 "import {spawnSync} from 'node:child_process';\nimport {createHash} from 'node:crypto';");
patch('scripts/v110378/test-review-regressions.mjs',
 "  return dir;\n}",
 `  const editor=path.join(dir,'scripts/browser-modern-editor-v11027.mjs');
  const adapted=fs.readFileSync(editor,'utf8');
  const hash=text=>createHash('sha256').update(text).digest('hex');
  if(hash(adapted)==='8eac9767ddd110da66d9a715c328ead1a18fa2ea3dca3c4112444443383e8b33'){
    const historical=adapted.replace("await page.clock.setFixedTime(new Date('2026-07-11T16:00:00Z'));fixture.eventsByDay['2026-07-11']=[];await setup(page,context);const before=await stored(page);","await setup(page,context);const before=await stored(page);");
    assert.equal(hash(historical),'de3b88d0929b034f97971129462a179e74d167bc2f26fc750cc94688ece963f0','Exact historical editor fixture after clock inversion');
    fs.writeFileSync(editor,historical);
  }
  return dir;
}`);

// Save confirmation now describes the agreed load-folder and Files destinations.
// Keep the original-link, PDF page-count and exact capture-byte checks unchanged.
patch('scripts/browser-scanner-workflow-v110328.mjs',
 "assert.match(await savedLocation.innerText(),/Documents \u2192 Browse all saved files/);",
 "assert.match(await savedLocation.innerText(),/Find this file in Loads \u2192 its load folder, or Documents \u2192 Files if it has no load link\\./);");

// Persist the selected recorded day before reload. The prior immediate reload
// could restore the delivery day before the final Back-day navigation was saved.
patch('scripts/browser-shipment-carryover-v110367.mjs',
 "await page.reload();await openLog(page);await section(page,'Log').click();\n   assert.match(await eventRow(page,'driving').locator('.event-route-meta').innerText(),/BOL 123.*Trailer UNIT-A/);",
 "await waitState(page,s=>s.activeDay===middleDay);await page.reload();await openLog(page);await section(page,'Log').click();\n   assert.match(await eventRow(page,'driving').locator('.event-route-meta').innerText(),/BOL 123.*Trailer UNIT-A/);");

// Inventory mounts asynchronously above Export Everything. Wait for the exact
// seeded inventory before clicking; keep cancellation and all binary checks.
patch("scripts/v110431/browser-large.mjs",
 "await page.getByRole('button',{name:/Export & Backup/}).click();await page.getByRole('button',{name:'Export Everything',exact:true}).click();",
 "await page.getByRole('button',{name:/Export & Backup/}).click();await page.locator('.backup-mini-grid div').filter({hasText:'saved files'}).getByText('194',{exact:true}).waitFor();await page.getByRole('button',{name:'Export Everything',exact:true}).click();");

// Synthetic canvas drawing must not compete with production analysis on CI.
// Cache only identical raster states, including the legacy mutable line width.
// Every newly cached state verifies all RGBA bytes against its original render.
patch("scripts/browser-scanner-capture-v110329.mjs",
 "window.__scanPage=1;function draw(show=window.__paperVisible!==false){",
 "window.__scanPage=1;function renderFrame(show=window.__paperVisible!==false){");
patch("scripts/browser-scanner-capture-v110329.mjs",
 "      draw();window.__scannerDraw=draw;window.__scannerCanvas=c;",
 "      const cachedFrame=document.createElement('canvas');cachedFrame.width=c.width;cachedFrame.height=c.height;\n      const cachedContext=cachedFrame.getContext('2d');let cachedKey=null;\n      const cacheStats=window.__cameraRasterCache={checks:[],renders:0,renderMs:0,blits:0,blitMs:0};\n      function draw(show=window.__paperVisible!==false){\n        // The legacy renderer changes lineWidth on page two. Preserve both the\n        // first transient frame and the subsequent stable frame exactly.\n        const key=JSON.stringify([window.__scanPage,show,window.__paperShiftX||0,window.__paperShiftY||0,ctx.lineWidth]);\n        let expected=null;\n        if(key!==cachedKey){\n          const started=performance.now();renderFrame(show);cacheStats.renderMs+=performance.now()-started;cacheStats.renders++;\n          expected=ctx.getImageData(0,0,c.width,c.height).data;\n          cachedContext.drawImage(c,0,0);cachedKey=key;\n        }\n        const started=performance.now();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(cachedFrame,0,0);cacheStats.blitMs+=performance.now()-started;cacheStats.blits++;\n        if(expected){\n          const actual=ctx.getImageData(0,0,c.width,c.height).data;\n          if(actual.length!==expected.length||actual.some((value,index)=>value!==expected[index]))throw new Error('Cached synthetic camera frame changed pixels: '+key);\n          cacheStats.checks.push({key,bytes:actual.length});\n        }\n      }\n      draw();window.__scannerDraw=draw;window.__scannerCanvas=c;");
patch("scripts/browser-scanner-capture-v110329.mjs",
 "assert.equal(await page.evaluate(()=>window.__cameraCalls),1,'same camera stream remains open');",
 "assert.equal(await page.evaluate(()=>window.__cameraCalls),1,'same camera stream remains open');const rasterCache=await page.evaluate(()=>window.__cameraRasterCache);assert.ok(rasterCache.checks.length>=4&&rasterCache.checks.every(check=>check.bytes===1600*2200*4),'each page, shift and visibility cache rebuild preserves all original RGBA bytes');assert.ok(rasterCache.blits>rasterCache.renders,'repeated synthetic frames reuse the exact cached raster');console.log(name+' synthetic raster cache: '+JSON.stringify(rasterCache));");

// Capture failure diagnostics only. Keep live auto-capture, its fixture and all
// timing/data assertions unchanged. Record analysis sampling cadence so slow CI
// can be distinguished from detector, readiness or page-transition failures.
patch('scripts/browser-scanner-capture-v110329.mjs',
 "window.__capturePreviews=[];",
 `window.__capturePreviews=[];
      window.__captureAnalysisReads=[];
      const nativeRead=CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData=function(...args){
        const result=nativeRead.apply(this,args);
        if(this.canvas.width===465&&this.canvas.height===640){
          const reads=window.__captureAnalysisReads;
          reads.push({at:performance.now(),guidance:document.querySelector('[data-smart-camera] [role=status]')?.textContent||'',hidden:document.hidden});
          if(reads.length>120)reads.shift();
        }
        return result;
      };`);
patch('scripts/browser-scanner-capture-v110329.mjs',
 "}catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});throw error;}",
 `}catch(error){
    const diagnostics=await page.evaluate(()=>{
      const video=document.querySelector('[data-smart-camera] video');
      return {rasterCache:window.__cameraRasterCache,analysisReads:window.__captureAnalysisReads,postedPhotos:window.__postedPhotos,photoJobs:window.__photoJobs,changedWhileProcessing:window.__changedWhileProcessing,cameraCalls:window.__cameraCalls,hidden:document.hidden,video:video?{width:video.videoWidth,height:video.videoHeight,readyState:video.readyState,paused:video.paused,currentTime:video.currentTime}:null,body:document.body.innerText,fixturePng:window.__scannerCanvas?.toDataURL('image/png')};
    }).catch(cause=>({diagnosticError:cause.message}));
    if(diagnostics.fixturePng){fs.writeFileSync(\`\${output}/\${name}-FAILED-fixture.png\`,Buffer.from(diagnostics.fixturePng.split(',')[1],'base64'));delete diagnostics.fixturePng;}
    fs.writeFileSync(\`\${output}/\${name}-FAILED.json\`,JSON.stringify({error:error.message,errors,diagnostics},null,2));
    console.log('Capture failure diagnostics: '+JSON.stringify(diagnostics));
    await page.screenshot({path:\`\${output}/\${name}-FAILED.png\`}).catch(()=>{});throw error;
  }`);

// Reinsert archive entry last: guarded patches above normalize our helper calls.
for(const file of files){
 let source=read(file);
 const entry=/(await (?:page|workspace|target)\.getByRole\('navigation',\{name:'Records views'\}\)\.getByRole\('button',\{name:'Loads',exact:true\}\)\.click\(\);)(?!await openLegacyLoadArchive\((?:page|target)\);)/g;
 assert.ok(source.includes("name:'Records views'"),'Missing archive navigation: '+file);
 source=source.replace(entry,(_,navigation)=>navigation+'await openLegacyLoadArchive('+ (navigation.startsWith('await target.')?'target':'page') +');');
 const filesEntry=['scripts/import-display/browser.mjs','scripts/workspace-navigation/browser-navigation.mjs','scripts/v110453/browser-workspace.mjs'].includes(file);
 let helper=path.relative(path.dirname(file),'scripts/test-support/legacy-load-archive.mjs');
 if(!helper.startsWith('.'))helper='./'+helper;
 const imported=`import {openLegacyLoadArchive${filesEntry?',openRecordsFiles':''}} from '${helper}';\n`;
 if(!source.includes(imported))source=imported+source;
 fs.writeFileSync(file,source);
}
console.log('PASS — final smart-folder browser navigation adapter (legacy safety assertions preserved)');
