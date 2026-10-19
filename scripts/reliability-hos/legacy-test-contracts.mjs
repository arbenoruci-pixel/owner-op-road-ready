import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Final materialization adapter for legacy CI tests. Application sources,
// historical templates, workflow permissions and reviewed locks are untouched.
const sha256 = value => createHash('sha256').update(value).digest('hex');
const SAVE = "await root.getByRole('button',{name:'Save changes',exact:true}).click();";

function once(text, before, after) {
  const parts = text.split(before);
  assert.equal(parts.length, 2, 'Legacy HOS test anchor must occur exactly once: '+before.slice(0,100));
  return parts[0]+after+parts[1];
}

function replaceSaves(text, baselines) {
  const parts = text.split(SAVE);
  assert.equal(parts.length-1, baselines.length, 'Legacy historical Save count changed');
  return parts.reduce((out, part, index) => out+(index ? 'await approveHistoricalHosEdit(page,root,day,'+baselines[index-1]+');'+SAVE : '')+part, '');
}

const browserApprovalContract = `
// reliability-hos-legacy-tests-v1: approval is part of the visible historical flow.
function hosStoredEvidence(state) {
 const fields=['eventsByDay','signatureByDay','logbookEditHistoryByDay','routeLegsByDay','loadGuidesById','manualMilesByDay','certifyStatus'];
 return Object.fromEntries(fields.map(key=>[key,state?.[key]]));
}
async function assertHosReviewUnchanged(page,root,reviewDay,before) {
 const review=root.locator('.hos-edit-preview');await review.waitFor({state:'visible'});
 assert.equal(await review.getAttribute('aria-label'),'Review changes to '+reviewDay,'preview identifies the exact edited day');
 assert.ok(await review.locator('.hos-event-diff tbody tr').count()>0,'preview lists the actual event changes');
 assert.deepEqual(hosStoredEvidence(await stored(page)),hosStoredEvidence(before),'draft and approval leave recorded evidence unchanged until Save');
}
async function approveHistoricalHosEdit(page,root,reviewDay,before) {
 const save=root.locator('.save-main'),approval=root.locator('.hos-history-approval input');
 assert.equal(await approval.count(),1,'historical edits require a visible approval control');
 assert.equal(await approval.isChecked(),false,'approval does not carry across drafts');
 assert.equal(await save.isDisabled(),true,'historical Save remains disabled before approval');
 await assertHosReviewUnchanged(page,root,reviewDay,before);
 await approval.scrollIntoViewIfNeeded();await approval.check();
 assert.equal(await approval.isChecked(),true,'the user explicitly approves this historical draft');
 assert.equal(await save.isDisabled(),false,'valid historical Save becomes available after approval');
 assert.deepEqual(hosStoredEvidence(await stored(page)),hosStoredEvidence(before),'approval itself cannot save or alter history');
}
`;

function dutyAssertions(text) {
  const original = text.split('\n').find(line => line.startsWith("test('destination edits keep shipping load and BOL distinct',"));
  assert.ok(original, 'Legacy reference-separation assertion is missing');
  return once(text, original, `test('destination edits keep shipping load and BOL distinct',()=>{
 const s=read('source/src/modules/editor/EditEventSheet.jsx');
 const a=s.indexOf('  function buildDraftHosPatch()'),b=s.indexOf('\\n  // MOTIVE_PREVIEW_V11023:',a);
 assert.ok(a>=0&&b>a,'the editor owns one shared draft patch builder');
 assert.equal((s.match(/function buildDraftHosPatch\\(/g)||[]).length,1);
 const block=s.slice(a,b);
 assert.doesNotMatch(block,/patch\\.bol\\s*=\\s*shippingDocs/);
 assert.doesNotMatch(block,/patch\\.loadNo\\s*=\\s*shippingDocs/);
 assert.match(block,/put\\('loadNo',loadNo,initialForm.loadNo\\)/);
 assert.match(block,/put\\('bol',bol,initialForm.bol\\)/);
 assert.match(block,/if \\(shippingDocs !== initialForm.shippingDocs\\)/);
 assert.match(block,/if \\(destination !== initialForm.destination\\)/);
 const saveStart=s.indexOf('  function save()'),saveEnd=s.indexOf('\\n  function changeLiveStatus',saveStart);
 assert.ok(saveStart>=0&&saveEnd>saveStart,'the actual Save handler is present');
 assert.match(s.slice(saveStart,saveEnd),/const patch\\s*=\\s*buildDraftHosPatch\\(\\)/,'Save uses the reviewed patch builder');
 assert.match(s,/const previewPatchV11023\\s*=\\s*buildDraftHosPatch\\(\\)/,'preview uses the same patch builder');
});`);
}

