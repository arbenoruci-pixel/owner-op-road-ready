import {resolveEvidence} from './input.js';

export const READER_ANALYSIS_VERSION = 1;
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const list = value => Array.isArray(value) ? value : [];
const validText = value => typeof value === 'string' && value.trim() !== '';
const stage = (status, reason, extra = {}) => ({status, reason, ...extra});

function fieldProjection(result, group, field) {
  const evidenceValid = ref => {
    try { return group.pageIds.includes(ref.pageId) && !!resolveEvidence(result, ref); } catch { return false; }
  };
  const candidates = list(field.candidates).map(candidate => ({
    value: candidate.value ?? null, rawValue: candidate.rawValue ?? null,
    issue: candidate.issue || null,
    evidence: list(candidate.evidence).filter(evidenceValid).map(copy),
    continuationEvidence: list(candidate.continuationEvidence).filter(evidenceValid).map(copy),
  })).filter(candidate => candidate.evidence.length);
  const sourcePage = field.correction?.sourcePage;
  const sourcePageValid = sourcePage && group.pageIds.includes(sourcePage.pageId)
    && result.pages.some(page => page.id === sourcePage.pageId && page.observations.some(observation => observation.sourceImageId === sourcePage.sourceImageId));
  const correctionEvidence = field.correction?.evidence;
  const confirmed = field.status === 'confirmed' && (sourcePageValid || correctionEvidence && evidenceValid(correctionEvidence));
  const supported = field.status === 'supported' && candidates.some(candidate => candidate.value === field.value);
  const value = (confirmed || supported) && validText(field.value) ? field.value : null;
  return {label:field.label, kind:field.kind, required:Boolean(field.required),
    status:value !== null ? confirmed ? 'confirmed' : 'supported' : field.status === 'missing' ? 'missing' : 'needs_review',
    value, candidates, issues:list(field.issues),
    ...(confirmed ? {confirmation:{...(sourcePageValid ? {sourcePage:copy(sourcePage)} : {}), ...(correctionEvidence && evidenceValid(correctionEvidence) ? {evidence:copy(correctionEvidence)} : {})}} : {}),
  };
}

// One serializable snapshot for preview, explicit save, exports and reopen.
// It is descriptive only: never updates source files, load assignments or records.
// A supported reading is NOT a calibrated probability or human confirmation.
export function createAnalysisProjection({analysis = {}, review, selectedType = '', selectedLoadNo = '', assignment = 'unassigned', source = {}} = {}) {
  const result = review?.analysis === analysis && review.result?.engine === 'owned-smart-reader' ? review.result : null;
  const groups = result ? result.documents.map(group => ({id:group.id, kind:group.kind, label:group.label,
    pageIds:[...group.pageIds], requiresReview:true, canAutoFile:false,
    fields:Object.fromEntries(Object.entries(group.fields || {}).map(([key,field]) => [key,fieldProjection(result,group,field)])),
    boundaryReview:Boolean(group.boundaryReview), checks:copy(group.checks || []),
  })) : [];
  const nativePages = list(analysis.pageReadingV110328?.pages || analysis.pages);
  const pages = result ? result.pages.map(page => {
    const reading = nativePages.find(item => (item.pageNumber || item.number) === page.number || item.id === page.id);
    return {id:page.id, number:page.number, sourceImageIds:[...new Set(page.observations.map(item => item.sourceImageId).filter(Boolean))],
      coverage:copy(reading?.coverage) || {status:page.observations.some(item => item.lines.some(line => line.text.trim())) ? 'observed' : 'unreadable', needsReview:true, reason:'coverage_not_measured'},
    };
  }) : nativePages.map((page,index) => ({id:page.id || `page-${index+1}`,number:page.pageNumber || page.number || index+1,coverage:copy(page.coverage) || {status:'unknown',needsReview:true,reason:'coverage_not_measured'}}));
  const reviewItems = groups.flatMap(group => Object.entries(group.fields).filter(([,field]) => field.status !== 'confirmed' && (field.status === 'needs_review' || field.required && field.status === 'missing')).map(([key,field]) => ({groupId:group.id,field:key,reason:field.status,issues:field.issues})));
  const mixed = groups.filter(group => group.kind !== 'signing_certificate').length > 1 || Boolean(analysis.typeEvidenceV110334?.mixedDocuments);
  return {version:READER_ANALYSIS_VERSION, engine:result?.engine || null, engineVersion:result?.engineVersion || null,
    documentId:result?.documentId || null, revision:result?.reviewRevision || 0,
    source:{...(validText(source.sha256) ? {sha256:source.sha256} : {}), ...(validText(source.fileName) ? {fileName:source.fileName} : {}), immutable:true},
    selection:{type:selectedType || analysis.type?.id || '',loadNo:String(selectedLoadNo || ''),assignment},
    groups,pages,mixed,reviewItems,requiresReview:true,autoFile:false,
    calibration:{status:'not_calibrated',automaticAcceptance:false},
    diagnostics:{localClassification:result ? stage('completed','source_review',{engineVersion:result.engineVersion}) : stage('skipped','source_review_unavailable'),
      localExtraction:result ? stage('completed','typed_source_candidates',{engineVersion:result.engineVersion}) : stage('skipped','source_review_unavailable'),
      ai:{classification:copy(analysis.aiClassification) || stage('skipped','not_run'),extraction:copy(result?.aiExtraction || analysis.aiExtraction) || stage('skipped','not_requested')},
    },
  };
}

// Preserve the exact reviewed snapshot, including unknown fields, across JSON
// storage. Never regenerate it from a later OCR pass or silently pick one packet.
export function readSavedAnalysis(document) {
  const snapshot = document?.extracted?.readerAnalysisV1 || document?.readerAnalysisV1;
  return snapshot?.version === READER_ANALYSIS_VERSION && Array.isArray(snapshot.groups) && Array.isArray(snapshot.pages) && Array.isArray(snapshot.reviewItems)
    && snapshot.groups.every(group=>group && typeof group.id==='string' && group.fields && typeof group.fields==='object' && !Array.isArray(group.fields) && Object.values(group.fields).every(field=>field && typeof field==='object')) ? copy(snapshot) : null;
}

export function analysisWithProjection(analysis, review, selectedType, selectedLoadNo = '', assignment = 'unassigned', projected = analysis) {
  if (!analysis) return analysis;
  const snapshot = createAnalysisProjection({analysis,review,selectedType,selectedLoadNo,assignment});
  return {...projected, fields:{...projected.fields,readerAnalysisV1:snapshot},needsReview:true,routing:{...projected.routing,autoFile:false}};
}
