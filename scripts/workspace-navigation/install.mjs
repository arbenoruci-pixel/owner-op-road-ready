import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,before,after){const source=read(p);if(source.includes(after))return;assert.equal(source.split(before).length,2,'Workspace navigation anchor: '+p+' / '+before.slice(0,90));fs.writeFileSync(p,source.replace(before,()=>after));}
const nav='source/src/core/navigation/workspaceNavigationV110477.js';
fs.mkdirSync('source/src/core/navigation',{recursive:true});fs.copyFileSync('scripts/workspace-navigation/navigation.js',nav);
const home='source/src/modules/home/HomeScreen.jsx';
patch(home,"import {pendingSavedLoadScanV110312}","import {recordLogDay,shipmentLogDay} from '../../core/navigation/workspaceNavigationV110477.js';\nimport {pendingSavedLoadScanV110312}");
patch(home,"['overview','documents','billing','ifta','tolls','audit','connections']","['overview','documents','load_documents','billing','ifta','tolls','audit','connections']");
patch(home,'        onOpenLog={() => onOpenDay?.(today)}','        onOpenLog={record => {const day=record?recordLogDay(record,state):today;if(day)onOpenDay?.(day);}}');
patch(home,'        onOpenDay={() => onOpenDay?.(today)}','        onOpenDay={() => onOpenDay?.(today)}\n        onOpenLogbook={onOpenLogbook}\n        onOpenShipment={reference=>onOpenDay?.(shipmentLogDay(state,reference,today))}');
const adaptive='source/src/modules/home/AdaptiveHomeV1038.jsx';
patch(adaptive,'onDot, onWallet, onBackup, onDrive, operatorProfile })','onDot, onWallet, onBackup, onDrive, onLogbook, onShipment, operatorProfile })');
patch(adaptive,"<button type=\"button\" className=\"primary\" onClick={()=>onSection('loads')}>Open load</button>","<button type=\"button\" className=\"primary\" onClick={()=>currentLoad?.identity==='reference'?onShipment?.(loadNo):onSection('load_documents')}>{currentLoad?.identity==='reference'?'Open shipment log':'Open load'}</button>");
patch(adaptive,"onClick={()=>onSection('documents')}><strong>!</strong><span><b>Check the load link</b><em>This is a shipment reference. Choose its broker load in Documents.</em>","onClick={()=>onSection('load_documents')}><strong>!</strong><span><b>Check the load link</b><em>Add its rate confirmation in Documents to link the broker load.</em>");
patch(adaptive,'onBackup={onBackup} onDrive={onDrive}/>','onBackup={onBackup} onDrive={onDrive} onLogbook={onLogbook}/>');
patch(adaptive,'onTrailer:props.onOpenTrailer, onLog:props.onOpenDay,','onTrailer:props.onOpenTrailer, onLog:props.onOpenDay, onLogbook:props.onOpenLogbook, onShipment:props.onOpenShipment,');
const tools='source/src/modules/home/PhoneHomeToolsV110435.jsx';
patch(tools,'onBackup,onDrive})','onBackup,onDrive,onLogbook})');
patch(tools,"['logbook','Logbook',onLog]","['logbook','Logbook',onLogbook||onLog]");
patch(tools,"['loads','Drive',onDrive]","['drive','Drive',onDrive]");
patch(tools,'    documents:<','    drive:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M3 10h7m4 0h7m-9 4v7"/></>,\n    documents:<');
const css='source/src/phone-home-v110435.css',cssFix='\n/* Decorative header shapes must never intercept Home controls. */\n.phone-home-v435 .command-home-head::after{pointer-events:none}\n.phone-home-v435 .phone-settings{position:relative;z-index:1}\n';
if(!read(css).includes(cssFix))fs.appendFileSync(css,cssFix);
const owner='source/src/modules/owneros/OwnerOperatorOSV102.jsx';
patch(owner,"import EvidenceWorkspace from", "import {operationalCandidateContext,businessLoadRows} from '../loads/currentLoadV110473.js';\nimport {reconcileLoadFoldersV10974} from './loadFolderReconciliationV10974.js';\nimport EvidenceWorkspace from");
patch(owner,"const initialTab = TABS_V102.some(([id])=>id===section) ? section : 'overview';","const initialTab = section==='load_documents'?'documents':TABS_V102.some(([id])=>id===section) ? section : 'overview';");
patch(owner,'const [documents, setDocuments] = useState([]);','const [vaultDocuments, setDocuments] = useState([]);');
patch(owner,"setTab(TABS_V102.some(([id])=>id===section)?section:'overview');","setTab(section==='load_documents'?'documents':TABS_V102.some(([id])=>id===section)?section:'overview');");
if(!read(owner).includes('  const loadContext ='))patch(owner,'  const loads = businessStore.loads || [];',`  const loadContext = useMemo(()=>operationalCandidateContext(state,businessStore),[state,businessStore]);
  const loads = useMemo(()=>businessLoadRows(businessStore,loadContext),[businessStore,loadContext]);
  const businessView = useMemo(()=>({...businessStore,loads}),[businessStore,loads]);
  const documents = useMemo(()=>reconcileLoadFoldersV10974({loads,documents:vaultDocuments,state,businessStore}).allDocuments,[loads,vaultDocuments,state,businessStore]);`);
