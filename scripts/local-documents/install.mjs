import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;assert.equal(s.split(before).length,2,'Local originals anchor: '+path+' '+before.slice(0,70));fs.writeFileSync(path,s.replace(before,()=>after));}
function replaceRange(path,from,to,replacement){const s=read(path),a=s.indexOf(from),b=s.indexOf(to,a);assert.ok(a>=0&&b>a,'Local originals boundary: '+path);fs.writeFileSync(path,s.slice(0,a)+replacement+s.slice(b));}
fs.mkdirSync('lib/documents',{recursive:true});
fs.copyFileSync('scripts/local-documents/policy.js','lib/documents/localOriginalPolicy.js');
fs.copyFileSync('scripts/local-documents/save.js','lib/documents/saveLocalOriginal.js');
fs.copyFileSync('scripts/local-documents/walletSave.js','lib/documents/saveWalletOriginal.js');
const scan='source/src/modules/scan/';
fs.writeFileSync(scan+'quotaSafeScanStorageV10963.js',`'use client';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {saveLocalOriginal} from '../../../../lib/documents/saveLocalOriginal.js';
export const isQuotaErrorV10963=e=>/quota|storage.*full|disk.*full/i.test([e?.name,e?.message].join(' '));
export const duplicateSignatureV10963=({fileName='',fileSize=0,type='',loadNo=''}={})=>[fileName,fileSize,type,loadNo].join('|');
export const saveScannedDocumentQuotaSafeV10963=input=>saveLocalOriginal(getOwnerOpDb(),input);
`);
replaceRange(scan+'scanStorage.js','async function uploadToCloud(', 'export async function getScannedDocumentBlob',`export {saveScannedDocumentQuotaSafeV10963 as saveScannedDocument} from './quotaSafeScanStorageV10963.js';\n\n`);
// Retired queue entries must never restart an upload or remove its local blob.
replaceRange('lib/sync/clientSync.js','async function syncDocumentUpload(', '\nasync function pushDutyEventBatch',`async function syncDocumentUpload() { return {status:'processed',localOnly:true}; }\n`);

// Keep cloud download compatibility while closing both archive upload APIs.
replaceRange('lib/owner-op-cloud/cloudMirrorV110450.js','export function runMirror(', '\nfunction canonical(',`export function runMirror(){
 const message='Original files stay on this device. Use Data Safety to export a verified backup to Files.';
 show({phase:'disabled',message});return Promise.resolve({disabled:true,message});
}\n`);
patch('lib/owner-op-cloud/cloudMirrorV110450.js',"message:'Manual backup · starts only when you tap Back up everything now.'","message:'Original files stay on this device. Export a verified backup to Files.'");
// Defense at the old full-migration entry point, including a pending server request.
fs.writeFileSync('lib/owner-op-cloud/migration.js',`'use client';
const disabled=()=>({status:'disabled',message:'Originals are local. Create a sharing link to upload selected documents.'});
export async function migrationStatus(){return disabled();}
export async function runAuthorizedFullMigration(){return disabled();}
`);
// This older backup API is separate from the immutable current-phone share.
// Leave its log transport untouched; exclude every wallet original from backups.
replaceRange('lib/owner-op-cloud/client.js',"      for (const [key, doc] of Object.entries(state.dotWallet?.documents || {})) {",'      const dates =',`      // Wallet originals upload only in createCurrentInspectionShare after selection.\n`);

// Legacy log snapshots can include arbitrary day buckets. Refuse a whole
// snapshot containing an original rather than rewriting signed log evidence.
patch('lib/owner-op-cloud/client.js',"import { createClient } from '@supabase/supabase-js';", "import { createClient } from '@supabase/supabase-js';\nimport {containsOriginal} from '../documents/localOriginalPolicy.js';");
patch('lib/owner-op-cloud/client.js','        const snapshot = makeSnapshot(state, day, buildDayBackupPayload);', `        const snapshot = makeSnapshot(state, day, buildDayBackupPayload);
        if(containsOriginal(snapshot)){errors.push(day+': this log backup contains an original document. Export a local backup or create a sharing link.');continue;}`);

const account='lib/owner-op-cloud/accountSyncV110455.js';
patch(account,'scopedRecords,mergeScope,workingRecord}', 'scopedRecords as originalScopedRecords,mergeScope as originalMergeScope,workingRecord}');
patch(account,"const FILE_TABLES=new Set(['document_blobs','capture_asset_blobs']);",`import {documentScope,DOCUMENT_TABLES} from '../documents/localOriginalPolicy.js';
let originalsScope=documentScope();
const scopedRecords=(records,scope)=>originalScopedRecords(originalsScope.filter(records),scope);
const mergeScope=(previous,records,scope)=>originalsScope.preserve(previous,originalMergeScope(originalsScope.filter(previous),originalsScope.filter(records),scope));
const FILE_TABLES=new Set(['document_blobs','capture_asset_blobs']);`);
replaceRange(account," if(scope==='all')for(const name of FILE_TABLES)", ' if(bundle.epoch!==mutationEpoch)',` // Original bytes are never read or uploaded by account reconciliation.\n`);
patch(account,'   if(remote)validatePayload(remote.payload);',`   if(remote)validatePayload(remote.payload);
   originalsScope=documentScope(recordsFrom(local),remote?.payload?.records,saved?.records);`);
