import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export function installSmartImport(root = process.cwd()) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
  const patch = (file, before, after) => {
    const source = read(file);
    if (source.includes(after)) return;
    assert.equal(source.split(before).length, 2, 'Smart Import anchor changed: ' + file + ' / ' + before.slice(0, 90));
    write(file, source.replace(before, () => after));
  };
  const replaceFunction = (file, first, next, replacement) => {
    const source = read(file), start = source.indexOf(first), end = source.indexOf(next, start);
    assert.ok(start >= 0 && end > start, 'Smart Import function boundary changed: ' + first);
    write(file, source.slice(0, start) + replacement + '\n\n' + source.slice(end));
  };
  const base = 'source/src/modules/smart-import/';
  fs.mkdirSync(path.join(root, base), {recursive: true});
  for (const file of ['core.js', 'storage.js', 'month.js', 'SmartImportPanel.jsx', 'MonthlyRecords.jsx', 'QuarterlyMileage.jsx', 'smartImport.css']) fs.copyFileSync(path.join(root, 'scripts/smart-import', file), path.join(root, base, file));
  fs.copyFileSync(path.join(root, 'scripts/smart-import/fuelStatement.js'), path.join(root, 'source/src/modules/document-readers/fuel-receipt/fuelStatementV1103.js'));
  fs.copyFileSync(path.join(root, 'scripts/smart-import/ImportDocumentsScreen.jsx'), path.join(root, 'source/src/modules/home/ImportDocumentsScreenV110435.jsx'));

  const scanner = 'source/src/modules/scan/SmartScanSheetV105.jsx';
  patch(scanner, "import { parseFuelStatement, fuelStatementFields, upsertFuelTransactions }", "import {readOwnerOpsStoreV102} from '../owneros/ownerOpsStoreV102.js';\nimport { parseFuelStatement, fuelStatementFields, upsertFuelTransactions }");
  patch(scanner, 'return upsertFuelTransactions(store,record,fields);', 'return upsertFuelTransactions(store,record,fields,readOwnerOpsStoreV102());');
  patch(scanner, "parseFuelStatement(/\\.csv$/i.test(file.name||'')?await file.text():analysis?.text||'')", "parseFuelStatement(/\\.csv$/i.test(file.name||'')?await file.text():analysis?.text||'',file.name||'',{workspaceId:window.localStorage.getItem('owner-op-account-data-owner-v1')||''})");

  const ops = 'source/src/modules/owneros/ownerOpsStoreV102.js';
  if (!read(ops).includes('SMART_IMPORT_RULES_V1')) {
    write(ops, "// SMART_IMPORT_RULES_V1\nimport {importDate, jurisdiction, parseStatementCsv, previewStatement, iftaStatementSummary, canonicalTolls} from '../smart-import/core.js';\n" + read(ops));
    replaceFunction(ops, 'function normalizeDate(', 'function stateCode(', "function normalizeDate(value = '') { return importDate(value); }");
    replaceFunction(ops, 'function stateCode(', 'function normalizeRecord(', "function stateCode(value = '') { return jurisdiction(value); }");
    for (const [name, kind, next] of [['importMileageCsvV102', 'mileage', 'export function importTollCsvV102'], ['importTollCsvV102', 'tolls', 'export function importFuelCsvV102'], ['importFuelCsvV102', 'fuel', 'export function quarterKeyV102']]) {
      replaceFunction(ops, 'export function ' + name + '(', next, `export function ${name}(source = '', fileName = '', options = {}) {\n  const parsed = parseStatementCsv(source, fileName, {...options, kind:'${kind}'});\n  if(!parsed.valid)throw Error(parsed.issues.map(issue=>'Row '+issue.row+': '+issue.message).join(' '));\n  return parsed.rows;\n}`);
    }
    replaceFunction(ops, 'export function iftaSummaryV102(', 'function documentType(', "export function iftaSummaryV102(ownerStore = {}, businessStore = {}, quarter = quarterKeyV102()) {\n  return iftaStatementSummary(ownerStore, businessStore, quarter);\n}");
    patch(ops, "  const normalized = list(rows).map(row => normalizeRecord(row, bucket));", `  if(['mileageImports','tolls','fuelImports'].includes(bucket)){\n    const kind={mileageImports:'mileage',tolls:'tolls',fuelImports:'fuel'}[bucket];\n    if(rows.some(row=>!importDate(row.date)))throw Error('A statement row needs a valid source date.');\n    const preview=previewStatement({kind,rows,issues:[],valid:true},current[bucket]);\n    if(!preview.canSave)throw Error('Conflicting statement transactions need review.');\n    if(!preview.added.length)return current;\n    return writeOwnerOpsStoreV102({...current,[bucket]:[...preview.added.map(row=>normalizeRecord(row,bucket)),...current[bucket]],connections:connectionPatch?{...current.connections,...connectionPatch}:current.connections});\n  }\n  const normalized = list(rows).map(row => normalizeRecord(row, bucket));`);
    patch(ops, "const unlinkedTolls = normalizeOwnerOpsStoreV102(ownerStore).tolls.filter(row => !row.loadNo).length;", "const unlinkedTolls = canonicalTolls(ownerStore,businessStore).rows.filter(row => !row.loadNo).length;");
  }

  const screen = 'source/src/modules/owneros/OwnerOperatorOSV102.jsx';
  write(screen, read(screen).replaceAll('key={statementFileV110479.file.name}', 'key={statementFileV110479.file?.name||statementFileV110479.kind}'));
  patch(screen, "import React,", "import SmartImportPanel from '../smart-import/SmartImportPanel.jsx';\nimport {canonicalTolls} from '../smart-import/core.js';\nimport React,");
  patch(screen, "  const [notice, setNotice] = useState('');", "  const [notice, setNotice] = useState('');\n  const [statementFileV110479,setStatementFileV110479]=useState(null);\n  const canonicalTollRows=useMemo(()=>canonicalTolls(ownerStore,businessStore).rows,[ownerStore,businessStore]);");
  if (read(screen).includes('  async function importFile(')) replaceFunction(screen, '  async function importFile(', '  function saveInvoiceRecord(', '  function importFile(kind,file) { if(file)setStatementFileV110479({kind,file}); }');
  patch(screen, '<main className="owner-os-body-v102">', '<main className="owner-os-body-v102">\n        {statementFileV110479?<SmartImportPanel key={statementFileV110479.file?.name||statementFileV110479.kind} state={state} initialFile={statementFileV110479} onDone={()=>{setStatementFileV110479(null);refreshDocuments();}} onScan={onScan}/>:null}');
  patch(screen, "  if(tab==='documents')return <EvidenceWorkspace", "  if(tab==='documents'&&statementFileV110479)return <section><button type=\"button\" onClick={()=>setStatementFileV110479(null)}>‹ Documents</button><SmartImportPanel state={state} initialFile={statementFileV110479} onDone={()=>{setStatementFileV110479(null);refreshDocuments();}} onScan={onScan}/></section>;\n  if(tab==='documents')return <EvidenceWorkspace");
  patch(screen, "{tab==='ifta' && <>", "{tab==='ifta' && <>\n          {ifta.needsReview?<p role=\"alert\">Review {ifta.conflicts.length} conflicting transaction groups, {ifta.invalidRows.length} invalid dates and {ifta.unknownTaxableRows} rows without separate taxable mileage. Conflicting versions remain outside totals.</p>:null}\n          {ifta.duplicateCount?<p>{ifta.duplicateCount} duplicate transaction rows counted once.</p>:null}");
  const exportGuard = "\n    if(ifta.needsReview){setNotice('Review conflicting transactions, invalid source rows and taxable mileage before exporting IFTA.');return;}";
  patch(screen, '  function exportIftaCsv() {', '  function exportIftaCsv() {' + exportGuard);
  patch(screen, '  async function exportIftaPdf() {', '  async function exportIftaPdf() {' + exportGuard);
  write(screen, read(screen).replaceAll('ownerStore.tolls', 'canonicalTollRows').replaceAll('onImportMileage={()=>mileageRef.current?.click()}', "onImportMileage={()=>setStatementFileV110479({kind:'mileage',file:null})}").replace('Imports are matched using load number, active load, date, location, truck/unit and transaction identity.', 'Imports retain source load references and use provider/account transaction identity. Review dates, duplicates and conflicts before saving.'));

  const home = 'source/src/modules/home/HomeScreen.jsx';
  patch(home, 'import ImportDocumentsScreen from', "import MonthlyRecords from '../smart-import/MonthlyRecords.jsx';\nimport ImportDocumentsScreen from");
  patch(home, "  if(businessSection==='import_documents')return <ImportDocumentsScreen onBack={()=>setBusinessSection('')} onBackup={onOpenBackup}/>;", `  if(businessSection==='my_month')return <MonthlyRecords state={state} onBack={()=>setBusinessSection('')} onImport={()=>setBusinessSection('import_documents')} onDocuments={()=>setBusinessSection('documents')} onLog={()=>onOpenDay?.(today)} onWallet={onOpenWallet}/>;\n  if(businessSection==='import_documents')return <ImportDocumentsScreen state={state} onBack={()=>setBusinessSection('')} onBackup={onOpenBackup} onMonth={()=>setBusinessSection('my_month')} onScan={type=>{setBusinessSection('');setScanPreferredType(type||'auto');setScanOpen(true);}}/>;`);
  const tools = 'source/src/modules/home/PhoneHomeToolsV110435.jsx';
  patch(tools, "    ['import','Import',()=>onSection('import_documents')],", "    ['documents','My month',()=>onSection('my_month')],\n    ['import','Import',()=>onSection('import_documents')],");
  const build = 'scripts/build-v110.mjs', hook = "steps.push('smart-import/install.mjs','smart-import/core.test.mjs','smart-import/storage.test.mjs','smart-import/runtime.test.mjs');";
  if (!read(build).includes(hook)) patch(build, 'const runAnchor=', hook + '\nconst runAnchor=');
  if (!read(build).includes("const finalRouteCheck='v110374/test-route-day-scope.mjs';")) patch(build, hook, "// Run the existing route assertions on the completed freight projection.\nconst finalRouteCheck='v110374/test-route-day-scope.mjs';\nif(steps.filter(script=>script===finalRouteCheck).length!==4)throw Error('Expected the four legacy route-day checkpoints');\nfor(let index=steps.length-1;index>=0;index--)if(steps[index]===finalRouteCheck)steps.splice(index,1);\nsteps.push(finalRouteCheck);\n" + hook);
  // Keep the legacy package-picker checks through the recovery disclosure and
  // also require the new primary statement-import entry point to be visible.
  const phoneTest='scripts/v110435/browser-phone-home.mjs';
  patch(phoneTest,"assert.equal(await page.getByRole('navigation',{name:'Apps'}).getByRole('button').count(),10);", "assert.equal(await page.getByRole('navigation',{name:'Apps'}).getByRole('button').count(),11);assert.equal(await page.getByRole('navigation',{name:'Apps'}).getByRole('button',{name:'My month',exact:true}).count(),1);");
  patch(phoneTest,"await page.getByRole('button',{name:'Import',exact:true}).click();await page.getByRole('button',{name:'Choose import ZIP',exact:true}).waitFor();", "await page.getByRole('button',{name:'Import',exact:true}).click();await page.getByRole('heading',{name:'Smart Import',exact:true}).waitFor();await page.getByText('Road Ready packages & recovery',{exact:true}).click();await page.getByRole('button',{name:'Choose import ZIP',exact:true}).waitFor();");
  write(phoneTest,read(phoneTest).replace('/active logs/','/active logbook/'));
  console.log('PASS — Smart Import, canonical fuel/tolls and read-only monthly records installed');
}