if(!read(owner).includes('  const businessView ='))patch(owner,'  const documents = useMemo(', '  const businessView = useMemo(()=>({...businessStore,loads}),[businessStore,loads]);\n  const documents = useMemo(');
fs.writeFileSync(owner,read(owner).replaceAll('businessStore={businessStore}','businessStore={businessView}'));
patch(owner,"window.addEventListener('road-ready-evidence-filed',refreshBusiness);","window.addEventListener('road-ready-evidence-filed',refreshBusiness);\n    window.addEventListener('road-ready-repair-applied',refreshBusiness);");
patch(owner,"window.removeEventListener('road-ready-evidence-filed',refreshBusiness);","window.removeEventListener('road-ready-evidence-filed',refreshBusiness);\n      window.removeEventListener('road-ready-repair-applied',refreshBusiness);");
patch(owner,'<EvidenceWorkspace state={state} documents={documents}',"<EvidenceWorkspace state={state} documents={documents} localDocuments={vaultDocuments} loading={loadingDocs} initialTab={section==='load_documents'?'loads':'files'} unlinkedShipment={loadContext.current?.identity==='reference'?loadContext.current:null}");
const reconciliation='source/src/modules/owneros/loadFolderReconciliationV10974.js';
patch(reconciliation,"import {projectPodPrimaryDocuments}","import {projectDocumentFilings,projectFiledDocument} from '../../core/navigation/workspaceNavigationV110477.js';\nimport {projectPodPrimaryDocuments}");
patch(reconciliation,'for(const rawDoc of [...(documents||[]),...(businessStore.documents||[]).map(normalizeBusinessDoc)])','for(const rawDoc of projectDocumentFilings([...(documents||[]),...(businessStore.documents||[]).map(normalizeBusinessDoc)]))');
patch(reconciliation,'repairedDocs.push(applyDocRepair(rawDoc,assignment,aliases));','repairedDocs.push(applyDocRepair(projectFiledDocument(rawDoc),assignment,aliases));');
patch(reconciliation,"function loadOf(d={}){return upper(","function loadOf(d={}){if(d.evidenceFilingV1?.version===1&&d.evidenceFilingV1.confirmed)return upper(d.evidenceFilingV1.loadNo);return upper(");
patch('source/src/modules/owneros/documentBrowserV110404.js',"export function documentLoad(doc = {}) { return clean(","export function documentLoad(doc = {}) { if(doc.evidenceFilingV1?.version===1&&doc.evidenceFilingV1.confirmed)return clean(doc.evidenceFilingV1.loadNo).toUpperCase();return clean(");
patch('source/src/modules/owneros/evidenceCoreV110413.js','export const loadOf = row => text(row.load_no',"export const loadOf = row => row.evidenceFilingV1?.version===1&&row.evidenceFilingV1.confirmed?text(row.evidenceFilingV1.loadNo).toUpperCase():text(row.load_no");
patch('source/src/modules/owneros/loadFolderEngineV10969.js',"function docLoad(d={}){return upper(","function docLoad(d={}){if(d.evidenceFilingV1?.version===1&&d.evidenceFilingV1.confirmed)return upper(d.evidenceFilingV1.loadNo);return upper(");
const copies='source/src/modules/owneros/sourceCopiesV110419.js';
patch(copies,'if(doc.repairOverlayApplied||doc.sourceCopyReviewV110419)return doc;','if(doc.repairOverlayApplied||doc.sourceCopyReviewV110419||doc.evidenceFilingV1?.confirmed)return doc;');
patch('source/src/modules/owneros/ownerOpsStoreV102.js',"const delivered = ['delivered','invoice_ready','invoiced','submitted','paid'].includes(stage)","const delivered = !['tonu','cancelled','canceled'].includes(stage)&&load.operationalStatus==='delivered' || ['delivered','invoice_ready','invoiced','submitted','paid'].includes(stage)");
patch('source/src/modules/owneros/loadPresentationV110417.js',"const stage=text(load.documentWorkflowStage||load.serviceStatus||load.status).toLowerCase();", "const stage=text(load.documentWorkflowStage||load.serviceStatus||load.status).toLowerCase();\n  if(load.operationalStatus==='delivered'&&!['tonu','cancelled','canceled','invoiced','submitted','paid'].includes(stage))return 'delivered';");
const workspace='source/src/modules/owneros/EvidenceWorkspaceV110453.jsx';
patch(workspace,"import React,{", "import {localFileRecord,recordLogDay} from '../../core/navigation/workspaceNavigationV110477.js';\nimport React,{");
patch(workspace,"import {readDocuments,addOriginal,saveFiling}","import {addOriginal,saveFiling}");
patch(workspace,'{state,documents=[],onBack,loadsView,onScan,onOpenLog}',"{state,documents=[],localDocuments=[],loading=false,initialTab='files',unlinkedShipment,onBack,loadsView,onScan,onOpenLog}");
patch(workspace,"const [tab,setTab]=useState('files')","const [tab,setTab]=useState(initialTab)");
patch(workspace," useEffect(()=>{let live=true;const refresh=()=>readDocuments().then(rows=>{if(live)setDocs(rows);}).catch(e=>{if(live)setError(e.message);});refresh();window.addEventListener('road-ready-evidence-filed',refresh);return()=>{live=false;window.removeEventListener('road-ready-evidence-filed',refresh);controller.current?.abort();};},[]);"," useEffect(()=>()=>controller.current?.abort(),[]);");
patch(workspace,'setDocs(await readDocuments());','/* Parent refresh retains both vault and load-library records. */');
patch(workspace,' const undated=packetRows.filter(r=>!r.date).length;',' const undated=packetRows.filter(r=>!r.date).length;\n const canEdit=Boolean(selected?.fileRecord);');
patch(workspace,"function edit(row){setSelected(row);setDraft(row.kind==='document'?{...filingOf(row.source)}:empty);","function edit(row){const fileRecord=row.kind==='document'?localFileRecord(row.source,localDocuments):null;setSelected({...row,fileRecord});setDraft(row.kind==='document'?{...filingOf(fileRecord||row.source)}:empty);");
patch(workspace,'await saveFiling(selected.source,draft);','await saveFiling(selected.fileRecord,draft);');
patch(workspace,"  {tab==='loads'?loadsView:null}",`  {tab==='loads'&&unlinkedShipment?<aside className="rr-files-card"><h2>Shipment reference {unlinkedShipment.shipmentReference||unlinkedShipment.loadNo}</h2><p>{unlinkedShipment.origin} → {unlinkedShipment.destination}</p><p>A broker load is not linked yet. Add its rate confirmation and review the load number before saving.</p><button type="button" className="rr-files-primary" onClick={()=>onScan?.({kind:'rate_confirmation'})}>Add rate confirmation</button></aside>:null}
  {tab==='loads'?loadsView:null}`);