patch(account,'await encode(value,opts)','await encode(value,{...opts,recordPath:parts[0]===\'book\'?[parts[2]]:[]})');
patch(account,"   if(scope==='all')for(const [name,pk] of Object.entries(TABLE_KEYS)){",`   if(scope==='all')for(const [name,pk] of Object.entries(TABLE_KEYS)){
    if(DOCUMENT_TABLES.has(name))continue;`);
patch(account,"const removed=(local.tables[name]||[]).filter(r=>!incoming.has(String(r[pk])));",`const removed=(local.tables[name]||[]).filter(r=>originalsScope.allows(JSON.stringify(['table',name,String(r[pk])]),r)&&!incoming.has(String(r[pk])));`);
patch(account,'Logbook is up to date. Documents sync in the background.','Logbook is up to date. Original documents stay on this device.');
patch(account,"'Account data is up to date.'","'Account records are up to date. Original documents stay on this device.'");
// Defense in depth: the encoder may carry signatures, never document originals.
patch('lib/owner-op-cloud/accountFilesV110455.js',"const fileRef=v=>", "import {containsOriginal} from '../documents/localOriginalPolicy.js';\nconst fileRef=v=>");
patch('lib/owner-op-cloud/accountFilesV110455.js','export async function encode(value,{storage,uid,known,','export async function encode(value,{recordPath=[],storage,uid,known,');
patch('lib/owner-op-cloud/accountFilesV110455.js',' async function file(blob,kind,prefix=', " if(containsOriginal(value,recordPath))throw Error('Document originals are local. Use Create link to share selected files.');\n async function file(blob,kind,prefix=");
// The searchable metadata index must strip files inside serialized recovery rows too.
patch('lib/owner-op-cloud/recordsCoreV110451.js','export function visible(value){',`export function visible(value){
 if(typeof value==='string'&&/^\\s*[\\[{]/.test(value)){try{return visible(JSON.parse(value));}catch{}}
 if(typeof value==='string'&&/data:[^,]*[;,]/i.test(value))return {embeddedFile:true,originalOnDevice:true};`);

const panel='source/src/modules/cloud/CloudBackupPanelV110450.jsx';
patch(panel,'MANUAL CLOUD BACKUP','LOCAL ORIGINALS');
patch(panel,'<h2>All records &amp; original files</h2><p>Includes loads, both drivers’ saved logs, wallet, signatures, documents and settings.</p>', '<h2>Keep a backup outside this app</h2><p>Originals stay on this device. Losing your phone, clearing website data or deleting the app can lose local files. Before changing phones, export a verified backup to Files and keep a second copy on a computer or iCloud Drive. Existing cloud copies remain available below.</p>');
patch(panel,`<button className="rr-primary" disabled={running||busy} onClick={()=>{pauseMirror(false);runMirror({force:true});}}>{running?'Backing up…':'Back up everything now'}</button>`,`<p>Open Road Ready → Tools → Backup Logs → Data Safety to export and verify your backup.</p>`);
patch('source/src/modules/cloud/CloudHub.jsx','Wallet and active-driver log pass finished. Complete device backup is shown separately above.','Active-driver log backup finished. Original documents remain on this device.');
// Saving never promises that a future network attempt will back up the original.
const folders='source/src/modules/owneros/smartFolders.js';
patch(folders,"?'Original sync pending':''","?'Original on this device':''");

// Retire signed-upload issuance for stale scanner/queue clients. Download routes
// and the selected immutable inspection-sharing endpoint remain available.
for(const route of ['create-upload','commit-upload'])fs.writeFileSync(`app/api/documents/${route}/route.js`,`export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(){return Response.json({error:'local_originals_only',message:'Originals stay on this device. Update Road Ready and create a sharing link for selected documents.'},{status:409});}
`);

