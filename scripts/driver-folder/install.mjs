import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='source/src/modules/owneros/';
for(const name of ['LoadFolderPanel.jsx','folderReview.js','loadFolderPanel.css'])fs.copyFileSync('scripts/driver-folder/'+name,dir+name);
function change(file, before, after){
  let code=fs.readFileSync(dir+file,'utf8');
  if(code.includes(after))return;
  assert.equal(code.split(before).length,2,'Driver folder materialization: '+file+' · '+before.slice(0,100));
  fs.writeFileSync(dir+file,code.replace(before,()=>after));
}
change('folderReview.js', "'../driver-dashboard/stopKind.js'", "'../home/stopKind.js'");
const folder='SmartLoadFolders.jsx';
change(folder,"import ManualLoadForm from","import LoadFolderPanel from './LoadFolderPanel.jsx';\nimport ManualLoadForm from");
change(folder,"[filter,setFilter]=useState('all')","[filter,setFilter]=useState('active')");
change(folder,"setSelected(id);setFilter('all')","setSelected(id);setFilter('active')");
change(folder,"className={'rr-smart rr-inbox'+", "className={'rr-smart rr-inbox rr-driver-folders'+");
const text=fs.readFileSync(dir+folder,'utf8');
if(!text.includes('<LoadFolderPanel key=')){
  const start=text.indexOf(' const inboxDetail = folder ? <>'), end=text.indexOf(' return <section',start);
  assert.ok(start>=0 && end>start,'Expected one materialized folder detail');
  const detail=` const inboxDetail = folder ? <LoadFolderPanel key={folder.id} folder={folder} rows={rows} target={billingTarget} businessStore={businessStore}
    ownerStore={props.ownerStore} onBack={()=>go('')} onScan={scan}
    onManual={type=>setManual({type,target:{...billingTarget,stops:billingTarget.stops?.length?billingTarget.stops:folder.source.stops,storedNote:billingTarget.notes||'',notes:billingTarget.notes||folder.source.notes}})}
    onOpenLog={onOpenLog} onBilling={props.onContinueBilling} onChange={()=>setRevision(v=>v+1)}
    onExport={prepareShare} exporting={sharing} exportLinks={share} error={error}/> : null;\n`;
  fs.writeFileSync(dir+folder,text.slice(0,start)+detail+text.slice(end));
}
change(folder,' const savedLoad=folder&&!folder.shipment?(businessStore.loads||[]).find(l=>l.id===folder.source.id):null;',` const matching=folder&&!folder.shipment?(props.storedLoads??businessStore.loads??[]).filter(l=>!l.deleted&&!l.deletedAt&&l.id&&String(l.canonicalLoadNo||l.loadNo||'').trim().toUpperCase()===folder.reference):[];
 const billingTarget=matching.length===1?{...matching[0],loadNo:folder.reference}:null;`);
const planner='invoiceSubmissionV110320.js';
change(planner,'// Billing-only packet planning.',"import {verifyBillingPod,signatureChecked} from './folderReview.js';\n// Billing-only packet planning.");
change(planner,'import {verifyBillingPod,signatureChecked}',"import {reviewedEvidenceComponents} from './evidenceCoreV110413.js';\nimport {verifyBillingPod,signatureChecked}");
const signatureLine="  const signed = doc => doc.podSigned !== false && doc.extracted?.podSigned !== false && (doc.podSigned === true || doc.extracted?.podSigned === true);";
const signatureCheck="  verifyBillingPod(load,docs,doc=>reviewedEvidenceComponents(doc,['pod','delivery_evidence'],load.loadNo));\n  const signed = doc => signatureChecked(doc,load);";
change(planner,signatureLine,signatureCheck);

const owner='OwnerOperatorOSV102.jsx';
change(owner,'export default function OwnerOperatorOSV102({','export default function OwnerOperatorOSV102({ driverNav,');
change(owner,"  const selectedLoad = loads.find(", `  const matchedBillingLoads=tab==='billing'&&selectedLoadNo?loads.filter(item=>!item.deleted&&!item.deletedAt&&text(item.canonicalLoadNo||item.loadNo).toUpperCase()===text(selectedLoadNo).toUpperCase()):null;
  const selectedLoad=matchedBillingLoads ? (matchedBillingLoads.length===1?{...matchedBillingLoads[0],loadNo:text(matchedBillingLoads[0].canonicalLoadNo||matchedBillingLoads[0].loadNo).toUpperCase()}:null) : loads.find(`);
change(owner,'loadsView={<LoadFoldersV10969 ', 'loadsView={<LoadFoldersV10969 storedLoads={businessStore.loads||[]} ');
change(owner,'return <EvidenceWorkspace ', 'return <EvidenceWorkspace driverNav={driverNav} ');
const workspace='EvidenceWorkspaceV110453.jsx';
change(workspace,'export default function EvidenceWorkspace({','export default function EvidenceWorkspace({driverNav,');
change(workspace,"import React,","import TodayNav from '../home/TodayNav.jsx';\nimport React,");
change(workspace,'{onDashboard?<BusinessNav active="loads"', `{driverNav&&tab==='loads'?<TodayNav {...driverNav} active="loads" onLoads={()=>{chooseTab('loads');window.dispatchEvent(new Event('road-ready-show-load-list'));}}/>:onDashboard?<BusinessNav active="loads"`);
change(folder,' useEffect(()=>()=>share?.forEach',` useEffect(()=>{const reset=()=>{setSelected('');setFilter('active');setQuery('');setAdvanced(false);setManual(null);setCreating(false);setShare(null);setError('');};window.addEventListener('road-ready-show-load-list',reset);return()=>window.removeEventListener('road-ready-show-load-list',reset);},[]);
 useEffect(()=>()=>share?.forEach`);
console.log('PASS driver load folder, signed POD review and exact billing handoff installed');