patch(workspace,'{visible.length} records <span>',"{loading?'Loading records…':visible.length+' records'} <span>");
patch(workspace,"{adding||selected?.kind==='document'?<form",'{adding||canEdit?<form');
patch(workspace,"<><p>{selected.notes||CATEGORIES[selected.category]}</p>{selected.kind==='log'?<><p>{selected.source.events.length} saved events</p><button type=\"button\" onClick={onOpenLog}>Open current logbook</button></>:null}",`<><p>{selected.notes||CATEGORIES[selected.category]}</p>
    {selected.kind==='document'?<><p>{[selected.date,selected.loadNo?'Load '+selected.loadNo:'',selected.merchant].filter(Boolean).join(' · ')}</p><p>Filing for this saved record is managed in its load folder.</p><button type="button" onClick={()=>chooseTab('loads')}>Open load folders</button></>:null}
    {selected.kind==='log'?<><p>{selected.source.events.length} saved events</p>{recordLogDay(selected.source,state)?<button type="button" onClick={()=>onOpenLog?.(selected.source)}>Open this logbook</button>:<p>Saved log for {selected.source.driverName}. Your active driver stays selected.</p>}<ol aria-label="Saved duty events">{selected.source.events.map((event,index)=><li key={event.id||index}>{String(Math.floor(Number(event.startMin||0)/60)).padStart(2,'0')}:{String(Number(event.startMin||0)%60).padStart(2,'0')} · {event.status} · {[event.city,event.state,event.note||event.description].filter(Boolean).join(' · ')}</li>)}</ol></>:null}`);
