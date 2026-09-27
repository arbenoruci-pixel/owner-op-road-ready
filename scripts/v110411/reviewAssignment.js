import {scanWithSourceFields} from '../../../../packages/smart-reader-core/src/scanFields.js';
import {matchScanDocumentToLoadV11037,initialScanLoadV11037} from './scanLoadAssignmentV11037.js';

// Source reading finishes after the first filing form. Re-evaluate only its
// suggestion; an explicit folder choice (including Choose later) is durable.
export function reviewAssignment({analysis,review,typeId,state,businessStore,loadNo='',assignment='unassigned'}){
  if(review?.analysis!==analysis)return null;
  const source=scanWithSourceFields(analysis,review,typeId);
  const result={...source,type:{...source.type,id:typeId}};
  const match=matchScanDocumentToLoadV11037({state,businessStore,typeId,fields:result.fields||{},analysis:{...result,text:[result.text||result.rawText||'',...Object.values(source.fields?.readerSourceFieldsV110393?.fields||{}).flatMap(field=>(field.evidence||[]).map(ref=>ref.quote))].join('\n')}});
  const manual=assignment.startsWith('driver_');
  const attachmentReview=Boolean(result.typeEvidenceV110334?.attachmentReview?.required);
  const selected=manual?loadNo:attachmentReview?'':initialScanLoadV11037(result,match);
  const safeMatch=attachmentReview?{...match,automatic:false,requiresConfirmation:true,reason:result.typeEvidenceV110334.reason||'Check the attached pages before choosing a load folder.'}:match;
  return {match:safeMatch,loadNo:selected,assignment:manual?assignment:selected?(match.source||'document_reference'):'unassigned',
    documentDate:source.fields?.documentDate||source.fields?.date||'',
    stopSequence:selected===match.loadNo?Number(match.stopSequence||0):0};
}
