import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,before,after){const s=read(p);if(s.includes(after))return;assert.equal(s.split(before).length,2,'Smart folder anchor: '+p+' / '+before.slice(0,90));fs.writeFileSync(p,s.replace(before,()=>after));}
const root='source/src/modules/owneros/';
for(const [from,to] of [['core.js','smartFolders.js'],['SmartLoadFolders.jsx','SmartLoadFolders.jsx'],['smartFolders.css','smartFolders.css']])fs.copyFileSync('scripts/smart-folders/'+from,root+to);
fs.copyFileSync('scripts/smart-folders/accountOriginal.js','lib/owner-op-cloud/documentOriginalCore.js');
fs.copyFileSync('scripts/smart-folders/accountClient.js','lib/owner-op-cloud/documentOriginal.js');
fs.copyFileSync('scripts/workspace-navigation/original.js','source/src/core/navigation/documentOriginalV110477.js');
const transfer=root+'transferStorageV110412.js';
patch(transfer,"import Dexie from 'dexie';","import Dexie from 'dexie';\nimport {readCurrentAccountOriginal} from '../../../../lib/owner-op-cloud/documentOriginal.js';");
patch(transfer,'getAccessToken:()=>window.ownerOpGetAccessToken?.(),','getAccessToken:()=>window.ownerOpGetAccessToken?.(),getAccountOriginal:readCurrentAccountOriginal,');
const owner=root+'OwnerOperatorOSV102.jsx';
patch(owner,"import LoadFoldersV10969 from './LoadFoldersV10969.jsx';","import LoadFoldersV10969 from './SmartLoadFolders.jsx';");
patch(owner,"initialTab={section==='load_documents'?'loads':'files'}","initialTab={'loads'}");
const workspace=root+'EvidenceWorkspaceV110453.jsx';
patch(workspace,"[['files','Files'],['loads','Loads'],['packets','Packets']]","[['loads','Loads'],['files','Files'],['packets','Packets']]");
const source=read(workspace),start=source.indexOf("  {tab==='loads'&&unlinkedShipment?"),end=source.indexOf("  {tab==='loads'?loadsView:null}",start);
if(start>=0){assert.ok(end>start);fs.writeFileSync(workspace,source.slice(0,start)+source.slice(end));}
patch(workspace,"import React,{","import {documentLabel} from './smartFolders.js';\nimport React,{");
patch(workspace,'{r.merchant||r.name}','{r.kind===\'document\'?documentLabel(r.source):r.merchant||r.name}');
patch(workspace,'{adding?\'Add a record\':selected.name}',"{adding?'Add a record':selected.kind==='document'?documentLabel(selected.source):selected.name}");
patch(workspace,'<div className="rr-files-filters">','<div className="rr-files-filters"><button type="button" aria-pressed={category===\'pod\'} onClick={()=>{setCategory(category===\'pod\'?\'\':\'pod\');setLimit(50);}}>PODs</button>');
const core=root+'evidenceWorkspaceCoreV110453.js';
patch(core,'export const CATEGORIES=',"import {savedTime,documentLabel} from './smartFolders.js';\nexport const CATEGORIES=");
patch(core,"return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name));","return rows.sort((a,b)=>Number(b.kind==='document')-Number(a.kind==='document')||(a.kind==='document'&&b.kind==='document'?savedTime(b.source)-savedTime(a.source):0)||b.date.localeCompare(a.date)||a.name.localeCompare(b.name));");
patch(core,'[r.name,r.loadNo,r.unit,r.merchant,r.notes,CATEGORIES[r.category]]','[r.name,r.loadNo,r.source?.shipmentReference,documentLabel(r.source),r.unit,r.merchant,r.notes,CATEGORIES[r.category]]');
const phone='source/src/modules/home/PhoneHomeToolsV110435.jsx';
patch(phone,"['loads','Loads',()=>onSection('loads')]","['loads','Loads',()=>onSection('load_documents')]");
// Keep the existing operational editor reachable after Loads becomes folders.
patch(phone,"const extra=MODULE_CATALOG.filter", "const extra=[...(enabled('loads')?[{id:'loads',label:'Manage load details'}]:[]),...MODULE_CATALOG.filter");
patch(phone,".includes(m.id)&&enabled(m.id));", ".includes(m.id)&&enabled(m.id))];");
const adaptive='source/src/modules/home/AdaptiveHomeV1038.jsx';
patch(adaptive,"onClick={()=>currentLoad?.identity==='reference'?onShipment?.(loadNo):onSection('load_documents')}>{currentLoad?.identity==='reference'?'Open shipment log':'Open load'}","onClick={()=>onSection('load_documents')}>Open load folder");
const scan='source/src/modules/scan/SmartScanSheetV105.jsx';
// Upgrade earlier installs without introducing duplicate imports on replay.
if(read(scan).includes("import {requestedScanFolder} from '../owneros/smartFolders.js';"))fs.writeFileSync(scan,read(scan).replace("import {requestedScanFolder} from '../owneros/smartFolders.js';","import {requestedScanFolder,explicitFolderScanCandidates} from '../owneros/smartFolders.js';"));
patch(scan,"import { matchScanDocumentToLoadV11037", "import {requestedScanFolder,explicitFolderScanCandidates} from '../owneros/smartFolders.js';\nimport { matchScanDocumentToLoadV11037");
if(read(scan).includes('requestedScanFolder(evidenceContextV110413,typeId,collectLoadCandidatesV105(state,businessStore))'))patch(scan,'requestedScanFolder(evidenceContextV110413,typeId,collectLoadCandidatesV105(state,businessStore))','requestedScanFolder(evidenceContextV110413,typeId,explicitFolderScanCandidates(evidenceContextV110413,typeId,collectLoadCandidatesV105(state,businessStore),businessStore))');
patch(scan,"    const loadNo = result.typeEvidenceV110334", "    const requestedFolder=!preserveLoadChoice&&!resumed?requestedScanFolder(evidenceContextV110413,typeId,explicitFolderScanCandidates(evidenceContextV110413,typeId,collectLoadCandidatesV105(state,businessStore),businessStore)):'';\n    const loadNo = requestedFolder || (result.typeEvidenceV110334");
patch(scan,'initialScanLoadV11037(result, nextMatch, preferredLoadNo, preserveLoadChoice);','initialScanLoadV11037(result, nextMatch, preferredLoadNo, preserveLoadChoice));');
patch(scan,'setLoadSelectionSourceV11037((retainedScanChoice(resumed)?',"setLoadSelectionSourceV11037((requestedFolder?'driver_selected':'') || (retainedScanChoice(resumed)?");
patch(scan,'const requiresLoad = loadDocumentType(selectedType);',"const requiresLoad = loadDocumentType(selectedType)||Boolean(requestedScanFolder(evidenceContextV110413,selectedType,candidates));");
patch(scan,'const needsReview = Boolean(analysis?', 'const needsReview = Boolean(evidenceContextV110413?.loadNo || analysis?');
patch(scan,'    setLinkToLogbook(Boolean(resumed ?', '    setLinkToLogbook(!evidenceContextV110413 && Boolean(resumed ?');
patch(scan,'Find this file in <strong>Documents → Browse all saved files</strong>.','Find this file in <strong>Loads → its load folder</strong>, or <strong>Documents → Files</strong> if it has no load link.');
patch(scan,"onOpenBusiness?.('documents');", "onOpenBusiness?.('load_documents');");

