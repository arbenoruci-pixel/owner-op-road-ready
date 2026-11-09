import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='source/src/modules/scan/';
function patch(path,before,after){const text=fs.readFileSync(path,'utf8');if(text.includes(after))return;assert.equal(text.split(before).length,2,'Automatic reader anchor: '+path+' '+before.slice(0,90));fs.writeFileSync(path,text.replace(before,after));}
fs.copyFileSync('scripts/reader-auto/SmartReading.jsx',root+'SmartReadingV1104118.jsx');
patch(root+'CompactReadingV1104101.jsx','onKind,suggestion})','onKind,suggestion,autoRead=true})');
patch(root+'CompactReadingV1104101.jsx','if(!cancelled&&canRead&&!disabled','if(!cancelled&&autoRead&&canRead&&!disabled');
patch(root+'CompactReadingV1104101.jsx','group.kind,page?.id,canRead]);','group.kind,page?.id,canRead,autoRead]);');
patch(root+'OwnedReaderPreview.jsx',"import CompactReading from './CompactReadingV1104101.jsx';","import CompactReading from './SmartReadingV1104118.jsx';");
patch(root+'readerAiFallbackV110398.js',"import {createAiFallback}","import {createAutomaticReader} from '../../../../lib/reader-ai/read.js';\nimport {createAiFallback}");
patch(root+'readerAiFallbackV110398.js','export const extractDocumentFields = createAiExtraction({',`export const readDocumentAutomatically = createAutomaticReader({
  identify:reviewScanAnalysis,sources:aiPageSources,prepare:prepareAiPage,
  session:signal=>withAbort(import('../../../../lib/owner-op-cloud/client.js').then(({cloudSession})=>cloudSession()),signal),
  online:()=>typeof navigator!=='undefined'&&navigator.onLine!==false,
});
export const extractDocumentFields = createAiExtraction({`);
const file=root+'SmartScanSheetV105.jsx';
patch(file,'        retainPageSourcesV110347:true,','        retainPageSourcesV110347:true,\n        automaticReading:true,');
patch(file,"import React, { useEffect", "import {automaticFolder,automaticPayloadMatches} from '../../../../lib/reader-ai/automatic.js';\nimport React, { useEffect");
patch(file,'  buildVaultDocumentV105,','  buildVaultDocumentV105,\n  documentFolderV105,');
patch(file,'  const needsReview = Boolean(',`  const machineProof=readerReviewV110345?.result?.automaticReading;
  const readingReady=Boolean(machineProof?.ready&&machineProof.revision===readerReviewV110345.result.reviewRevision&&machineProof.filingType===selectedType&&automaticPayloadMatches(readerReviewV110345.result,scanWithSourceFields(analysis,readerReviewV110345,selectedType),selectedType));
  const needsReview = Boolean(!readingReady && (`);
patch(file,'|| requiresLoad && !selectedLoadNo || !documentDate);','|| requiresLoad && !selectedLoadNo || !documentDate) || requiresLoad && !selectedLoadNo || !documentDate);');
patch(file,"    const refreshed=reviewAssignment(","    let refreshed=reviewAssignment(");
patch(file,'    if(!refreshed)return;',`    if(value.result?.automaticReading?.ready){
      const automatic=automaticFolder(value.result,collectLoadCandidatesV105(state,migrateBusinessStoreV105(readBusinessStore(),state)));
      if(!loadDocumentType(typeId))refreshed={match:null,loadNo:'',assignment:'unassigned',documentDate:value.result.automaticReading.date,stopSequence:0};
      else if(automatic&&!loadSelectionSourceV11037.startsWith('driver_'))refreshed={match:automatic,loadNo:automatic.loadNo,assignment:automatic.source,documentDate:value.result.automaticReading.date,stopSequence:0};
      else if(refreshed)refreshed={...refreshed,documentDate:value.result.automaticReading.date};
      setLinkToLogbook(false);
    }
    if(!refreshed)return;`);
