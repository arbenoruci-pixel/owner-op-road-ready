import fs from 'node:fs';
const VERSION='110.4.13',BUILD='v110413-document-evidence',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.13 Document evidence',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Find missing or unreviewed documents by load and period.','Review a source once for loads, IFTA, tax records and audit.','Recover original files and reviewed filing corrections without changing driving logs.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=fs.readFileSync(path,'utf8');for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.12'","'"+VERSION+"'").replaceAll("'v110412-load-week-transfer'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const name of ['evidenceCore','evidenceCatalog','evidenceStorage','recoveryCore','recoveryStorage'])fs.copyFileSync(`scripts/v110413/${name}.js`,`source/src/modules/owneros/${name}V110413.js`);
for(const name of ['EvidenceCenter','RecoveryPanel'])fs.copyFileSync(`scripts/v110413/${name}.jsx`,`source/src/modules/owneros/${name}V110413.jsx`);
fs.copyFileSync('scripts/v110413/evidence.css','source/src/modules/owneros/evidenceV110413.css');
function patch(path,before,after){const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;if(source.split(before).length!==2)throw new Error('Document evidence anchor changed: '+path+' / '+before.slice(0,80));fs.writeFileSync(path,source.replace(before,after));}
const folders='source/src/modules/owneros/LoadFoldersV10969.jsx';
patch(folders,"import TransferPanel", "import EvidenceCenter from './EvidenceCenterV110413.jsx';\nimport TransferPanel");
patch(folders,'    {notices}',"    {!library?<EvidenceCenter documents={allDocuments} businessStore={businessStore} ownerStore={ownerStore} loads={folders} folder={folder} week={week} onScan={onScan} onImportMileage={onImportMileage} onOpenLog={onOpenLog}/>:null}\n    {notices}");
patch(folders,'loading=false,onScan,onOpenLog,onContinueBilling','loading=false,ownerStore={},onImportMileage,onScan,onOpenLog,onContinueBilling');
// Keep archive aliases in business data so a recovery needs only one durable write.
const reconciliation='source/src/modules/owneros/loadFolderReconciliationV10974.js';
patch(reconciliation,"const aliases=new Map((overlay.loadCorrections||[]).filter(x=>x.aliasFrom&&x.loadNo).map(x=>[upper(x.aliasFrom),upper(x.loadNo)]));","const aliases=new Map([...(businessStore.evidenceAliases||[]).map(x=>[upper(x.from),upper(x.to)]),...(overlay.loadCorrections||[]).filter(x=>x.aliasFrom&&x.loadNo).map(x=>[upper(x.aliasFrom),upper(x.loadNo)])]);");
patch(reconciliation,"  aliases.set('178564','424590-1');","  aliases.set('178564','424590-1');\n  for(const [from,to] of aliases){let target=to;const seen=new Set([from]);while(aliases.has(target)&&!seen.has(target)){seen.add(target);target=aliases.get(target);}if(!seen.has(target))aliases.set(from,target);}");
const store='source/src/modules/business/businessStore.js';
patch(store,'    loads: list(value.loads).map(cleanRecord),','    evidenceAliases:list(value.evidenceAliases),\n    evidenceExpectations:list(value.evidenceExpectations),\n    evidenceRecoveryHistory:list(value.evidenceRecoveryHistory),\n    loads: list(value.loads).map(cleanRecord),');
patch(store,'  const out = {};','  const out = {};\n  if(value.evidenceFactsV1)out.evidenceFactsV1=value.evidenceFactsV1;');
// Trusted in-process hooks share the existing quota-safe transaction. JSON cannot supply hooks.
const transfer='source/src/modules/owneros/transferStorageV110412.js';
patch(transfer,'const {next, summary} = mergeRecords(current, checked.records);','const prepared = options.prepareBusiness ? options.prepareBusiness(current) : current;\n    const {next, summary} = mergeRecords(prepared, checked.records);');
patch(transfer,"        if (storage.getItem(BUSINESS_STORE_KEY) !== previous)","        if(options.finalizeDocuments)await options.finalizeDocuments({db,rows,next});\n        if (storage.getItem(BUSINESS_STORE_KEY) !== previous)");
patch(transfer,'  row.linkToLogbook = false;', '  row.linkToLogbook = false;\n  row.evidenceOnlyV110413 = true;');
patch(transfer,"originalPreserved:true, syncState:'local_only', linkToLogbook:false,", "originalPreserved:true, syncState:'local_only', linkToLogbook:false, evidenceOnlyV110413:true,");
// Archive imports and source reviews must never enter automatic live-guide restoration.
const savedGuides='source/src/modules/loads/savedLoadRecoveryV110312.js';
patch(savedGuides,' if(savedDocumentConflictV110326(record))return null;', ' if(record.evidenceOnlyV110413 || savedDocumentConflictV110326(record))return null;');
patch(savedGuides,' store=repairBusinessIdentityV110326(store);', ' store={...store,documents:(store.documents||[]).filter(d=>!d.evidenceOnlyV110413)};\n store=repairBusinessIdentityV110326(store);');
patch(savedGuides,"return (store.documents||[]).filter(d=>d&&['load_tender','rate_confirmation'].includes(d.type)","return (store.documents||[]).filter(d=>d&&!d.evidenceOnlyV110413&&['load_tender','rate_confirmation'].includes(d.type)");
const instructionGuides='source/src/modules/loads/instructionGuideV110311.js';
patch(instructionGuides,"if(!plan||record.type!=='load_tender'", "if(record.evidenceOnlyV110413||!plan||record.type!=='load_tender'");
patch(instructionGuides,"filter(d=>d.type==='load_tender'&&d.status==='verified'", "filter(d=>!d.evidenceOnlyV110413&&d.type==='load_tender'&&d.status==='verified'");
const owner='source/src/modules/owneros/OwnerOperatorOSV102.jsx';
patch(owner,"import InvoiceSendPanelV110320", "import EvidenceCenter from './EvidenceCenterV110413.jsx';\nimport InvoiceSendPanelV110320");
patch(owner,'loading={loadingDocs} onScan={onScan}', 'loading={loadingDocs} ownerStore={ownerStore} onImportMileage={()=>mileageRef.current?.click()} onScan={onScan}');
patch(owner,"        {tab==='ifta' && <>","        {tab==='ifta' && <>\n          <EvidenceCenter documents={documents} businessStore={businessStore} ownerStore={ownerStore} loads={loads} initialArea=\"ifta\" period={{from:quarter.slice(0,4)+'-'+String((Number(quarter.at(-1))-1)*3+1).padStart(2,'0')+'-01',to:new Date(Date.UTC(Number(quarter.slice(0,4)),Number(quarter.at(-1))*3,0,12)).toISOString().slice(0,10)}} onScan={onScan} onImportMileage={()=>mileageRef.current?.click()}/>");
patch(owner,"        {tab==='audit' && <DotAuditCenterV109714 state={state} loads={loads} documents={documents} businessStore={businessStore} ownerStore={ownerStore} onOpenLog={onOpenLog} />}","        {tab==='audit' && <><EvidenceCenter documents={documents} businessStore={businessStore} ownerStore={ownerStore} loads={loads} initialArea=\"audit\" onScan={onScan} onOpenLog={onOpenLog}/><DotAuditCenterV109714 state={state} loads={loads} documents={documents} businessStore={businessStore} ownerStore={ownerStore} onOpenLog={onOpenLog} /></>}");
patch(owner,"'Everything is caught up'","'Review source coverage'");
patch(owner,'Logs, documents, billing and IFTA are organized.','Compare the document checklist with dispatch and source statements.');
patch(owner,"['gallons','Tax-paid Gallons']","['gallons','Recorded propulsion gallons'],['verifiedGallons','Reviewed tax-paid gallons']");
patch(owner,"`Tax-paid gallons: ${ifta.gallons.toFixed(3)}`","`Recorded propulsion gallons: ${ifta.gallons.toFixed(3)}`,`Reviewed tax-paid gallons: ${ifta.verifiedGallons.toFixed(3)}`");
patch(owner,"row.status==='complete'?'Complete':row.status==='missing_fuel'?'Fuel missing':'Fuel only'","row.status==='recorded'?'Recorded':row.status==='mileage_only'?'Mileage only':'Fuel only'");
const ops='source/src/modules/owneros/ownerOpsStoreV102.js';
patch(ops,'gallons:0, fuelTotal:0, mileageRows:0','gallons:0, verifiedGallons:0, fuelTotal:0, mileageRows:0');
patch(ops,'  fuelRows.filter(withinQuarter).forEach(row => {',"  fuelRows.filter(withinQuarter).filter(row=>!/def|reefer/i.test(text(row.fuelType))).forEach(row => {");
patch(ops,'    target.gallons += number(row.gallons);','    target.gallons += number(row.gallons);\n    if(row.iftaEligible===true)target.verifiedGallons += number(row.gallons);');
patch(ops,"status:row.miles > 0 && row.gallons > 0 ? 'complete' : row.miles > 0 ? 'missing_fuel' : 'fuel_only'","status:row.miles > 0 && row.gallons > 0 ? 'recorded' : row.miles > 0 ? 'mileage_only' : 'fuel_only'");
patch(ops,"    missingFuelStates:rows.filter(row=>row.status==='missing_fuel').map(row=>row.state),","    verifiedGallons:rows.reduce((sum,row)=>sum+row.verifiedGallons,0),\n    missingFuelStates:[], // Fuel need not be purchased in each jurisdiction traveled.");
const tax='source/src/modules/business/MoneyTaxCenter.jsx';
patch(tax,"import React, { useMemo } from 'react';","import React, { useEffect, useMemo, useState } from 'react';\nimport EvidenceCenter from '../owneros/EvidenceCenterV110413.jsx';");
patch(tax,'  const store = useMemo(() => readBusinessStore(), []);',"  const [store,setStore]=useState(()=>readBusinessStore());\n  useEffect(()=>{const refresh=()=>setStore(readBusinessStore());window.addEventListener('owner-op-business-updated',refresh);return()=>window.removeEventListener('owner-op-business-updated',refresh);},[]);");
patch(tax,'      <main className="money-tax-body">','      <main className="money-tax-body">\n        <EvidenceCenter businessStore={store} initialArea="tax" onScan={onScan}/>');
const home='source/src/modules/home/HomeScreen.jsx';
patch(home,"  const [scanPreferredType, setScanPreferredType] = useState('auto');","  const [scanPreferredType, setScanPreferredType] = useState('auto');\n  const [scanEvidenceContext,setScanEvidenceContext]=useState(null);");
patch(home,'        initialPreferredType={scanPreferredType}','        initialPreferredType={scanPreferredType}\n        evidenceContextV110413={scanEvidenceContext}');
patch(home,"        onScan={() => setScanOpen(true)}","        onScan={context => {setScanPreferredType(context?.kind||'auto');setScanEvidenceContext(context?.kind?context:null);setScanOpen(true);}}");
patch(home,"onClose={() => { setScanOpen(false); setSavedScanFile(null); setResumeDocumentId(''); setScanPreferredType('auto'); }}","onClose={() => { setScanOpen(false); setSavedScanFile(null); setResumeDocumentId(''); setScanPreferredType('auto'); setScanEvidenceContext(null); }}");
patch(home,"<MoneyTaxCenter onBack={() => setBusinessSection('')} onScan={() => setScanOpen(true)}","<MoneyTaxCenter onBack={() => setBusinessSection('')} onScan={context=>{setScanPreferredType(context?.kind||'auto');setScanEvidenceContext(context?.kind?context:null);setScanOpen(true);}}");
const scan='source/src/modules/scan/SmartScanSheetV105.jsx';
patch(scan,"initialPreferredType = 'auto' })","initialPreferredType = 'auto', evidenceContextV110413 = null })");
patch(scan,"      const deliveryCount = Number(finalMatchCandidate", "      record.evidenceOnlyV110413=Boolean(evidenceContextV110413);\n      if(record.evidenceOnlyV110413){record.linkToLogbook=false;record.linkDay='';record.linkedEventId='';delete record.instructionGuide;delete record.loadGuideV110312;delete record.guideActivationRequestedAtV110312;}\n      const deliveryCount = Number(finalMatchCandidate");
patch(scan,'        {analysis.typeEvidenceV110334?.requiresTypeReview' ,"        {evidenceContextV110413?.loadNo?<p role=\"status\">Requested folder: Load {evidenceContextV110413.loadNo}. Confirm the folder below; source references may differ.</p>:null}\n        {analysis.typeEvidenceV110334?.requiresTypeReview");
console.log('PASS — v110413 shared document evidence installed');
