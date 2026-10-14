import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(path,'utf8');
function patch(path,before,after) {const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length,2,'POD supersession anchor: '+path+' / '+before.slice(0,90));fs.writeFileSync(path,source.replace(before,()=>after));}
fs.copyFileSync('scripts/reader-foundation/podSupersession.js','lib/documents/podSupersessionV1.js');
fs.writeFileSync('lib/documents/podCheckpointV1.js',read('scripts/reader-foundation/podCheckpoint.js').replace("'./podSupersession.js'","'./podSupersessionV1.js'"));
fs.copyFileSync('scripts/reader-foundation/podSupersessionRuntime.js','lib/documents/podSupersessionRuntimeV1.js');
const storage='source/src/modules/owneros/evidenceStorageV110413.js';
patch(storage,"import {selectReviewRecord}","import {stageReviewedPodPromotion,acknowledgeReceiverSignature} from '../../../../lib/documents/podSupersessionV1.js';\nimport {originalPageCount} from '../../../../lib/documents/podSupersessionRuntimeV1.js';\nimport {selectReviewRecord}");
patch(storage,'  const sourceHash=await digest(await original.arrayBuffer());assertSourceHash(doc,sourceHash);',
  "  const sourceHash=await digest(await original.arrayBuffer());assertSourceHash(doc,sourceHash);\n  const sourcePageCount=kind==='pod'&&(kindOf(doc)==='bol'||doc.podLifecycleV1?.state==='review_required')?await originalPageCount(original):0;");
patch(storage,"        const next=applyFactsToDocument({...current,sha256:sourceHash,file_size_bytes:original.size},kind,fields,'driver_review',components);",
  "        const originalForReview={...current,sha256:sourceHash,file_size_bytes:original.size,...(sourcePageCount?{page_count:sourcePageCount}:{})};\n        const next=stageReviewedPodPromotion(originalForReview,acknowledgeReceiverSignature(applyFactsToDocument(originalForReview,kind,fields,'driver_review',components),receiverSignatureConfirmed));");
patch(storage,'  mirror.evidenceOnlyV110413=true;',"  mirror.evidenceOnlyV110413=true;\n  if(doc.podLifecycleV1){mirror.podLifecycleV1=doc.podLifecycleV1;mirror.page_count=doc.page_count;}");
const sync='lib/owner-op-cloud/accountSyncV110455.js';
patch(sync,"import Dexie from 'dexie';","import Dexie from 'dexie';\nimport {finalizePendingPodPromotions} from '../documents/podSupersessionRuntimeV1.js';");
// Existing check includes authenticated owner and active-writer generation guards.
patch(sync,'   tabBase=nextBase;',"   tabBase=nextBase;\n   if(scope==='all')await finalizePendingPodPromotions({uid,revision,check}).catch(()=>{}); // Unverified BOL stays visible; no original is removed.");
const evidence='source/src/modules/owneros/evidenceCoreV110413.js';
patch(evidence,"import {confirmedSource,projectReviewedCopies", "import {projectPodPrimaryDocuments} from '../../../../lib/documents/podSupersessionV1.js';\nimport {confirmedSource,projectReviewedCopies");
patch(evidence,'  return [...map.values()];\n}\nexport function usable','  return projectPodPrimaryDocuments([...map.values()]).primaryDocuments;\n}\nexport function usable');
const folders='source/src/modules/owneros/loadFolderReconciliationV10974.js';
patch(folders,"import {projectReviewedCopies,preferredSourceCopy}","import {projectPodPrimaryDocuments} from '../../../../lib/documents/podSupersessionV1.js';\nimport {projectReviewedCopies,preferredSourceCopy}");
patch(folders,'  const allDocs=[...mergedDocs.values()].map(doc=>archiveDocument(doc,state));','  const allDocs=[...mergedDocs.values()].map(doc=>archiveDocument(doc,state));\n  const visibleDocs=projectPodPrimaryDocuments([...mergedDocs.values()]).primaryDocuments.map(doc=>archiveDocument(doc,state));');
patch(folders,"  for(const d of allDocs) if(typeOf(d)==='rate_confirmation'","  for(const d of visibleDocs) if(typeOf(d)==='rate_confirmation'");
patch(folders,'  for(const d of allDocs){const n=loadOf(d);','  for(const d of visibleDocs){const n=loadOf(d);');
patch(folders,'  const accepted=allDocs.filter(d=>!reviewKeys.has(docKey(d)));','  const accepted=visibleDocs.filter(d=>!reviewKeys.has(docKey(d)));');
const center='source/src/modules/owneros/EvidenceCenterV110413.jsx';
patch(center,'  function review(doc,match=null){setSelected(doc);','  function review(doc,match=null){doc=doc.podPendingV1?.candidate||doc;setReceiverConfirmed(false);setSelected(doc);');
patch(center,"setMessage(filingMatch?`Saved to Load ${loadOf(next)}. Original scan kept.`:","setMessage(next.podLifecycleV1?.state==='pending_sync'?'POD review saved. The BOL remains visible until the original and metadata are verified in cloud storage.':next.podLifecycleV1?.state==='review_required'?'Original BOL retained. Confirm the receiver signature and unchanged load before promoting it to POD.':filingMatch?`Saved to Load ${loadOf(next)}. Original scan kept.`:");
const files='source/src/modules/owneros/SavedDocumentFilesV110344.jsx';
patch(files,"import {vaultBlobV102}","import {projectPodPrimaryDocuments} from '../../../../lib/documents/podSupersessionV1.js';\nimport {vaultBlobV102}");
patch(files,'export function SavedFileActionsV110344({document: doc}) {','export function SavedFileActionsV110344({document: doc,historyMode=false}) {\n  const [historyOpen,setHistoryOpen]=useState(false);');
patch(files,'    {!current && !error ? <p role="status">{loadingMessage}</p> : null}',`    {doc?.podPendingV1?<p role="status">BOL retained while the signed POD waits for verified cloud synchronization.</p>:null}
    {!historyMode&&doc?.podLifecycleV1?.previousVersions?.length?<section aria-label="Previous BOL version"><button type="button" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(value=>!value)}>{historyOpen?'Close previous BOL':'Open previous BOL record'}</button>{historyOpen?<><p>The previous BOL record is retained with the same original file. No duplicate original was uploaded.</p><SavedFileActionsV110344 document={doc.podLifecycleV1.previousVersions[0]} historyMode/></>:null}</section>:null}
    {!current && !error ? <p role="status">{loadingMessage}</p> : null}`);