function dutyBrowser(text) {
  text=once(text,'async function edit(page,id){',browserApprovalContract+'\nasync function edit(page,id){');
  const notes="  await edit(page,'drop');await root.getByLabel('Notes',{exact:true}).fill('First note');\n  await root.getByLabel('Notes',{exact:true}).fill('Updated gate note');";
  text=once(text,notes,`  await edit(page,'drop');await root.getByLabel('Notes',{exact:true}).fill('First note');
  await approveHistoricalHosEdit(page,root,day,before);
  await root.getByLabel('Notes',{exact:true}).fill('Updated gate note');
  assert.equal(await root.locator('.hos-history-approval input').isChecked(),false,'changing the reviewed draft invalidates its approval');
  assert.equal(await root.locator('.save-main').isDisabled(),true,'a changed historical draft requires approval again');
  await assertHosReviewUnchanged(page,root,day,before);`);
  return replaceSaves(text,['before','saved','deselected','cleared','baseline','reopened']);
}

function intervalBrowser(text) {
  text=once(text,'async function edit(page,id){',browserApprovalContract+'\nasync function edit(page,id){');
  return replaceSaves(text,['before']);
}

function carryBrowser(text) {
  text=once(text,'function fixture(scenario) {',browserApprovalContract+'\nfunction fixture(scenario) {');
  return once(text,"   assert.equal(await page.locator('.save-main').isDisabled(),false);",`   const editor=page.locator('.editor-ui-v110');
   if(scenario==='current-prefix'){
    assert.equal(await editor.locator('.hos-history-approval input').count(),0,'a current-day edit does not require historical approval');
    await assertHosReviewUnchanged(page,editor,activeDay,before);
   }else await approveHistoricalHosEdit(page,editor,activeDay,before);
   assert.equal(await page.locator('.save-main').isDisabled(),false);`);
}

function modernEditorBrowser(text) {
  text=once(text,'async function revealEdit(page){',browserApprovalContract+'\nasync function revealEdit(page){');
  return once(text,"await page.locator('.save-main').click();", "await approveHistoricalHosEdit(page,page.locator('.editor-modern-v11027'),day,before);await page.locator('.save-main').click();");
}

function logbookEditorBrowser(text) {
  text=once(text,"const origin='http://127.0.0.1:3000',at=", "const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000',at=");
  text=once(text,'async function openLog(page){',browserApprovalContract+'\nasync function openLog(page){');
  const historical="await openSelectedEditV11027(page,'short');await page.getByLabel('End time',{exact:true}).fill('15:17');await page.locator('.save-main').click();";
  text=once(text,historical,"await openSelectedEditV11027(page,'short');await page.getByLabel('End time',{exact:true}).fill('15:17');await approveHistoricalHosEdit(page,page.locator('.editor-ui-v110'),day,before);await page.locator('.save-main').click();");
  const currentNote="await page.getByLabel('Notes',{exact:true}).fill('Live note proof');await page.locator('.save-main').click();";
  text=once(text,currentNote,"await page.getByLabel('Notes',{exact:true}).fill('Live note proof');assert.equal(await page.locator('.hos-history-approval input').count(),0,'a same-day live note edit needs no historical approval');await assertHosReviewUnchanged(page,page.locator('.editor-ui-v110'),live.activeDay,liveBefore);await page.locator('.save-main').click();");
  const liveStatus="await page.locator('.editor-duty-grid').getByRole('button',{name:'ON',exact:true}).click();await page.locator('.save-main').click();";
  return once(text,liveStatus,"await page.locator('.editor-duty-grid').getByRole('button',{name:'ON',exact:true}).click();assert.equal(await page.locator('.hos-history-approval input').count(),0,'a same-day status handoff needs no historical approval');await page.locator('.save-main').click();");
}