export function releaseSmartImport(root = process.cwd()) {
  const VERSION = '110.4.81', read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'})).trim();
  assert.match(sha, /^[a-f0-9]{40}$/i);
  const BUILD = 'v110481-quiet-sync-' + sha.slice(0, 12);
  const previous = JSON.parse(read('release-version.json'));
  assert.ok(['110.4.77', '110.4.79', '110.4.80', VERSION].includes(previous.version), 'Smart Import requires the current reviewed main runtime');
  for (const file of ['release-version.json', 'public/app-version.json']) {
    const value = JSON.parse(read(file));
    Object.assign(value, {version: VERSION, build: BUILD, force: false, sourceCommit: sha, label: 'v110.4.81 Quiet synchronization', releasedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: ['Synchronization status opens from Settings and never covers the signing screen automatically.', 'Count canonical transactions once, preserve zero taxable mileage and require review for conflicts.', 'Organize monthly logs, fuel, loads, expenses and original ELD reports without changing duty events.']});
    fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
  }
  for (const file of ['package.json', 'package-lock.json']) {
    const value = JSON.parse(read(file)); value.version = VERSION;
    if (value.packages?.['']) value.packages[''].version = VERSION;
    fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
  }
  const lockFile = 'module-locks.v1.json', locks = JSON.parse(read(lockFile)); locks.release = VERSION;
  fs.writeFileSync(path.join(root, lockFile), JSON.stringify(locks, null, 2) + '\n');
  for (const file of ['source/src/core/update/appUpdate.js', 'public/sw.js', 'source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx', 'lib/owner-op-cloud/cloudMirrorV110450.js', 'lib/owner-op-cloud/recordSyncV110451.js', 'scripts/test-duty-graph-continuity.mjs', 'scripts/test-editor-grips-v110355.mjs', 'scripts/verify-log-integrity-v1051.mjs', 'scripts/test-document-continuity-integration-v110375.mjs']) fs.writeFileSync(path.join(root, file), read(file).replaceAll(previous.version, VERSION).replaceAll(previous.build, BUILD));
  return {version: VERSION, build: BUILD, sourceCommit: sha};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installSmartImport();
  console.log(releaseSmartImport());
}