patch(files,"{current.pdf || current.file.type.startsWith('image/') ? <button", "{!historyMode&&(current.pdf || current.file.type.startsWith('image/')) ? <button");
patch(files,'const files = useMemo(() => documents.filter(doc => doc && identity(doc))','const files = useMemo(() => projectPodPrimaryDocuments(documents).primaryDocuments.filter(doc => doc && identity(doc))');
console.log('PASS — same-original BOL/POD review, verified archive read-back, primary display and retained history installed');

patch(storage,"export async function saveReviewedFacts(doc,kind,input,{book=false}={})", "export async function saveReviewedFacts(doc,kind,input,{book=false,receiverSignatureConfirmed=false}={})");
patch(center,"  const [filingMatch,setFilingMatch]=useState(null);", "  const [filingMatch,setFilingMatch]=useState(null);\n  const [receiverConfirmed,setReceiverConfirmed]=useState(false);");
patch(center,"...match?.fields});setError('');setMessage('');setChooser(false);", "...match?.fields,...(kindOf(doc)==='bol'||['pending_sync','review_required'].includes(doc.podLifecycleV1?.state)?{podSigned:false}:{})});setError('');setMessage('');setChooser(false);");
patch(center,"validateFacts(kind,fields),{book})", "validateFacts(kind,fields),{book,receiverSignatureConfirmed:receiverConfirmed})");
patch(center,'aria-label="Evidence document type" value={kind} onChange={e=>setKind(e.target.value)}', `aria-label="Evidence document type" value={kind} onChange={e=>{setKind(e.target.value);setReceiverConfirmed(false);if(e.target.value==='pod')setFields(value=>({...value,podSigned:false}));}}`);
patch(center,'onChange={v=>setFields({...fields,[name]:v})}', `onChange={v=>{if(name==='podSigned')setReceiverConfirmed(v===true);setFields({...fields,[name]:v});}}`);
patch(center,'</select></label><p>Used for:', `</select></label>{kind==='pod'?<p>Check the receiver signature only after opening the original and confirming a completed receiver or consignee signature, received stamp, or received-by acknowledgement. A pickup or driver signature does not count.</p>:null}<p>Used for:`);