patch(file,'  const filingSelectedLoadNo=selectedLoadNo;',`  const autoSaveAttempts=useRef(new Set());
  useEffect(()=>{
    if(stage!=='confirm'||!readingReady||!file||riskBlocked||resumeDocumentIdV110312||analysis?.resumedRecordV110318
      ||typeChosenByDriver.current||dateChosenByDriverV110411.current||loadSelectionSourceV11037.startsWith('driver_')
      ||requiresLoad&&(!selectedLoadNo||match?.source!=='machine_verified_reference')||!documentDate)return;
    const key=machineProof.documentId+':'+machineProof.revision;
    if(autoSaveAttempts.current.has(key))return;
    autoSaveAttempts.current.add(key);void save(true);
  },[stage,readingReady,file,selectedType,selectedLoadNo,documentDate,loadSelectionSourceV11037,riskBlocked]);
  const scanLogbookLink=linkToLogbook;
  const filingSelectedLoadNo=selectedLoadNo;`);
patch(file,'  async function save() {','  async function save(automatic = false) {\n    const automaticSave=automatic===true;\n    const linkToLogbook=automaticSave?false:scanLogbookLink;');
patch(file,'      const meta = selectedMeta;',`      const meta = selectedMeta;
      if(automaticSave){
        const fresh=automaticFolder(readerReviewV110345?.result,collectLoadCandidatesV105(state,currentStore));
        if(!automaticPayloadMatches(readerReviewV110345?.result,sourceAnalysisV110393,selectedType))throw new Error('The checked details did not reach this document. Read the original again.');
        if(!readingReady||requiresLoad&&fresh?.loadNo!==filingSelectedLoadNo)throw new Error('The folder changed. Choose the correct folder.');
        const bytes=await file.arrayBuffer(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
        if((currentStore.documents||[]).some(d=>d.sha256===digest))throw new Error('This original is already saved. Its existing record was kept.');
      }`);
patch(file,'      Object.assign(mergedFields,shipmentFields);',`      Object.assign(mergedFields,shipmentFields);
      if(automaticSave)mergedFields.automaticFilingV1={...machineProof,loadNo:selectedLoadNo,confirmationOrigin:'machine',linkToLogbook:false};`);
patch(file,'      storageFieldsV10964.readerAnalysisV1=',`      if(automaticSave)storageFieldsV10964.automaticFilingV1=mergedFields.automaticFilingV1;
      storageFieldsV10964.readerAnalysisV1=`);
patch(file,'        userConfirmed:true,','        userConfirmed:!automaticSave,');
patch(file,'      Object.assign(record,shipmentFields);',`      Object.assign(record,shipmentFields);
      if(automaticSave){
        record.status='verified';record.reviewStatus='verified';record.confirmationOrigin='machine';
        record.folder=documentFolderV105(meta.id,{canonicalLoadNo:selectedLoadNo,status:'verified',automaticFilingV1:storageFieldsV10964.automaticFilingV1});
        if(machineProof.kind==='invoice')record.label='Invoice';
        record.automaticFilingV1=storageFieldsV10964.automaticFilingV1;
        record.auditTrail.push({id:'auto_'+Date.now(),action:'automatically_filed',at:Date.now(),source:'verified_reader_v1',detail:'Checked original and filed to '+(selectedLoadNo||record.folder)});
      }`);
patch(file,'      const savedViewV10964 = savedViewModelV10964({ record, meta, stored });',`      const savedViewV10964 = savedViewModelV10964({ record, meta, stored });
      if(automaticSave){savedViewV10964.record.automaticFilingV1=record.automaticFilingV1;if(machineProof.kind==='invoice')savedViewV10964.meta.label='Invoice';}`);
patch(file,"{saved.record.instructionGuideId ? 'DOCUMENT AND GUIDE SAVED' : 'DOCUMENT SAVED'}","{saved.record.automaticFilingV1 ? 'READ, CHECKED AND FILED' : saved.record.instructionGuideId ? 'DOCUMENT AND GUIDE SAVED' : 'DOCUMENT SAVED'}");
// Generic supplier invoices retain their existing `other` storage type. Only
// newly verified machine readings get a ready Documents destination.
patch(root+'smartScanRoutingV11039.js',"  if (record.status === 'needs_review' || typeId === 'other' ||",`  if(typeId==='other'&&record.status==='verified'&&record.automaticFilingV1?.ready&&record.automaticFilingV1.kind==='invoice'&&record.automaticFilingV1.confirmationOrigin==='machine')return 'documents';
  if (record.status === 'needs_review' || typeId === 'other' ||`);
patch('app/api/reader/classify/route.js','export const maxDuration = 30;','export const maxDuration = 60;');
console.log('PASS — automatic image verification and unique-folder filing installed');
