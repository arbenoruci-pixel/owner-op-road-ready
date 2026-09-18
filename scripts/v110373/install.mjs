import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='source/src/modules/scan/OwnedReaderPreview.jsx';
function patch(before,after){const s=fs.readFileSync(path,'utf8');if(s.includes(after))return;assert.equal(s.split(before).length-1,1,'Reader evidence UI anchor: '+before.slice(0,80));fs.writeFileSync(path,s.replace(before,after));}
patch("import {clearestEvidence,clearestCandidate} from '../../../../packages/smart-reader-core/src/reviewEvidence.js';", "import {clearestEvidence,clearestCandidate} from '../../../../packages/smart-reader-core/src/reviewEvidence.js';\nimport {referenceDiscrepancies} from '../../../../packages/smart-reader-core/src/referenceDiscrepancies.js';");
patch('JSON.stringify(result,null,2)', 'JSON.stringify({...result,referenceWarnings:referenceDiscrepancies(result)},null,2)');
patch('  const queue=reviewQueue(result);', '  const queue=reviewQueue(result);\n  const referenceWarnings=referenceDiscrepancies(result);');
patch('      {group.boundaryReview?<p>Check whether these pages belong together.</p>:null}', `      {group.boundaryReview?<p>Check whether these pages belong together.</p>:null}
      {referenceWarnings.filter(w=>w.groupId===group.id).map((warning,i)=><div key={i} role="alert" className="reader-reference-warning-v373"><p>{warning.message}</p><p><b>{warning.value}</b> versus <b>{warning.expected}</b></p>{warning.status==='confirmed_difference'?<p>You confirmed the different source reference. These documents remain separate.</p>:null}<button type="button" onClick={()=>openItem({groupId:group.id,key:warning.key})}>Check document reference</button></div>)}`);
patch('Object.entries(group.fields).map(([key,field])', 'Object.entries(group.fields).filter(([,field])=>!field.displayWhenFound||field.candidates.length||field.correction).map(([key,field])');
patch('{candidate.rawValue} · Page {e.pageNumber}', "{candidate.continuationKind==='address'&&candidate.value?candidate.value:candidate.rawValue} · Page {e.pageNumber}");
patch("{selection.candidate.continuationKind==='party_block'?'Additional company line:':'Adjacent company suffix:'}", "{selection.candidate.continuationKind==='address'?'Address continuation:':selection.candidate.continuationKind==='party_block'?'Additional company line:':'Adjacent company suffix:'}");
const css='source/src/command-center.css',style='\n/* READER_REFERENCE_WARNING_V110373 */\n.reader-reference-warning-v373{padding:12px;border:1px solid currentColor;border-radius:10px;margin:12px 0;overflow-wrap:anywhere}.reader-reference-warning-v373 button{min-height:44px}\n';
if(!fs.readFileSync(css,'utf8').includes('READER_REFERENCE_WARNING_V110373'))fs.appendFileSync(css,style);
console.log('PASS — Reader shows full addresses, source-backed clauses and explicit reference mismatch review');
const legacyBrowser='scripts/browser-native-pdf-v110363.mjs';
fs.writeFileSync(legacyBrowser,fs.readFileSync(legacyBrowser,'utf8').replaceAll("assert.equal(result.engineVersion,'0.3.17')","assert.equal(result.engineVersion,'0.3.18')"));

// Bind a retained original before extraction so fallback text evidence points
// to the same full page. Never give OCR variants another pass's coordinates.
patch("const documentId=reviewState?.result?.documentId||`review-${crypto.randomUUID()}`,dimensions={},files={};", "const documentId=reviewState?.result?.documentId||`review-${crypto.randomUUID()}`,dimensions={},files={},originalSources={};");
patch('      const next=reviewState?.result||reviewScanAnalysis(analysis,{documentId,dimensions});', `      for(const [index,file]of (analysis.scanMeta?.pageFiles||[]).entries()){
        if(active.current!==generation)return;
        const pageId=\`page-\${index+1}\`,prefix=\`\${documentId}:\${pageId}:\`;
        if(!(file instanceof Blob)||Object.keys(files).some(id=>id.startsWith(prefix)))continue;
        const id=prefix+'original';
        try{await loadImage(file);files[id]=file;originalSources[pageId]=id;}catch{/* Keep text review available when its original cannot be opened. */}
      }
      if(active.current!==generation)return;
      const next=reviewState?.result||reviewScanAnalysis(analysis,{documentId,dimensions,originalSources});`);
const adapter='source/src/modules/scan/ownedReaderAdapter.js';
let adapterSource=fs.readFileSync(adapter,'utf8');
for(const [before,after] of [
  ["{documentId='scan-review',dimensions={}}={}","{documentId='scan-review',dimensions={},originalSources={}}={}"],
  ["observations.push(textObservation(text,{source:analysis.nativeText?'pdf-text-layer':'existing-document-text'}));",`observations.push(textObservation(text,{source:analysis.nativeText?'pdf-text-layer':'existing-document-text'}));
      const originalId=originalSources[id];
      if(typeof originalId==='string'&&originalId===\`\${documentId}:\${id}:original\`)observations[0].sourceImageId=originalId;`]
]){
  if(adapterSource.includes(after))continue;
  assert.equal(adapterSource.split(before).length-1,1,'Original page source adapter anchor');
  adapterSource=adapterSource.replace(before,after);
}
fs.writeFileSync(adapter,adapterSource);