const wallet='source/src/modules/wallet/DigitalWalletScreen.jsx';
patch(wallet,"import WalletImportPanel from './WalletImportPanelV110443.jsx';",`import WalletImportPanel from './WalletImportPanelV110443.jsx';
import {walletFingerprint} from './walletImportV110443.js';
import {saveWalletOriginal} from '../../../../lib/documents/saveWalletOriginal.js';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {APP_STATE_KEY} from '../../../../lib/local-db/appState.js';`);
patch(wallet,'  const [busy, setBusy] = useState(false);','  const [busy, setBusy] = useState(false);\n  const [saveError,setSaveError]=useState(\'\');');
patch(wallet,'    setBusy(true);\n    try {','    setBusy(true);\n    setSaveError(\'\');\n    try {');
patch(wallet,'    } finally {\n      setBusy(false);',"    } catch(error) { setSaveError(error?.message||'The file could not be read. Try attaching it again.'); } finally {\n      setBusy(false);");
replaceRange(wallet,'  function save() {','\n  return (',`  async function save() {
    if(busy)return;setBusy(true);setSaveError('');
    try{await onSave(docId,{...draft,present:!!draft.present,updatedAt:Date.now()});}
    catch(error){setSaveError(error?.message||'Saving failed. Keep this document open.');}
    finally{setBusy(false);}
  }
`);
patch(wallet,'className="wallet-save-small" onClick={save}>Save','className="wallet-save-small" disabled={busy} onClick={save}>{busy?\'Saving…\':\'Save\'}');
patch(wallet,'className="primary" onClick={save}>Save document','className="primary" disabled={busy} onClick={save}>{busy?\'Saving…\':\'Save document\'}');
patch(wallet,"draft.attachmentDataUrl ? 'Saved locally in this app'","draft.attachmentDataUrl ? 'Ready to save on this device'");
patch(wallet,'        <div className="wallet-editor-body">','        <div className="wallet-editor-body">\n          {saveError?<p role="alert">{saveError}</p>:null}');
patch(wallet,`  function saveDoc(id, doc) {
    onSaveDocument(id, doc);
    setEditingDocId(null);
  }`,`  async function saveDoc(id, doc) {
    await saveWalletOriginal({wallet,id,doc,onApply:onApplyWallet,fingerprint:walletFingerprint,readSaved:async()=>(await getOwnerOpDb()?.app_snapshots.get(APP_STATE_KEY))?.state?.dotWallet});
    setEditingDocId(null);
  }`);
// Cloud vault can select current-phone originals without first backing them up.
const hub='source/src/modules/cloud/CloudHub.jsx';
patch(hub,"import './cloud.css';", "import {captureInspectionWallet} from '../../../../lib/owner-op-cloud/inspectionWallet.js';\nimport './cloud.css';");
patch(hub,'export default function CloudHub() {', 'export default function CloudHub() {\n  const [localWallet,setLocalWallet]=useState([]);');
patch(hub,'    const state=await localState();','    const state=window.__rrAccountState?.()||await localState();setLocalWallet(captureInspectionWallet(state||{}));');
patch(hub,'Officer wallet &amp; active log copies','Active-driver log copies');
patch(hub,'Back up wallet & all logs','Back up active-driver logs');
patch(hub,'Documents go to private Storage. Log snapshots are compressed and indexed by date. Older days load only when requested. Original versions are retained.','Original documents stay on this device. Selected files upload only when creating an inspection link. Existing cloud copies are retained.');
patch(hub,'Update these copies before creating an officer link.','Links require a working Supabase connection and available storage quota.');
patch(hub,'Wallet and active-driver log pass completed.','Active-driver log backup completed.');
patch(hub,'<div className="rr-wallet-list">{catalog.wallet.map', '<div className="rr-wallet-list">{localWallet.map(row=>({document_key:row.key,metadata:row.metadata,revision:0,localDataUrl:row.dataUrl})).map');
patch(hub,"!catalog.wallet.length?<p className=\"rr-muted\">Add documents in Digital Wallet, then back up this device.</p>","!localWallet.length?<p className=\"rr-muted\">Add original files in Digital Wallet on this device.</p>");
patch(hub,"import './cloud.css';", "import {DotDocumentViewer} from '../dot/DotMode.jsx';\nimport './cloud.css';");
patch(hub,'const [localWallet,setLocalWallet]=useState([]);','const [localWallet,setLocalWallet]=useState([]),[localViewer,setLocalViewer]=useState(null);');
fs.writeFileSync(hub,read(hub).replaceAll('onClick={()=>setViewer({...file,label:file.metadata.title||file.document_key})}', "onClick={()=>file.localDataUrl?setLocalViewer({doc:{attachmentDataUrl:file.localDataUrl,attachmentName:file.metadata.title,attachmentType:file.metadata.mimeType},requirement:{title:file.metadata.title}}):setViewer({...file,label:file.metadata.title||file.document_key})}"));
patch(hub,'return <main className="rr-cloud">','return <main className="rr-cloud">{localViewer?<DotDocumentViewer row={localViewer} backLabel="Back to cloud vault" onClose={()=>setLocalViewer(null)}/>:null}');
patch(hub,'<section className="rr-card"><h2>Digital wallet</h2>', `<details className="rr-card"><summary>Existing cloud wallet copies</summary><p>Previously uploaded originals remain in your cloud account.</p>{catalog.wallet.map(file=><button key={file.document_key} onClick={()=>setViewer({...file,label:file.metadata.title||file.document_key})}>{file.metadata.title||file.document_key} · Revision {file.revision}</button>)}</details><section className="rr-card"><h2>Digital wallet</h2>`);
console.log('PASS — local originals, share-only uploads and non-destructive document reconciliation installed');