patch(scan,"try { finishSavedScanV110312(saved,onClose); }", "try { rememberSavedFolder(saved);finishSavedScanV110312(saved,onClose); }");
patch(scan,"import {requestedScanFolder,explicitFolderScanCandidates}","function rememberSavedFolder(saved){const r=saved?.record||{},ref=r.canonicalLoadNo||r.loadNo||r.shipmentReference;if(ref)try{sessionStorage.setItem('road-ready-open-load-folder',(r.canonicalLoadNo||r.loadNo?'load:':'shipment:')+String(ref).trim().toUpperCase());}catch{}}\nimport {requestedScanFolder,explicitFolderScanCandidates}");
patch(scan,"}}>Open Documents</button>","}}>Open load folders</button>");
patch(scan,"onClose?.();onOpenBusiness?.('loads');}}>Done · Open load", "rememberSavedFolder(saved);onClose?.();onOpenBusiness?.('load_documents');}}>Done · Open load folder");
patch(scan,'shipmentPickerDetails(loadPickerCandidates(collectLoadCandidatesV105(state, store),state,store,operationalCandidateContext(state,store)),analysis||{}), [state, store, analysis]','shipmentPickerDetails(explicitFolderScanCandidates(evidenceContextV110413,selectedType,loadPickerCandidates(collectLoadCandidatesV105(state, store),state,store,operationalCandidateContext(state,store)),store),analysis||{}), [state, store, analysis, selectedType, evidenceContextV110413]');
patch(scan,'      const currentStore = migrateBusinessStoreV105(readBusinessStore(), state);',`      const currentStore = migrateBusinessStoreV105(readBusinessStore(), state);
      if(selectedLoad?.evidenceFolderOnly || evidenceContextV110413?.loadNo && !selectedLoad && filingSelectedLoadNo){
        const currentFolder=explicitFolderScanCandidates(evidenceContextV110413,selectedType,[],currentStore).find(candidate=>candidate.loadNo===filingSelectedLoadNo && (!selectedLoad || candidate.id===selectedLoad.id));
        const freshCandidates=collectLoadCandidatesV105(state,currentStore);
        if(!currentFolder || requestedScanFolder(evidenceContextV110413,selectedType,freshCandidates.some(candidate=>candidate.loadNo===filingSelectedLoadNo)?freshCandidates:[currentFolder,...freshCandidates])!==filingSelectedLoadNo)throw new Error('This load folder changed or is no longer available. Reopen the folder and choose where to save this original.');
      }`);
console.log('PASS — smart folders, completed trips, visible PODs and account original access installed');