function overrideBrowser(text) {
  text=once(text,'async function openTarget(page){',browserApprovalContract+'\nasync function openTarget(page){');
  const rangeSave="await page.locator('.save-main').click();const saved=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='target').endMin===750);";
  text=once(text,rangeSave,"await approveHistoricalHosEdit(page,page.locator('.editor-compact-v111'),day,original);"+rangeSave);
  const metadataSave="await quick(page,'Delivery');await quick(page,'Fuel');await page.locator('.save-main').click();";
  text=once(text,metadataSave,"await quick(page,'Delivery');await quick(page,'Fuel');await approveHistoricalHosEdit(page,page.locator('.editor-compact-v111'),day,saved);await page.locator('.save-main').click();");
  const insertSave="await page.locator('.save-main').click();const saved=await waitState(page,s=>s.eventsByDay[day].some(e=>e.startMin===900&&e.endMin===930));";
  text=once(text,insertSave,"await approveHistoricalHosEdit(page,page.locator('.editor-compact-v111'),day,original);"+insertSave);
  for(const end of ['12:15','12:20']){
    const enabled="await page.getByLabel('End time',{exact:true}).fill('"+end+"');assert.equal(await page.locator('.save-main').isDisabled(),false);";
    text=once(text,enabled,"await page.getByLabel('End time',{exact:true}).fill('"+end+"');await approveHistoricalHosEdit(page,page.locator('.editor-compact-v111'),day,original);assert.equal(await page.locator('.save-main').isDisabled(),false);");
  }
  return text;
}

export const legacyHosTestContracts = [
  {file:'scripts/v110378/test-duty-forms.mjs',before:'b3db2f7c399e57dd303fca76f42cd9921cb07863d8a8b7c3c79f4c6ed51b20b8',after:'e1eb66ec2b0314c781ab1dc7c2a59e36f14318d3dea94263b8bcfe8a3ecaa637',transform:dutyAssertions},
  {file:'scripts/v110378/browser-duty-forms.mjs',before:'3ff49e9d8af8747bf5085c638ee325168579309cbaeb4784d1c4961cc652d9f1',after:'948a178e78a4b2c9eeccfdb4c68381daecdd31444db5ca4a73d286944f9ef076',transform:dutyBrowser},
  {file:'scripts/v110380/browser-on-duty-intervals.mjs',before:'f40cd4bfc4503a2d3f0773ea6220dccc73bae30418d8780847bbe74506645d2a',after:'07691cdb84c363fcd3407a5f8165065f196eb2d59b33c1b4e3fb528f943d4777',transform:intervalBrowser},
  {file:'scripts/browser-carry-edit-v110365.mjs',before:'c65a351a8ef234a01ee99b376c1a744b840bbd8fdc0962a36112df5724e5d700',after:'85fc09c9662fc8f797f1ca7fc4ec68c4aa347401605e312c02fdc271b22c84ee',transform:carryBrowser},
  {file:'scripts/browser-modern-editor-v11027.mjs',before:'de3b88d0929b034f97971129462a179e74d167bc2f26fc750cc94688ece963f0',after:'7f37d5e18a36023bf3f00a49232d8073d8c7b493d03472e7094c8a0581f8c65d',transform:modernEditorBrowser},
  {file:'scripts/browser-logbook-editor-v110.mjs',before:'bcd1863e8ce3d929695f4bd0c3951c8f69d720185a29db48541a6323fbe167f6',after:'eda11aab381dea12ade8a9446ca30ca638f5b5f2771925ab4fab5eff20b63a1e',transform:logbookEditorBrowser},
  {file:'scripts/browser-motive-override-v11023.mjs',before:'33c3c8677dc36ff567fd1bc4331eafa274d98d52c0e12924d4ed1491c7c016c6',after:'87764c72fe7e128b529243cc5d6b5d951d87cb816b3184aa46e00fdfb8f08b07',transform:overrideBrowser},
];

export function installLegacyHosTestContracts(root=process.cwd()) {
  root=path.resolve(root);
  // Verify every input and output before writing any test file.
  const prepared=legacyHosTestContracts.map(spec=>{
    const target=path.join(root,spec.file),source=fs.readFileSync(target,'utf8'),current=sha256(source);
    if(current===spec.after)return {...spec,target,changed:false};
    assert.equal(current,spec.before,'Unknown legacy HOS test source: '+spec.file);
    const output=spec.transform(source);
    assert.equal(sha256(output),spec.after,'Unexpected legacy HOS test transformation: '+spec.file);
    return {...spec,target,output,changed:true};
  });
  for(const item of prepared)if(item.changed)fs.writeFileSync(item.target,item.output);
  return prepared.map(({file,before,after,changed})=>({file,before,after,changed}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({legacyHosTestContracts:installLegacyHosTestContracts(process.argv[2]||process.cwd())},null,2));
}
