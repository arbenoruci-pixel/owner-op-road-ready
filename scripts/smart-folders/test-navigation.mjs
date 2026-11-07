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
for(const file of files){
 let source=read(file);
 const entry=/(await (?:page|workspace)\.getByRole\('navigation',\{name:'Records views'\}\)\.getByRole\('button',\{name:'Loads',exact:true\}\)\.click\(\);)(?!await openLegacyLoadArchive\(page\);)/g;
 assert.ok(source.includes("name:'Records views'"),'Missing archive navigation: '+file);
 source=source.replace(entry,'$1await openLegacyLoadArchive(page);');
 const filesEntry=['scripts/import-display/browser.mjs','scripts/workspace-navigation/browser-navigation.mjs','scripts/v110453/browser-workspace.mjs'].includes(file);
 let helper=path.relative(path.dirname(file),'scripts/test-support/legacy-load-archive.mjs');
 if(!helper.startsWith('.'))helper='./'+helper;
 const imported=`import {openLegacyLoadArchive${filesEntry?',openRecordsFiles':''}} from '${helper}';\n`;
 if(!source.includes(imported))source=imported+source;
 fs.writeFileSync(file,source);
}
console.log('PASS — final smart-folder browser navigation adapter (legacy safety assertions preserved)');
