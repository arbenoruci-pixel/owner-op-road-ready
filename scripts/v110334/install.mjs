import fs from 'node:fs';
import assert from 'node:assert/strict';
export function installScannerIdentityV110334(){
  const scan='source/src/modules/scan/',read=p=>fs.readFileSync(p,'utf8');
  function patch(path,before,after){const s=read(path);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,'Scanner identity anchor: '+path);fs.writeFileSync(path,s.replace(before,after));}
  for(const [source,target] of [['CameraAdapterV3.jsx','v3/CameraAdapterV3.jsx'],['documentBoundary.js','v3/documentBoundaryV110329.js'],['documentIdentity.js','documentIdentityV110334.js']])fs.copyFileSync('scripts/v110334/'+source,scan+target);
  const css='source/src/command-center.css',styles=read('scripts/v110334/captureFeedback.css');if(!read(css).includes(styles))fs.appendFileSync(css,'\n'+styles+'\n');
  const router=scan+'engines/isolatedDocumentRouterV10959.js';
  const statement="import {decideDocumentIdentity,applyDocumentIdentity} from '../documentIdentityV110334.js';\n";
  if(!read(router).includes(statement))fs.writeFileSync(router,statement+read(router));
  patch(router,'  return qualifyRateConReferenceV11039(qualifyDocumentFieldsV11038(preserveDocumentDecisionV11039(result,enforceStructuralBolV11034)));',`  const qualified=qualifyRateConReferenceV11039(qualifyDocumentFieldsV11038(preserveDocumentDecisionV11039(result,enforceStructuralBolV11034)));
  const identity=decideDocumentIdentity(qualified);
  return applyDocumentIdentity(qualified,identity,truckDocumentTypeMetaV1040,(analysis,type,context)=>qualifyDocumentFieldsV11038(reanalyzeGenericTruckDocumentTypeV1040(analysis,type,context)),options);`);
  const ui=scan+'SmartScanSheetV105.jsx';
  // The review sheet runs an older qualifier after the router. Its broad BOL
  // heuristic must not reverse the page-level unknown/mixed decision.
  patch(scan+'DocumentEvidenceV11036.js','else if(!userSelected&&bolHeader&&shippingSections>=2',
    'else if(!userSelected&&!result.typeEvidenceV110334&&bolHeader&&shippingSections>=2');
  patch(ui,'        {analysis.pageReadingV110328&&<p role="status"',`        {analysis.typeEvidenceV110334?.requiresTypeReview&&(analysis.typeEvidenceV110334.mixedDocuments||!analysis.userSelectedTypeV11036)&&<p role="status" className="scan-type-evidence-v334">{analysis.typeEvidenceV110334.reason}</p>}
        {analysis.pageReadingV110328&&<p role="status"`);
  const matching=scan+'scanLoadAssignmentV11037.js';
  patch(matching,'  const base = matchDocumentToLoadV105({...options,candidateLimit:Infinity});',`  const base = matchDocumentToLoadV105({...options,candidateLimit:Infinity});
  if(options.analysis?.typeEvidenceV110334?.mixedDocuments)return {
    ...base,matched:false,loadNo:'',canonicalLoadId:'',broker:'',stop:null,
    stopSequence:0,score:0,confidence:0,automatic:false,requiresConfirmation:true,
    reason:options.analysis.typeEvidenceV110334.reason,
  };`);
  patch(matching,'  if (preserveChoice) return normalizeCanonicalLoadNoV105(preferredLoadNo);',`  if (preserveChoice) return normalizeCanonicalLoadNoV105(preferredLoadNo);
  if (result.typeEvidenceV110334?.mixedDocuments) return '';`);
}