const drive='source/src/modules/drive/DriveModeScreen.jsx';
patch(drive,"import React from 'react';","import React from 'react';\nimport {driveStatusLabel} from '../../core/navigation/workspaceNavigationV110477.js';");
patch(drive,"const status = hos.currentStatus || state.currentStatus || 'D';","const status = hos.currentStatus || state.currentStatus || 'OFF';");
patch(drive,'aria-label="Back to logs"','aria-label="Back"');
patch(drive,'<span aria-hidden="true" /> MANUAL DRIVING','<span aria-hidden="true" /> {status===\'D\'?\'MANUAL DRIVING\':\'HOURS OF SERVICE\'}');
patch(drive,"<span>D</span>\n        <b>{status === 'D' ? 'DRIVING' : 'CURRENT STATUS'}</b>",'<span>{status}</span>\n        <b>{driveStatusLabel(status)}</b>');
const app='source/src/app/App.jsx';
patch(app,"import HomeScreen from", "import {openWorkspace,returnWorkspace} from '../core/navigation/workspaceNavigationV110477.js';\nimport HomeScreen from");
for(const [view,callback]of [['dot','onOpenDot'],['wallet','onOpenWallet'],['backup','onOpenBackup'],['driveMode','onOpenDrive'],['backup','onOpenTransfer']]){
 const before=`${callback}={()=>setState(s=>({ ...s, view:'${view}', sheet:null }))}`;
 const after=`${callback}={()=>setState(s=>openWorkspace(s,'${view}'))}`;
 if(read(app).includes(before))fs.writeFileSync(app,read(app).replaceAll(before,after));
 else assert.ok(read(app).includes(after),'Workspace callback anchor '+callback);
}
patch(app,"<DotMode state={state} onBack={() => setState(s => ({ ...s, view:'day' }))}","<DotMode state={state} onBack={()=>setState(s=>returnWorkspace(s,'dot','day'))}");
for(const [tag,view,fallback]of [['DriveModeScreen','driveMode','logs'],['DigitalWalletScreen','wallet','logs'],['BackupLogsScreen','backup','logbook']]){
 const source=read(app),start=source.indexOf('<'+tag+'\n'),end=source.indexOf('/>',start);assert.ok(start>=0&&end>start,'Missing '+tag);
 const block=source.slice(start,end),before=`onBack={()=>setState(s=>({ ...s, view:'${fallback}', sheet:null }))}`,after=`onBack={()=>setState(s=>returnWorkspace(s,'${view}','${fallback}'))}`;
 if(!block.includes(after)){assert.equal(block.split(before).length,2,'Back anchor '+tag);fs.writeFileSync(app,source.slice(0,start)+block.replace(before,after)+source.slice(end));}
}
patch(app,"      onOpenLogs={()=>setState(s=>({ ...s, view:'logs', sheet:null }))}","      onOpenLogs={openLogbook}");
patch(app,"onOpenLog={()=>setState(s=>({ ...s, view:'day', sheet:null, roadGuardTabRequest:{ tab:'log', at:Date.now(), source:'drive-mode-log' } }))}","onOpenLog={()=>openDay(localDayKey())}");
for(const [callback,view]of [['onDot','dot'],['onWallet','wallet'],['onBackup','backup']]){
 patch(app,`${callback}={()=>setState(s=>({ ...s, sheet:null, view:'${view}' }))}`,`${callback}={()=>setState(s=>openWorkspace(s,'${view}'))}`);
}
console.log('PASS — Home hit targets, records/loads/billing projection, dated log links and workspace return navigation installed');
